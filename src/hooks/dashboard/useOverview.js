import { useMemo } from "react";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { FIREBASE_DATABASE_URL } from "../../config.js";

const DB_URL = FIREBASE_DATABASE_URL;
const STALE_TIME_MS = 5 * 60 * 1000;
const CACHE_TIME_MS = 10 * 60 * 1000;
const STUDENT_FETCH_LIMIT = 1000;
const FULL_SCHOOL_CODE_CACHE_KEY = "overview_resolved_school_code_v1";

/**
 * Resolve a short school code (e.g. "GMI") to its full Firebase key
 * (e.g. "ET-ORO-ADA-GMI") by reading the shallow Platform1/Schools index.
 * Caches the result in sessionStorage so subsequent loads are instant.
 */
async function resolveFullSchoolCode(shortCode) {
  const code = String(shortCode || "").trim();
  if (!code) return "";

  // Already fully qualified — keys always contain a hyphen.
  if (code.includes("-")) return code;

  // Check session cache so we don't re-fetch the schools index on every page load.
  try {
    const cached = JSON.parse(sessionStorage.getItem(FULL_SCHOOL_CODE_CACHE_KEY) || "{}");
    if (cached[code]) return cached[code];
  } catch {}

  try {
    const res = await axios.get(`${DB_URL}/Platform1/Schools.json`, {
      params: { shallow: true },
      timeout: 4000,
    });
    const schoolKeys = Object.keys(res.data || {});
    const lowerShort = code.toLowerCase();
    const match =
      schoolKeys.find((key) => key.toLowerCase().endsWith(`-${lowerShort}`)) ||
      schoolKeys.find((key) => key.toLowerCase() === lowerShort) ||
      "";

    if (match) {
      try {
        const cache = JSON.parse(sessionStorage.getItem(FULL_SCHOOL_CODE_CACHE_KEY) || "{}");
        cache[code] = match;
        sessionStorage.setItem(FULL_SCHOOL_CODE_CACHE_KEY, JSON.stringify(cache));
      } catch {}
      return match;
    }
  } catch {
    // Fall through to using the short code (will likely return empty data).
  }

  return code;
}

const isFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric);
};

/**
 * useOverview
 *
 * Fetches the operational snapshot needed by the admin Overview page and
 * derives summary statistics (gender split, grade analytics, registration trend).
 *
 * Direct Firebase reads here go through the axios school-scope interceptor in
 * `utils/schoolDbRouting.js`, which rewrites every URL to
 * `/Platform1/Schools/{activeSchoolCode}/...`.
 *
 * Phase B note: these endpoints should eventually move behind the backend so
 * Firebase security rules can deny client-side reads completely.
 */
/**
 * Reads a list-style node, falling back to a secondary path if the first
 * returns empty. Schools structure data inconsistently — some have a
 * lightweight `/StudentDirectory` summary, others only have the full
 * `/Students` records. Same story for parents.
 */
async function readWithFallback(primaryUrl, fallbackUrl, queryParams = {}) {
  try {
    const primary = await axios.get(primaryUrl, { params: queryParams });
    if (primary?.data && Object.keys(primary.data).length > 0) {
      return primary.data;
    }
  } catch {
    // Primary failed (404, permission, etc.) — try fallback
  }
  try {
    const fallback = await axios.get(fallbackUrl, { params: queryParams });
    return fallback?.data || {};
  } catch {
    return {};
  }
}

/**
 * Shallow count helper — try `${path}.json?shallow=true` first; if empty,
 * try the fallback path. Returns the count of top-level keys.
 */
async function shallowCount(primaryUrl, fallbackUrl) {
  const data = await readWithFallback(primaryUrl, fallbackUrl, { shallow: true });
  return Object.keys(data || {}).length;
}

export function useOverview(schoolCode) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["overview", schoolCode, "v3"],
    queryFn: async () => {
      // The localStorage admin.schoolCode is often the short form (e.g. "GMI"),
      // but Firebase keys use the fully qualified form ("ET-ORO-ADA-GMI").
      // Resolve before hitting Firebase, otherwise we'd read from
      // /Platform1/Schools/GMI/... which doesn't exist.
      const resolvedCode = await resolveFullSchoolCode(schoolCode);
      const encodedCode = encodeURIComponent(resolvedCode);

      // We build the full /Platform1/Schools/{code}/... path explicitly.
      // Since it already starts with /Platform1/, the school-scope axios
      // interceptor short-circuits and leaves the URL alone.
      const base = `${DB_URL}/Platform1/Schools/${encodedCode}`;

      // Run all three lookups in parallel.
      // Students: try lightweight StudentDirectory first, fall back to full Students.
      // Parents:  try lightweight ParentDirectory first, fall back to full Parents.
      // Posts:    just a shallow count.
      const [studentsData, parentsCount, postsCount] = await Promise.all([
        readWithFallback(
          `${base}/StudentDirectory.json`,
          `${base}/Students.json`,
          { orderBy: `"$key"`, limitToFirst: STUDENT_FETCH_LIMIT }
        ),
        shallowCount(`${base}/ParentDirectory.json`, `${base}/Parents.json`),
        shallowCount(`${base}/Posts.json`, `${base}/Posts.json`),
      ]);

      const studentRows = Object.entries(studentsData).map(([id, student]) => ({
        studentId: id,
        userId: student?.userId || id,
        name: student?.name || student?.username || "Unknown",
        grade: student?.grade || "-",
        section: student?.section || "",
        gender: student?.gender || "",
        status: student?.status || (student?.isActive === false ? "inactive" : "active"),
        profileImage: student?.profileImage || "",
        createdAt: student?.createdAt || student?.registeredAt || student?.admissionDate || student?.updatedAt || "",
      }));

      return {
        students: studentRows,
        parentsCount,
        postsCount,
        resolvedSchoolCode: resolvedCode,
      };
    },
    enabled: Boolean(schoolCode),
    staleTime: STALE_TIME_MS,
    cacheTime: CACHE_TIME_MS,
  });

  const students = data?.students || [];
  const parentsCount = data?.parentsCount || 0;
  const postsCount = data?.postsCount || 0;

  const summary = useMemo(() => {
    const totalStudents = students.length;
    const activeStudents = students.filter((s) => s.status !== "inactive").length;
    const inactiveStudents = totalStudents - activeStudents;
    const maleCount = students.filter((s) =>
      ["male", "m", "boy"].includes(String(s.gender || "").toLowerCase())
    ).length;
    const femaleCount = students.filter((s) =>
      ["female", "f", "girl"].includes(String(s.gender || "").toLowerCase())
    ).length;

    const gradeCounts = {};
    students.forEach((s) => {
      const gradeKey = String(s.grade || "-");
      gradeCounts[gradeKey] = (gradeCounts[gradeKey] || 0) + 1;
    });

    const gradeAnalytics = Object.entries(gradeCounts)
      .map(([grade, count]) => ({ grade, count }))
      .sort((first, second) => {
        const firstNum = Number(first.grade);
        const secondNum = Number(second.grade);
        const firstIsNum = isFiniteNumber(first.grade);
        const secondIsNum = isFiniteNumber(second.grade);
        if (firstIsNum && secondIsNum) return firstNum - secondNum;
        if (firstIsNum) return -1;
        if (secondIsNum) return 1;
        return String(first.grade).localeCompare(String(second.grade));
      });

    const maxGradeCount = gradeAnalytics.reduce(
      (maxValue, row) => Math.max(maxValue, Number(row.count || 0)),
      0
    );

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const thisMonthRegistrations = students.filter((student) => {
      if (!student.createdAt) return false;
      const registeredDate = new Date(student.createdAt);
      if (Number.isNaN(registeredDate.getTime())) return false;
      return (
        registeredDate.getMonth() === currentMonth &&
        registeredDate.getFullYear() === currentYear
      );
    });

    const recentStudents = [...thisMonthRegistrations].sort((a, b) => {
      const x = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const y = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return y - x;
    });

    const thisMonthRegistrationRate = totalStudents
      ? Math.round((thisMonthRegistrations.length / totalStudents) * 100)
      : 0;

    // Build the last-6-months trend buckets
    const monthlyTrendMap = new Map();
    const monthlyTrend = [];
    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(currentYear, currentMonth - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleDateString(undefined, { month: "short" });
      const bucket = { key, label, count: 0 };
      monthlyTrend.push(bucket);
      monthlyTrendMap.set(key, bucket);
    }

    students.forEach((student) => {
      if (!student.createdAt) return;
      const registeredDate = new Date(student.createdAt);
      if (Number.isNaN(registeredDate.getTime())) return;
      const key = `${registeredDate.getFullYear()}-${String(registeredDate.getMonth() + 1).padStart(2, "0")}`;
      const target = monthlyTrendMap.get(key);
      if (target) target.count += 1;
    });

    const monthlyTrendMax = monthlyTrend.reduce(
      (maxValue, row) => Math.max(maxValue, Number(row.count || 0)),
      0
    );

    return {
      totalStudents,
      activeStudents,
      inactiveStudents,
      maleCount,
      femaleCount,
      gradeAnalytics,
      maxGradeCount,
      recentStudents,
      thisMonthRegistrationCount: thisMonthRegistrations.length,
      thisMonthRegistrationRate,
      monthlyTrend,
      monthlyTrendMax,
    };
  }, [students]);

  return {
    students,
    parentsCount,
    postsCount,
    summary,
    loading: isLoading,
    error: isError,
    refetch,
  };
}
