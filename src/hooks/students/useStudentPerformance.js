import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { uniqueNonEmptyValues } from "../../utils/chatRtdb";
import { fetchCachedJson } from "../../utils/rtdbCache";

const BIG_NODE_CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------- MODULE-SCOPE HELPERS (lifted from Students.jsx) ----------------
const normalizeCourseToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// DB convention: `course_{subject_key}_{grade}{SECTION}` (e.g. course_general_science_8A).
// The subject token is already lowercased + underscored by normalizeCourseToken;
// the grade stays as a plain digit; the section must stay UPPERCASE.
const buildGeneratedCourseId = (gradeValue, sectionValue, subjectToken) =>
  `course_${normalizeCourseToken(subjectToken)}_${String(gradeValue || "").trim()}${String(sectionValue || "").trim().toUpperCase()}`;

const normalizeGradeSubjectEntries = (subjectsNode) => {
  if (Array.isArray(subjectsNode)) {
    return subjectsNode
      .map((subjectItem) => {
        if (!subjectItem) return null;
        if (typeof subjectItem === "string") {
          return { key: normalizeCourseToken(subjectItem), name: subjectItem };
        }
        if (typeof subjectItem === "object") {
          const displayName = subjectItem.name || subjectItem.subject || subjectItem.code || "";
          const subjectKey = normalizeCourseToken(subjectItem.key || subjectItem.id || displayName);
          if (!subjectKey || !displayName) return null;
          return { key: subjectKey, name: displayName };
        }
        return null;
      })
      .filter(Boolean);
  }

  if (subjectsNode && typeof subjectsNode === "object") {
    return Object.entries(subjectsNode)
      .map(([subjectKey, subjectValue]) => {
        if (subjectValue && typeof subjectValue === "object") {
          const displayName = subjectValue.name || subjectValue.subject || subjectKey;
          return {
            key: normalizeCourseToken(subjectKey || displayName),
            name: displayName,
          };
        }
        if (typeof subjectValue === "string") {
          return {
            key: normalizeCourseToken(subjectKey || subjectValue),
            name: subjectValue,
          };
        }
        return {
          key: normalizeCourseToken(subjectKey),
          name: subjectKey,
        };
      })
      .filter((entry) => entry.key && entry.name);
  }

  return [];
};

const buildGradeSubjectsByGrade = (gradesNode) => {
  const result = {};
  const gradeEntries = Array.isArray(gradesNode)
    ? gradesNode
    : Object.entries(gradesNode || {}).map(([gradeKey, gradeValue]) => ({
        grade: gradeValue?.grade ?? gradeKey,
        ...(gradeValue && typeof gradeValue === "object" ? gradeValue : {}),
      }));

  gradeEntries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;

    const grade = String(entry.grade ?? (Array.isArray(gradesNode) ? String(index + 1) : "")).trim();
    if (!grade) return;

    const subjectMap = new Map();
    normalizeGradeSubjectEntries(entry.subjects).forEach((subjectEntry) => {
      subjectMap.set(normalizeCourseToken(subjectEntry.key || subjectEntry.name), subjectEntry);
    });

    const sectionSubjectTeachers =
      entry.sectionSubjectTeachers && typeof entry.sectionSubjectTeachers === "object"
        ? entry.sectionSubjectTeachers
        : {};

    Object.values(sectionSubjectTeachers).forEach((sectionNode) => {
      Object.entries(sectionNode || {}).forEach(([subjectKey, assignment]) => {
        const displayName =
          assignment && typeof assignment === "object" && (assignment.subject || assignment.name)
            ? assignment.subject || assignment.name
            : subjectKey;
        const token = normalizeCourseToken(
          assignment && typeof assignment === "object"
            ? assignment.key || assignment.id || displayName || subjectKey
            : displayName || subjectKey
        );
        if (!token) return;
        subjectMap.set(token, {
          key: token,
          name: String(displayName || subjectKey || "").trim(),
        });
      });
    });

    result[grade] = [...subjectMap.values()].filter((entry) => entry?.key);
  });

  return result;
};

const getStudentCourseIds = ({ student = {}, gradeSubjectsByGrade = {} } = {}) => {
  const grade = String(student?.grade || student?.basicStudentInformation?.grade || "").trim();
  const section = String(student?.section || student?.secation || student?.basicStudentInformation?.section || "").trim().toUpperCase();
  if (!grade || !section) return [];

  return [...new Set(
    (gradeSubjectsByGrade[grade] || [])
      .map((subjectEntry) => buildGeneratedCourseId(grade, section, subjectEntry?.key || subjectEntry?.name))
      .filter(Boolean)
  )];
};

const findStudentScopedNode = (records = {}, student = {}) => {
  const candidateKeys = new Set(uniqueNonEmptyValues([
    student?.studentId,
    student?.userId,
    student?.userId ? `student_${student.userId}` : "",
  ]));

  for (const candidate of candidateKeys) {
    if (records?.[candidate]) return records[candidate];
  }

  return Object.values(records || {}).find(
    (record) =>
      record &&
      typeof record === "object" &&
      (candidateKeys.has(String(record.userId || "").trim()) || candidateKeys.has(String(record.studentId || "").trim()))
  ) || null;
};

/**
 * useStudentPerformance
 *
 * Owns the Students page's per-student data layer for the Performance,
 * Attendance, and Payment tabs:
 *   - grade→subjects map fetch (gates the marks/attendance fetches)
 *   - marks fetch (ClassMarks scoped to the selected student's courses)
 *   - attendance fetch (Attendance scoped likewise; also mirrors the
 *     attendance array back onto the selectedStudent object)
 *   - payment-history fetch (12-month sweep of monthlyPaid/YYYY-MMM)
 *   - selectedStudentCourseIds derivation (used by marks/attendance)
 *   - studentMarksFlattened derivation (normalizes legacy shapes
 *     [quarters | flat assessments] into { semester1, semester2 })
 *
 * Page concerns kept out: selectedStudent, studentTab, dbUrl, apiBase,
 * schoolCode, loadingFinance, and the setSelectedStudent setter (the
 * attendance fetch mirrors data onto the selected student) are passed in.
 */
export default function useStudentPerformance({
  selectedStudent,
  setSelectedStudent,
  studentTab,
  dbUrl,
  apiBase,
  schoolCode,
  loadingFinance,
}) {
  const [studentMarks, setStudentMarks] = useState({});
  const [attendance, setAttendance] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState({});
  const [gradeSubjectsByGrade, setGradeSubjectsByGrade] = useState({});
  const [gradeSubjectsLoaded, setGradeSubjectsLoaded] = useState(false);

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

  const selectedStudentCourseIds = useMemo(
    () => getStudentCourseIds({ student: selectedStudent, gradeSubjectsByGrade }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gradeSubjectsByGrade, selectedStudent?.grade, selectedStudent?.section, selectedStudent?.secation]
  );

  const studentMarksFlattened = useMemo(() => {
    const src = studentMarks || {};
    const out = {};

    Object.entries(src).forEach(([courseId, node]) => {
      const normalized = {};

      if (node && (node.teacherName || node.teacher)) {
        normalized.teacherName = node.teacherName || node.teacher;
      }

      // already has semester nodes
      if (node && (node.semester1 || node.semester2)) {
        if (node.semester1) normalized.semester1 = node.semester1;
        if (node.semester2) normalized.semester2 = node.semester2;
        out[courseId] = normalized;
        return;
      }

      // quarter keys → place under semesters
      const quarterKeys = Object.keys(node || {}).filter((k) => /^quarter\d+/i.test(k));
      if (quarterKeys.length) {
        normalized.semester1 = normalized.semester1 || {};
        normalized.semester2 = normalized.semester2 || {};
        quarterKeys.forEach((qk) => {
          const qLower = qk.toLowerCase();
          if (/quarter[12]/i.test(qLower)) {
            normalized.semester1[qLower] = node[qk];
          } else {
            normalized.semester2[qLower] = node[qk];
          }
        });
        out[courseId] = normalized;
        return;
      }

      // fallback: flat assessments → place under semester2.assessments
      if (node && node.assessments) {
        normalized.semester2 = normalized.semester2 || {};
        normalized.semester2.assessments = node.assessments;
        out[courseId] = normalized;
        return;
      }

      // default: copy whatever node was
      out[courseId] = normalized;
    });

    return out;
  }, [studentMarks]);

  // ---------------- LOAD GRADE → SUBJECTS MAP ----------------
  useEffect(() => {
    let cancelled = false;
    setGradeSubjectsLoaded(false);

    const loadGradeSubjects = async () => {
      try {
        const gradesData = await readSchoolNodeApi("GradeManagement/grades", {});
        if (!cancelled) {
          setGradeSubjectsByGrade(buildGradeSubjectsByGrade(gradesData));
        }
      } catch {
        if (!cancelled) setGradeSubjectsByGrade({});
      } finally {
        if (!cancelled) setGradeSubjectsLoaded(true);
      }
    };

    loadGradeSubjects();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolCode, loadingFinance]);

  // ---------------- FETCH PERFORMANCE (MARKS) ----------------
  useEffect(() => {
    if (studentTab !== "performance" || !selectedStudent?.studentId) {
      setStudentMarks({});
      return undefined;
    }

    if (!gradeSubjectsLoaded) return undefined;

    let cancelled = false;

    const fetchMarks = async () => {
      try {
        const marksObj = {};
        if (selectedStudentCourseIds.length > 0) {
          const courseMarkEntries = await Promise.all(
            selectedStudentCourseIds.map(async (courseId) => {
              const courseMarks = await fetchCachedJson(
                `${dbUrl}/ClassMarks/${encodeURIComponent(courseId)}.json`,
                { ttlMs: BIG_NODE_CACHE_TTL_MS, fallbackValue: {} }
              );
              return [courseId, courseMarks];
            })
          );

          courseMarkEntries.forEach(([courseId, courseMarks]) => {
            const found = findStudentScopedNode(courseMarks, selectedStudent);
            if (found) marksObj[courseId] = found;
          });
        } else {
          const classMarks = await fetchCachedJson(`${dbUrl}/ClassMarks.json`, {
            ttlMs: BIG_NODE_CACHE_TTL_MS,
            fallbackValue: {},
          });

          Object.entries(classMarks || {}).forEach(([courseId, students]) => {
            const found = findStudentScopedNode(students, selectedStudent);
            if (found) marksObj[courseId] = found;
          });
        }

        if (!cancelled) setStudentMarks(marksObj);
      } catch (err) {
        console.error("Marks fetch error:", err);
        if (!cancelled) setStudentMarks({});
      }
    };

    fetchMarks();

    return () => {
      cancelled = true;
    };
  }, [dbUrl, gradeSubjectsLoaded, selectedStudent?.studentId, selectedStudent?.userId, selectedStudentCourseIds, studentTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------- FETCH ATTENDANCE ----------------
  useEffect(() => {
    if (studentTab !== "attendance" || !selectedStudent?.studentId) return undefined;
    if (!gradeSubjectsLoaded) return undefined;

    let cancelled = false;

    const fetchAttendanceData = async () => {
      try {
        const attendanceData = [];
        if (selectedStudentCourseIds.length > 0) {
          const attendanceEntries = await Promise.all(
            selectedStudentCourseIds.map(async (courseId) => {
              const courseAttendance = await fetchCachedJson(
                `${dbUrl}/Attendance/${encodeURIComponent(courseId)}.json`,
                { ttlMs: BIG_NODE_CACHE_TTL_MS, fallbackValue: {} }
              );
              return [courseId, courseAttendance];
            })
          );

          attendanceEntries.forEach(([courseId, datesObj]) => {
            Object.entries(datesObj || {}).forEach(([date, studentsObj]) => {
              const status = studentsObj?.[selectedStudent.studentId];
              if (!status) return;

              attendanceData.push({
                courseId,
                date,
                status,
                teacherName: studentsObj?.[selectedStudent.studentId]?.teacherName || "Teacher",
              });
            });
          });
        } else {
          const attendanceRaw = await fetchCachedJson(`${dbUrl}/Attendance.json`, {
            ttlMs: BIG_NODE_CACHE_TTL_MS,
            fallbackValue: {},
          });

          Object.entries(attendanceRaw || {}).forEach(([courseId, datesObj]) => {
            Object.entries(datesObj || {}).forEach(([date, studentsObj]) => {
              const status = studentsObj?.[selectedStudent.studentId];
              if (!status) return;

              attendanceData.push({
                courseId,
                date,
                status,
                teacherName: studentsObj?.[selectedStudent.studentId]?.teacherName || "Teacher",
              });
            });
          });
        }

        if (cancelled) return;

        setAttendance(attendanceData);
        setSelectedStudent((prev) => {
          if (!prev || String(prev.studentId) !== String(selectedStudent.studentId)) return prev;
          return { ...prev, attendance: attendanceData };
        });
      } catch {
        if (!cancelled) setAttendance([]);
      }
    };

    fetchAttendanceData();

    return () => {
      cancelled = true;
    };
  }, [dbUrl, gradeSubjectsLoaded, selectedStudent?.studentId, selectedStudent?.userId, selectedStudentCourseIds, studentTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------- FETCH PAYMENT HISTORY ----------------
  useEffect(() => {
    if (studentTab !== "payment" || !selectedStudent) return;

    const fetchPaymentHistory = async () => {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const year = new Date().getFullYear();
      const studentKey = selectedStudent?.studentId || selectedStudent?.userId || String(selectedStudent?.id || "");
      const out = {};

      await Promise.all(
        months.map(async (m) => {
          const key = `${year}-${m}`;
          try {
            const node = await fetchCachedJson(`${dbUrl}/monthlyPaid/${key}.json`, {
              ttlMs: BIG_NODE_CACHE_TTL_MS,
              fallbackValue: {},
            });
            out[key] = !!(node && (node[studentKey] || node[String(studentKey)]));
          } catch {
            out[key] = false;
          }
        })
      );

      setPaymentHistory(out);
    };

    fetchPaymentHistory();
  }, [studentTab, selectedStudent?.studentId, selectedStudent?.userId, selectedStudent?.id, dbUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    studentMarks,
    setStudentMarks,
    studentMarksFlattened,
    attendance,
    setAttendance,
    paymentHistory,
    setPaymentHistory,
    gradeSubjectsByGrade,
    gradeSubjectsLoaded,
    selectedStudentCourseIds,
  };
}
