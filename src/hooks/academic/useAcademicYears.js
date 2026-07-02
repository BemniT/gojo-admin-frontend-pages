import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { BACKEND_BASE } from "../../config.js";

const API_BASE = `${BACKEND_BASE}/api`;
const ACADEMIC_YEARS_CACHE_TTL_MS = 60 * 1000;
const YEAR_HISTORY_CACHE_PREFIX = "academic-year-history:v2:";

const academicYearsCacheKey = (schoolCode) =>
  schoolCode ? `academic-years:v2:${schoolCode}` : "academic-years:v2";

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
    // Ignore quota / serialization errors.
  }
};

/** Best-effort cache invalidation when years change (activate / archive). */
const clearCachesForSchool = (schoolCode) => {
  if (!schoolCode) return;
  try {
    Object.keys(sessionStorage).forEach((key) => {
      if (
        key === academicYearsCacheKey(schoolCode) ||
        key.startsWith(`${YEAR_HISTORY_CACHE_PREFIX}${schoolCode}:`)
      ) {
        sessionStorage.removeItem(key);
      }
    });
  } catch {
    // Ignore.
  }
};

/**
 * useAcademicYears
 *
 * Manages the list of academic years for a school plus the activate/archive
 * actions. UI-side concerns (confirm dialog, toast feedback) are surfaced
 * via callback props so the hook itself stays decoupled from any specific
 * notification component.
 */
export function useAcademicYears({ schoolCode, requestConfirm, notify }) {
  const [academicYears, setAcademicYears] = useState({});
  const [currentAcademicYear, setCurrentAcademicYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const safeNotify = useCallback(
    (tone, message) => {
      if (typeof notify === "function") notify({ tone, message });
    },
    [notify]
  );

  const reportError = useCallback(
    (error, fallback) => {
      const message = error?.response?.data?.message || error?.message || fallback;
      safeNotify("error", message);
    },
    [safeNotify]
  );

  const fetchAcademicYears = useCallback(async () => {
    if (!schoolCode) {
      safeNotify("error", "Missing schoolCode in session. Please log in again.");
      return;
    }

    const cacheKey = academicYearsCacheKey(schoolCode);
    const cached = readSessionCache(cacheKey, ACADEMIC_YEARS_CACHE_TTL_MS);
    if (cached) {
      setAcademicYears(cached.academicYears || {});
      setCurrentAcademicYear(cached.currentAcademicYear || "");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/academic-years`, {
        params: { schoolCode },
        timeout: 12000,
      });
      const years = res?.data?.academicYears || {};
      const current = res?.data?.currentAcademicYear || "";
      setAcademicYears(years);
      setCurrentAcademicYear(current);
      writeSessionCache(cacheKey, { academicYears: years, currentAcademicYear: current });
    } catch (err) {
      reportError(err, "Failed to load academic years.");
    } finally {
      setLoading(false);
    }
  }, [schoolCode, safeNotify, reportError]);

  useEffect(() => {
    fetchAcademicYears();
  }, [fetchAcademicYears]);

  const performAction = useCallback(
    async (yearKey, action) => {
      if (!schoolCode || !yearKey || !action) return;
      setWorking(true);
      try {
        const res = await axios.post(`${API_BASE}/academic-years/${action}`, {
          schoolCode,
          yearKey,
        });
        clearCachesForSchool(schoolCode);
        safeNotify("success", res.data?.message || `Academic year ${action}d.`);
        await fetchAcademicYears();
      } catch (err) {
        reportError(err, `Failed to ${action} academic year.`);
      } finally {
        setWorking(false);
      }
    },
    [schoolCode, fetchAcademicYears, safeNotify, reportError]
  );

  const activateYear = useCallback(
    (yearKey) => {
      const label = yearKey?.replace?.("_", "/") || yearKey;
      const run = () => performAction(yearKey, "activate");
      if (typeof requestConfirm === "function") {
        requestConfirm({
          message: `Set ${label} as the current academic year?`,
          onConfirm: run,
        });
      } else {
        run();
      }
    },
    [performAction, requestConfirm]
  );

  const archiveYear = useCallback(
    (yearKey) => {
      const label = yearKey?.replace?.("_", "/") || yearKey;
      const run = () => performAction(yearKey, "archive");
      if (typeof requestConfirm === "function") {
        requestConfirm({
          message: `Archive ${label}?`,
          onConfirm: run,
        });
      } else {
        run();
      }
    },
    [performAction, requestConfirm]
  );

  // Derived: sorted [yearKey, payload] tuples + counts
  const yearRows = useMemo(
    () =>
      Object.entries(academicYears || {}).sort((a, b) => b[0].localeCompare(a[0])),
    [academicYears]
  );

  const stats = useMemo(() => {
    let activeCount = 0;
    let archivedCount = 0;
    let inactiveCount = 0;
    yearRows.forEach(([, row]) => {
      const status = String(row?.status || "inactive");
      if (status === "active") activeCount += 1;
      else if (status === "archived") archivedCount += 1;
      else inactiveCount += 1;
    });
    return {
      totalYears: yearRows.length,
      activeCount,
      archivedCount,
      inactiveCount,
    };
  }, [yearRows]);

  return {
    academicYears,
    currentAcademicYear,
    yearRows,
    stats,
    loading,
    working,
    fetchAcademicYears,
    activateYear,
    archiveYear,
  };
}
