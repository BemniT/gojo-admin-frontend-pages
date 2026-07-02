import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { schoolNodeBase } from "../../utils/schoolDbRouting";
import { readCachedJson, writeCachedJson } from "../../utils/rtdbCache";
import { mapInBatches } from "../../utils/chatRtdb";

const PAGE_SIZE = 50;
const DEFAULT_STUDENT_PROFILE_IMAGE = "/default-profile.png";

/**
 * useStudentsList
 *
 * Owns the Students page's "list" data layer: cache + bootstrap, React Query
 * fetch with fallback (StudentDirectory → Students → Users hydration),
 * paginated load-more, and the derived filter views
 * (`filteredStudentsBase`, `currentYearStudents`, `lastYearStudents`).
 *
 * The page still owns UI state (selectedGrade, selectedSection, searchTerm)
 * so the hook stays decoupled from view concerns — they're passed in.
 * `setSelectedGrade` is also passed so the queryFn can reset stale grade
 * selections when the grade options change.
 *
 * Returned setters (setStudents, setGradeOptions, setCurrentAcademicYear)
 * + `writeStudentsCache` / `writeStudentDirectoryEntryToCache` are exposed
 * so the page's existing handlers (toggle-active, profile-edit) can keep
 * doing optimistic updates without moving into this hook.
 */
export default function useStudentsList({
  schoolCode,
  apiBase,
  loadingFinance,
  selectedGrade,
  setSelectedGrade,
  selectedSection,
  searchTerm,
}) {
  const DB_URL = schoolNodeBase(schoolCode);
  const STUDENTS_CACHE_KEY = `students_page_cache_${schoolCode || "global"}`;
  const STUDENT_DIRECTORY_URL = `${DB_URL}/StudentDirectory.json`;

  // ---------------- INTERNAL HELPERS ----------------
  const isValidGradeKey = (value) => {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 1 && numeric <= 12;
  };

  const normalizeAcademicYear = (value) => String(value || "").trim().replace(/\//g, "_");

  const isWebImageUrl = (value) => {
    const normalized = String(value || "").trim();
    return /^https?:\/\//i.test(normalized) || /^data:image\//i.test(normalized) || /^blob:/i.test(normalized) || normalized.startsWith("/");
  };

  const isPlaceholderProfileImage = (value) => String(value || "").trim() === DEFAULT_STUDENT_PROFILE_IMAGE;

  const getSafeImage = (...candidates) => {
    for (const candidate of candidates) {
      if (!candidate) continue;
      const normalized = String(candidate).trim();
      if (isWebImageUrl(normalized)) return normalized;
    }
    return DEFAULT_STUDENT_PROFILE_IMAGE;
  };

  const hasDatabaseProfileImage = (value) => {
    const normalized = String(value || "").trim();
    return Boolean(normalized && isWebImageUrl(normalized) && !isPlaceholderProfileImage(normalized));
  };

  const normalizeStudentSummary = (studentId, student = {}) => ({
    studentId: String(student?.studentId || studentId || "").trim(),
    userId: String(student?.userId || "").trim(),
    name:
      String(student?.name || "").trim() ||
      String(student?.studentName || "").trim() ||
      "No Name",
    profileImage: getSafeImage(
      student?.profileImage,
      student?.basicStudentInformation?.studentPhoto,
      student?.studentPhoto
    ),
    grade: String(student?.grade || student?.basicStudentInformation?.grade || "").trim(),
    section: String(student?.section || student?.basicStudentInformation?.section || "").trim(),
    academicYear: String(student?.academicYear || student?.basicStudentInformation?.academicYear || "").trim(),
    email: String(student?.email || "").trim(),
    isActive: student?.isActive !== false,
  });

  const readSchoolNodeApi = async (path, fallbackValue = {}) => {
    const effectiveSchoolCode = String(schoolCode || "").trim();
    if (!effectiveSchoolCode) return fallbackValue;
    try {
      const response = await axios.get(`${apiBase}/school-node-read`, {
        params: { schoolCode: effectiveSchoolCode, path },
        timeout: 12000,
      });
      const data = response?.data?.data;
      return data === null || data === undefined ? fallbackValue : data;
    } catch {
      return fallbackValue;
    }
  };

  const hydrateMissingStudentProfileImages = async (studentList = []) => {
    if (!Array.isArray(studentList) || studentList.length === 0) return [];

    return mapInBatches(studentList, 8, async (studentItem) => {
      if (hasDatabaseProfileImage(studentItem?.profileImage)) return studentItem;

      let userRecord = {};
      if (studentItem?.userId) {
        userRecord = await readSchoolNodeApi(`Users/${studentItem.userId}`, {});
      }

      let nextProfileImage = getSafeImage(userRecord?.profileImage, studentItem?.profileImage);
      let studentRecord = {};

      if (!hasDatabaseProfileImage(nextProfileImage) && studentItem?.studentId) {
        studentRecord = await readSchoolNodeApi(`Students/${studentItem.studentId}`, {});

        nextProfileImage = getSafeImage(
          studentRecord?.profileImage,
          studentRecord?.basicStudentInformation?.studentPhoto,
          studentRecord?.studentPhoto,
          userRecord?.profileImage,
          studentItem?.profileImage
        );
      }

      if (!hasDatabaseProfileImage(nextProfileImage)) return studentItem;

      return {
        ...studentItem,
        name:
          String(userRecord?.name || userRecord?.username || studentRecord?.name || studentRecord?.basicStudentInformation?.studentFullName || "").trim() ||
          studentItem.name,
        email: userRecord?.email || studentRecord?.email || studentItem.email || "",
        profileImage: nextProfileImage,
      };
    });
  };

  // ---------------- CACHE HELPERS ----------------
  const readStudentsCache = () => {
    try {
      const rawSession = sessionStorage.getItem(STUDENTS_CACHE_KEY);
      const rawLocal = localStorage.getItem(STUDENTS_CACHE_KEY);
      const parsed = JSON.parse(rawSession || rawLocal || "null");
      if (!parsed || typeof parsed !== "object") return null;

      const cachedAt = Number(parsed.cachedAt || 0);
      if (!cachedAt || Date.now() - cachedAt > 10 * 60 * 1000) return null;

      if (!rawSession && rawLocal) {
        sessionStorage.setItem(STUDENTS_CACHE_KEY, rawLocal);
      }

      return parsed;
    } catch {
      return null;
    }
  };

  const writeStudentsCache = (payload) => {
    try {
      const serialized = JSON.stringify({ ...(payload || {}), cachedAt: Date.now() });
      sessionStorage.setItem(STUDENTS_CACHE_KEY, serialized);
      localStorage.setItem(STUDENTS_CACHE_KEY, serialized);
    } catch {
      // ignore cache write failures
    }
  };

  const writeStudentDirectoryEntryToCache = (studentId, updater) => {
    if (!studentId) return;

    const currentDirectory = readCachedJson(STUDENT_DIRECTORY_URL, { ttlMs: 15 * 60 * 1000 });
    if (!currentDirectory || typeof currentDirectory !== "object") return;

    const previousEntry = currentDirectory[studentId] || {};
    writeCachedJson(STUDENT_DIRECTORY_URL, {
      ...currentDirectory,
      [studentId]:
        typeof updater === "function"
          ? updater(previousEntry)
          : { ...previousEntry, ...(updater || {}) },
    });
  };

  // ---------------- STATE ----------------
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [gradeOptions, setGradeOptions] = useState([]);
  const [currentAcademicYear, setCurrentAcademicYear] = useState("");
  const [paginationCursor, setPaginationCursor] = useState(null);
  const [hasMoreStudents, setHasMoreStudents] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // persistStudentList must be defined after setStudents/writeStudentsCache
  // closes over current gradeOptions/currentAcademicYear unless overridden.
  const persistStudentList = (studentList, nextGradeOptions = gradeOptions, nextCurrentAcademicYear = currentAcademicYear) => {
    setStudents(studentList);
    writeStudentsCache({
      studentList,
      gradeOptions: Array.isArray(nextGradeOptions) ? nextGradeOptions : [],
      currentAcademicYear: nextCurrentAcademicYear || "",
    });
  };

  // ---------------- BOOTSTRAP CACHE EFFECT ----------------
  // Mirrors the original page effect: runs once on mount, gated by
  // !loadingFinance && schoolCode. Reads the local cache and hydrates state.
  useEffect(() => {
    if (loadingFinance || !schoolCode) return undefined;

    let cancelled = false;
    const cached = readStudentsCache();
    if (!cached) return undefined;

    if (Array.isArray(cached.studentList) && cached.studentList.length) {
      const cachedStudentList = cached.studentList;
      setStudents(cachedStudentList);
      setStudentsLoading(false);

      hydrateMissingStudentProfileImages(cachedStudentList).then((hydratedStudentList) => {
        if (cancelled || !Array.isArray(hydratedStudentList) || hydratedStudentList.length === 0) return;

        const hasProfileFix = hydratedStudentList.some(
          (studentItem, index) => studentItem?.profileImage !== cachedStudentList[index]?.profileImage
        );
        if (!hasProfileFix) return;

        persistStudentList(
          hydratedStudentList,
          Array.isArray(cached.gradeOptions) ? cached.gradeOptions : gradeOptions,
          String(cached.currentAcademicYear || currentAcademicYear || "")
        );
      });
    }

    if (Array.isArray(cached.gradeOptions)) {
      setGradeOptions(cached.gradeOptions);
    }

    if (typeof cached.currentAcademicYear === "string") {
      setCurrentAcademicYear(cached.currentAcademicYear);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- FETCH STUDENTS (React Query) ----------------
  const { data: reactQueryStudents, isLoading: isStudentsQueryLoading } = useQuery({
    queryKey: ["students", schoolCode],
    queryFn: async () => {
      const cached = readStudentsCache();
      if (cached && Array.isArray(cached.studentList)) {
        setGradeOptions(Array.isArray(cached.gradeOptions) ? cached.gradeOptions : []);
        setCurrentAcademicYear(String(cached.currentAcademicYear || ""));

        if (cached.studentList.length < PAGE_SIZE) {
          setHasMoreStudents(false);
        }
        return cached.studentList;
      }

      try {
        const [schoolInfoData, gradesData] = await Promise.all([
          readSchoolNodeApi("schoolInfo", {}),
          readSchoolNodeApi("GradeManagement/grades", {}),
        ]);
        const activeAcademicYear = (schoolInfoData || {}).currentAcademicYear || "";
        setCurrentAcademicYear(activeAcademicYear);

        const managedGrades = Object.keys(gradesData || {})
          .filter((gradeKey) => isValidGradeKey(gradeKey))
          .sort((a, b) => Number(a) - Number(b));
        setGradeOptions(managedGrades);
        setSelectedGrade((prev) => {
          if (prev === "All") return prev;
          return managedGrades.includes(String(prev)) ? prev : "All";
        });

        // PAGINATION: Fetch first page only
        const paginatedUrl = `${DB_URL}/StudentDirectory.json?orderBy="$key"&limitToFirst=${PAGE_SIZE}`;
        const studentDirectoryResponse = await axios.get(paginatedUrl);
        const studentDirectoryData = studentDirectoryResponse.data || {};

        const directoryStudentList = Object.entries(studentDirectoryData).map(([studentId, student]) =>
          normalizeStudentSummary(studentId, student)
        );

        const studentKeys = Object.keys(studentDirectoryData);
        if (studentKeys.length > 0) {
          setPaginationCursor(studentKeys[studentKeys.length - 1]);
        }
        setHasMoreStudents(studentKeys.length >= PAGE_SIZE);

        if (directoryStudentList.length > 0) {
          persistStudentList(directoryStudentList, managedGrades, activeAcademicYear);
          setStudentsLoading(false);

          // Hydrate profile images in background
          hydrateMissingStudentProfileImages(directoryStudentList).then((hydratedList) => {
            persistStudentList(hydratedList, managedGrades, activeAcademicYear);
          });
          return directoryStudentList;
        }

        // Fallback: empty StudentDirectory → fetch from Students node (paginated)
        const studentsPaginatedUrl = `${DB_URL}/Students.json?orderBy="$key"&limitToFirst=${PAGE_SIZE}`;
        const studentsResponse = await axios.get(studentsPaginatedUrl);
        const studentsData = studentsResponse.data || {};

        const studentKeys2 = Object.keys(studentsData);
        if (studentKeys2.length > 0) {
          setPaginationCursor(studentKeys2[studentKeys2.length - 1]);
        }
        setHasMoreStudents(studentKeys2.length >= PAGE_SIZE);

        const baseStudentList = studentKeys2.map((id) => normalizeStudentSummary(id, studentsData[id]));

        setStudentsLoading(false);
        persistStudentList(baseStudentList, managedGrades, activeAcademicYear);

        try {
          const usersData = await readSchoolNodeApi("Users", {});
          if (!usersData || typeof usersData !== "object") return baseStudentList;

          const hydratedStudentList = baseStudentList.map((student) => {
            const user = usersData[student.userId] || {};
            return {
              ...student,
              name: user.name || user.username || student.name || "No Name",
              profileImage: getSafeImage(user?.profileImage, student?.profileImage),
              email: user.email || student.email || "",
            };
          });

          persistStudentList(hydratedStudentList, managedGrades, activeAcademicYear);
          return hydratedStudentList;
        } catch (hydrationErr) {
          console.warn("Failed to hydrate student profiles:", hydrationErr);
          return baseStudentList;
        }
      } catch (err) {
        console.error("Error fetching students:", err);
        return [];
      } finally {
        setStudentsLoading(false);
      }
    },
    enabled: Boolean(schoolCode),
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
  });

  // Sync React Query data with local state
  useEffect(() => {
    if (reactQueryStudents && Array.isArray(reactQueryStudents)) {
      setStudents(reactQueryStudents);
    }
  }, [reactQueryStudents]);

  useEffect(() => {
    setStudentsLoading(isStudentsQueryLoading);
  }, [isStudentsQueryLoading]);

  // ---------------- LOAD MORE STUDENTS ----------------
  const loadMoreStudents = async () => {
    if (!hasMoreStudents || loadingMore || !paginationCursor) return;

    setLoadingMore(true);
    try {
      const paginatedUrl = `${DB_URL}/StudentDirectory.json?orderBy="$key"&startAfter="${paginationCursor}"&limitToFirst=${PAGE_SIZE}`;
      const response = await axios.get(paginatedUrl);
      const newStudentsData = response.data || {};

      if (Object.keys(newStudentsData).length === 0) {
        setHasMoreStudents(false);
        setLoadingMore(false);
        return;
      }

      const newStudentList = Object.entries(newStudentsData).map(([studentId, student]) =>
        normalizeStudentSummary(studentId, student)
      );

      const studentKeys = Object.keys(newStudentsData);
      if (studentKeys.length > 0) {
        setPaginationCursor(studentKeys[studentKeys.length - 1]);
      }
      setHasMoreStudents(studentKeys.length >= PAGE_SIZE);

      const updatedStudentList = [...students, ...newStudentList];
      persistStudentList(updatedStudentList, gradeOptions, currentAcademicYear);

      // Hydrate profile images in background
      hydrateMissingStudentProfileImages(newStudentList).then((hydratedList) => {
        const mergedList = updatedStudentList.map((student) => {
          const hydrated = hydratedList.find((h) => h.studentId === student.studentId);
          return hydrated || student;
        });
        persistStudentList(mergedList, gradeOptions, currentAcademicYear);
      });
    } catch (err) {
      console.error("Error loading more students:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // ---------------- DERIVATIONS ----------------
  const previousAcademicYearKey = useMemo(() => {
    const text = String(currentAcademicYear || "").trim();
    if (!text) return "";
    const normalized = text.replace("/", "_");
    const parts = normalized.split("_");
    if (parts.length !== 2) return "";
    const start = Number(parts[0]);
    if (Number.isNaN(start)) return "";
    return `${start - 1}_${start}`;
  }, [currentAcademicYear]);

  const filteredStudentsBase = useMemo(() => {
    const normalizedSearch = (searchTerm || "").trim().toLowerCase();
    return students.filter((s) => {
      if (selectedGrade !== "All" && String(s.grade) !== String(selectedGrade)) return false;
      if (selectedSection !== "All" && String(s.section) !== String(selectedSection)) return false;

      if (!normalizedSearch) return true;

      const haystack = [s.name, s.studentId, s.userId, s.email, s.grade, s.section]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [students, selectedGrade, selectedSection, searchTerm]);

  const currentYearStudents = useMemo(() => {
    if (!currentAcademicYear) return filteredStudentsBase;
    const normalizedCurrentYear = normalizeAcademicYear(currentAcademicYear);
    return filteredStudentsBase.filter(
      (student) => normalizeAcademicYear(student.academicYear) === normalizedCurrentYear
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredStudentsBase, currentAcademicYear]);

  const lastYearStudents = useMemo(() => {
    if (!previousAcademicYearKey) return [];
    return filteredStudentsBase.filter(
      (student) => String(student.academicYear || "").trim() === String(previousAcademicYearKey).trim()
    );
  }, [filteredStudentsBase, previousAcademicYearKey]);

  return {
    // data
    students,
    setStudents,
    gradeOptions,
    setGradeOptions,
    currentAcademicYear,
    setCurrentAcademicYear,
    filteredStudentsBase,
    currentYearStudents,
    lastYearStudents,
    previousAcademicYearKey,
    // status
    studentsLoading,
    paginationCursor,
    hasMoreStudents,
    loadingMore,
    // actions
    loadMoreStudents,
    persistStudentList,
    writeStudentsCache,
    writeStudentDirectoryEntryToCache,
  };
}
