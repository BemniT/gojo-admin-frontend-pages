import { useCallback, useMemo, useState } from "react";
import axios from "axios";
import { BACKEND_BASE } from "../../config.js";

const API_BASE = `${BACKEND_BASE}/api`;
const YEAR_HISTORY_CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_PREFIX = "academic-year-history:v2:";

const cacheKey = (schoolCode, yearKey) => `${CACHE_PREFIX}${schoolCode}:${yearKey}`;

const readSessionCache = (key, ttlMs) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > ttlMs) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
};

const writeSessionCache = (key, data) => {
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Ignore.
  }
};

const getSafeImageUrl = (value, fallback = "/default-profile.png") => {
  const v = String(value || "").trim();
  if (!v) return fallback;
  const lower = v.toLowerCase();
  if (lower.startsWith("file://") || lower.startsWith("content://")) return fallback;
  return v;
};

const normalizeStudent = (raw) => {
  const student = raw || {};
  const basicInfo = student.basicStudentInformation || {};
  return {
    studentId: student.studentId || "",
    ...student,
    grade: student.grade || basicInfo.grade || "",
    section: student.section || basicInfo.section || "",
    name:
      student.name ||
      basicInfo.name ||
      [basicInfo.firstName, basicInfo.middleName, basicInfo.lastName].filter(Boolean).join(" ") ||
      "Student",
    profileImage: getSafeImageUrl(student.profileImage || basicInfo.studentPhoto),
    email: student.email || basicInfo.email || "",
  };
};

/**
 * useYearHistoryStudents
 *
 * Manages browsing students that were enrolled in a specific past academic year.
 * Handles fetching (with cache), in-memory search, grade/section filtering,
 * and the currently-selected student for detail viewing.
 */
export function useYearHistoryStudents({ schoolCode, notify }) {
  const [selectedYear, setSelectedYear] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("All");
  const [selectedSection, setSelectedSection] = useState("All");
  const [selectedStudent, setSelectedStudent] = useState(null);

  const resetFilters = useCallback(() => {
    setSearch("");
    setSelectedGrade("All");
    setSelectedSection("All");
    setSelectedStudent(null);
  }, []);

  const closeYear = useCallback(() => {
    setSelectedYear("");
    setStudents([]);
    resetFilters();
  }, [resetFilters]);

  const openYear = useCallback(
    async (yearKey) => {
      if (!yearKey) return;
      // Toggle off if already open
      if (selectedYear === yearKey) {
        closeYear();
        return;
      }

      setSelectedYear(yearKey);
      resetFilters();

      if (!schoolCode) return;

      const key = cacheKey(schoolCode, yearKey);
      const cached = readSessionCache(key, YEAR_HISTORY_CACHE_TTL_MS);
      if (cached) {
        setStudents(cached);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/academic-years/history-students`, {
          params: { schoolCode, yearKey },
          timeout: 12000,
        });
        const list = (res?.data?.students || []).map(normalizeStudent);
        writeSessionCache(key, list);
        setStudents(list);
      } catch (err) {
        const message = err?.response?.data?.message || err?.message || "Failed to load YearHistory students.";
        if (typeof notify === "function") notify({ tone: "error", message });
        setStudents([]);
      } finally {
        setLoading(false);
      }
    },
    [schoolCode, selectedYear, resetFilters, closeYear, notify]
  );

  // ---- Derived filters ----
  const gradeOptions = useMemo(() => {
    const values = new Set(
      students.map((row) => String(row?.grade || "").trim()).filter(Boolean)
    );
    return [
      "All",
      ...Array.from(values).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      ),
    ];
  }, [students]);

  const sectionOptions = useMemo(() => {
    const filteredByGrade = students.filter((row) => {
      if (selectedGrade === "All") return true;
      return String(row?.grade || "").trim() === selectedGrade;
    });
    const values = new Set(
      filteredByGrade.map((row) => String(row?.section || "").trim()).filter(Boolean)
    );
    return [
      "All",
      ...Array.from(values).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      ),
    ];
  }, [students, selectedGrade]);

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((row) => {
      const grade = String(row?.grade || "").trim();
      const section = String(row?.section || "").trim();
      const name = String(row?.name || "").toLowerCase();
      const studentId = String(row?.studentId || "").toLowerCase();

      if (selectedGrade !== "All" && grade !== selectedGrade) return false;
      if (selectedSection !== "All" && section !== selectedSection) return false;

      if (!query) return true;
      return (
        name.includes(query) ||
        studentId.includes(query) ||
        grade.toLowerCase().includes(query) ||
        section.toLowerCase().includes(query)
      );
    });
  }, [students, search, selectedGrade, selectedSection]);

  // When user changes grade, reset section to All
  const setSelectedGradeAndResetSection = useCallback((grade) => {
    setSelectedGrade(grade);
    setSelectedSection("All");
  }, []);

  return {
    selectedYear,
    students,
    loading,
    search,
    setSearch,
    selectedGrade,
    setSelectedGrade: setSelectedGradeAndResetSection,
    selectedSection,
    setSelectedSection,
    gradeOptions,
    sectionOptions,
    visibleStudents,
    selectedStudent,
    setSelectedStudent,
    openYear,
    closeYear,
  };
}
