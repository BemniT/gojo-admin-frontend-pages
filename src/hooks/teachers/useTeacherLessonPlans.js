import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { BACKEND_BASE, FIREBASE_DATABASE_URL } from "../../config.js";
import { schoolNodeBase } from "../../utils/schoolDbRouting";
import {
  normalizeWeekForKey,
  normalizeDayForKey,
  canonicalSubmissionKey,
  normalizeISODate,
  isPastISODate,
  normalizeWeekDays,
  getDayNameFromIso,
  normalizeSemesterToken,
  buildLessonFeedbackKey,
  summarizeFeedbackEntries,
  collectLessonFeedbackEntries,
  resolvePlanCourseCollection,
  inferMonthFromWeekDays,
} from "../../utils/lessonPlanHelpers";

const API_BASE = `${BACKEND_BASE}/api`;
const RTDB_BASE = FIREBASE_DATABASE_URL;

// Day-of-week → index map. Module-scope constant (replaces the local definition
// that lived inside TeachersPage at line 716).
const DAY_ORDER = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

const getScheduledIndex = (dayName) => {
  const lname = (dayName || "").toString().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DAY_ORDER, lname) ? DAY_ORDER[lname] : null;
};

// Backend-mediated school-node read (replaces the inline helper that
// lived in TeachersPage).
const readSchoolNode = async (schoolCode, nodeName) => {
  try {
    const response = await axios.get(`${API_BASE}/school-node-read`, {
      params: { schoolCode, path: nodeName },
      timeout: 7000,
    });
    return response?.data?.data || {};
  } catch {
    return {};
  }
};

/**
 * useTeacherLessonPlans
 *
 * Owns every piece of state related to the lesson-plans tab on the Teachers page:
 *   - teacherDailyPlans, planWeeks, planCurrentWeeks, planCurrentWeekIndex
 *   - planLoading, planError
 *   - planSubmittedKeys, planSubmittedEntries
 *   - planSidebarTab, planSidebarOpen, planAnnualOpen, planShowSubmittedTable
 *   - planSelectedCourseId, planCourseLabelMap
 *
 * Runs two effects:
 *   1. The big fetch (~600 lines): pulls plans, daily logs, feedback, submissions
 *      from multiple Firebase paths and merges them.
 *   2. Course-label resolution: fetches /Courses and builds id → "Subject • Grade Section" map.
 *
 * Exposes `refreshPlans()` to bump an internal counter that triggers a refetch
 * (used by the Refresh button on the Plan tab).
 */
export function useTeacherLessonPlans({ teacher, isActiveTab, schoolCode }) {
  // ---- State ----
  const [teacherDailyPlans, setTeacherDailyPlans] = useState([]);
  const [planSidebarTab, setPlanSidebarTab] = useState("daily"); // daily | weekly | monthly
  const [planWeeks, setPlanWeeks] = useState([]);
  const [planCurrentWeeks, setPlanCurrentWeeks] = useState([]);
  const [planCurrentWeekIndex, setPlanCurrentWeekIndex] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [planSubmittedKeys, setPlanSubmittedKeys] = useState([]);
  const [planSubmittedEntries, setPlanSubmittedEntries] = useState([]);
  const [planSidebarOpen, setPlanSidebarOpen] = useState(true);
  const [planRefreshKey, setPlanRefreshKey] = useState(0);
  const [planSelectedCourseId, setPlanSelectedCourseId] = useState("all");
  const [planCourseLabelMap, setPlanCourseLabelMap] = useState({});
  const [planAnnualOpen, setPlanAnnualOpen] = useState(false);
  const [planShowSubmittedTable, setPlanShowSubmittedTable] = useState(false);

  const refreshPlans = useCallback(() => setPlanRefreshKey((k) => k + 1), []);

  // ─────────────────────────────────────────────────────────────────────
  //  Effect 1: load plans + feedback + submissions
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!teacher || !isActiveTab) {
      setTeacherDailyPlans([]);
      setPlanWeeks([]);
      setPlanCurrentWeeks([]);
      setPlanCurrentWeekIndex(null);
      setPlanSubmittedKeys([]);
      setPlanSubmittedEntries([]);
      setPlanSelectedCourseId("all");
      setPlanCourseLabelMap({});
      setPlanAnnualOpen(false);
      setPlanShowSubmittedTable(false);
      setPlanError("");
      setPlanLoading(false);
      return;
    }

    const SCHOOL_DB_ROOT = schoolNodeBase(schoolCode);

    const fetchLessonPlans = async () => {
      try {
        setPlanLoading(true);
        setPlanError("");
        const teacherUserId = teacher.userId;
        const teacherId = teacher.teacherId;
        if (!teacherUserId && !teacherId) {
          setTeacherDailyPlans([]);
          setPlanWeeks([]);
          setPlanCurrentWeeks([]);
          setPlanCurrentWeekIndex(null);
          return;
        }
        const today = new Date();
        const todayISO = today.toISOString().slice(0, 10);
        const todayName = today.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
        const todayIndex = today.getDay();
        const isPastIso = (iso) => isPastISODate(iso, todayISO);

        const schoolInfo = await readSchoolNode(schoolCode, "schoolInfo");
        const currentAcademicYear = String(schoolInfo?.currentAcademicYear || "").trim();
        const preferredAcademicYear = currentAcademicYear || "2025/26";

        // Load teacher lesson-plan root from both normalized and legacy structures.
        // Keys may be teacherId (Teachers node key) or userId (legacy).
        const candidatePlanKeys = Array.from(new Set([
          String(teacherId || "").trim(),
          String(teacherUserId || "").trim(),
        ].filter(Boolean)));

        const candidatePlanRoots = [];
        const candidateDailyLogRoots = [];
        for (const k of candidatePlanKeys) {
          // eslint-disable-next-line no-await-in-loop
          const results = await Promise.all([
            axios.get(`${SCHOOL_DB_ROOT}/schoolLessonPlan/${encodeURIComponent(k)}.json`).catch(() => ({ data: null })),
            axios.get(`${RTDB_BASE}/schoolLessonPlan/${encodeURIComponent(k)}.json`).catch(() => ({ data: null })),
            axios.get(`${SCHOOL_DB_ROOT}/LessonPlans/TeachersLessonPlans/${encodeURIComponent(k)}.json`).catch(() => ({ data: null })),
            axios.get(`${RTDB_BASE}/LessonPlans/TeachersLessonPlans/${encodeURIComponent(k)}.json`).catch(() => ({ data: null })),
            axios.get(`${SCHOOL_DB_ROOT}/LessonPlans/LessonDailyLogs/${encodeURIComponent(k)}.json`).catch(() => ({ data: null })),
            axios.get(`${RTDB_BASE}/LessonPlans/LessonDailyLogs/${encodeURIComponent(k)}.json`).catch(() => ({ data: null })),
            axios.get(`${SCHOOL_DB_ROOT}/LessonPlans/${encodeURIComponent(k)}.json`).catch(() => ({ data: null })),
            axios.get(`${RTDB_BASE}/LessonPlans/${encodeURIComponent(k)}.json`).catch(() => ({ data: null })),
          ]);

          results.forEach((res, index) => {
            if (res && res.data && typeof res.data === "object" && Object.keys(res.data).length) {
              if (index === 4 || index === 5) {
                candidateDailyLogRoots.push(res.data);
              } else {
                candidatePlanRoots.push(res.data);
              }
            }
          });
        }

        let teacherPlansRoot = {};
        for (const rootCandidate of candidatePlanRoots) {
          const coursesCandidate = resolvePlanCourseCollection(rootCandidate, preferredAcademicYear);
          if (coursesCandidate && typeof coursesCandidate === "object" && Object.keys(coursesCandidate).length) {
            teacherPlansRoot = rootCandidate;
            break;
          }
        }
        if (!Object.keys(teacherPlansRoot).length && candidatePlanRoots.length) {
          teacherPlansRoot = candidatePlanRoots[0] || {};
        }

        const coursesNode = resolvePlanCourseCollection(teacherPlansRoot, preferredAcademicYear);
        const dailyLogsRoot = candidateDailyLogRoots.find((rootCandidate) => {
          const resolved = resolvePlanCourseCollection(rootCandidate, preferredAcademicYear);
          return resolved && typeof resolved === "object" && Object.keys(resolved).length > 0;
        }) || candidateDailyLogRoots[0] || {};
        const dailyLogsCourseNode = resolvePlanCourseCollection(dailyLogsRoot, preferredAcademicYear);

        // Submissions are keyed by teacherId in LessonPlanSubmissions (per schema)
        const teacherSubmissionId = String(teacherId || teacherUserId || "").trim();

        // ---- Feedback aggregation ----
        const feedbackRoots = [];
        const feedbackResults = await Promise.all([
          axios.get(`${SCHOOL_DB_ROOT}/LessonPlans/StudentWhatLearn.json`).catch(() => ({ data: null })),
          axios.get(`${RTDB_BASE}/LessonPlans/StudentWhatLearn.json`).catch(() => ({ data: null })),
          axios.get(`${SCHOOL_DB_ROOT}/StudentWhatLearn.json`).catch(() => ({ data: null })),
          axios.get(`${RTDB_BASE}/StudentWhatLearn.json`).catch(() => ({ data: null })),
        ]);

        feedbackResults.forEach((res) => {
          if (res && res.data && typeof res.data === "object" && Object.keys(res.data).length) {
            feedbackRoots.push(res.data);
          }
        });

        const feedbackBucketsByLessonKey = {};
        const seenFeedbackEntries = new Set();

        feedbackRoots.forEach((feedbackRoot) => {
          collectLessonFeedbackEntries(feedbackRoot).forEach((entry) => {
            const entryTeacherId = String(entry?.teacherId || "").trim();
            if (teacherSubmissionId && entryTeacherId && entryTeacherId !== teacherSubmissionId) return;

            const feedbackKey = buildLessonFeedbackKey({
              courseId: entry?.courseId,
              semesterKey: entry?.normalizedSemesterKey || entry?.semesterKey,
              monthKey: entry?.monthKey,
              weekKey: entry?.weekKey,
              dateKey: entry?.dateKey,
              topic: entry?.topic,
            });

            if (!feedbackKey.replace(/:/g, "").trim()) return;

            const dedupeKey = [
              String(entry?.studentId || "").trim(),
              String(entry?.lessonKey || "").trim(),
              String(entry?.courseId || "").trim(),
              String(entry?.teacherId || "").trim(),
              String(entry?.createdAt || "").trim(),
              String(entry?.updatedAt || "").trim(),
              String(entry?.teacherRating || "").trim(),
              String(entry?.understandingLevel || entry?.understandingLabel || "").trim(),
            ].join("::");

            if (seenFeedbackEntries.has(dedupeKey)) return;
            seenFeedbackEntries.add(dedupeKey);

            if (!feedbackBucketsByLessonKey[feedbackKey]) {
              feedbackBucketsByLessonKey[feedbackKey] = [];
            }
            feedbackBucketsByLessonKey[feedbackKey].push(entry);
          });
        });

        const feedbackSummaryByLessonKey = Object.entries(feedbackBucketsByLessonKey).reduce(
          (acc, [lessonKey, entries]) => {
            acc[lessonKey] = summarizeFeedbackEntries(entries);
            return acc;
          },
          {}
        );

        // ---- Submissions aggregation ----
        // Support both node names (LessonPlanSubmissions / LessonPlanSubmission)
        // and both teacher key styles (userId / teacherId)
        let submittedKeySet = new Set();
        const submittedEntriesByKey = {};
        try {
          const candidateTeacherKeys = Array.from(new Set([
            String(teacherUserId || "").trim(),
            String(teacher?.teacherId || "").trim(),
          ].filter(Boolean)));

          const submissionRoots = [];

          for (const tKey of candidateTeacherKeys) {
            const urls = [
              `${SCHOOL_DB_ROOT}/LessonPlanSubmissions/${encodeURIComponent(tKey)}.json`,
              `${SCHOOL_DB_ROOT}/LessonPlanSubmission/${encodeURIComponent(tKey)}.json`,
              `${SCHOOL_DB_ROOT}/LessonPlans/LessonSubmissions/${encodeURIComponent(tKey)}.json`,
              `${RTDB_BASE}/LessonPlanSubmissions/${encodeURIComponent(tKey)}.json`,
              `${RTDB_BASE}/LessonPlanSubmission/${encodeURIComponent(tKey)}.json`,
              `${RTDB_BASE}/LessonPlans/LessonSubmissions/${encodeURIComponent(tKey)}.json`,
            ];

            // eslint-disable-next-line no-await-in-loop
            const results = await Promise.all(
              urls.map((u) => axios.get(u).catch(() => ({ data: null })))
            );

            results.forEach((r) => {
              if (r && r.data && typeof r.data === "object") submissionRoots.push(r.data);
            });
          }

          submissionRoots.forEach((submissionsRoot) => {
            const submissionsCourseNode = resolvePlanCourseCollection(submissionsRoot, preferredAcademicYear);
            Object.values(submissionsCourseNode || {}).forEach((courseSubNode) => {
              if (!courseSubNode || typeof courseSubNode !== "object") return;
              Object.values(courseSubNode).forEach((sub) => {
                if (!sub) return;
                if (sub.key) {
                  const raw = String(sub.key).trim();
                  submittedKeySet.add(raw);
                  const parts = raw.split("::");
                  if (parts.length >= 4) {
                    const [tId, cId, wk, dn] = parts.map((p) => String(p ?? "").trim());
                    const canonical = canonicalSubmissionKey(tId, cId, wk, dn);
                    submittedKeySet.add(canonical);
                    const submittedAt = String(sub.submittedAt || sub.createdAt || sub.updatedAt || "").trim();
                    submittedEntriesByKey[canonical] = {
                      key: canonical,
                      teacherId: tId,
                      courseId: cId,
                      week: normalizeWeekForKey(wk),
                      dayName: dn,
                      submittedAt,
                      childKey: sub.childKey || "",
                    };
                  }
                }

                if (sub.teacherId || sub.courseId || sub.week || sub.dayName) {
                  const canonical = canonicalSubmissionKey(sub.teacherId, sub.courseId, sub.week, sub.dayName);
                  submittedKeySet.add(canonical);
                  const submittedAt = String(sub.submittedAt || sub.createdAt || sub.updatedAt || "").trim();
                  submittedEntriesByKey[canonical] = {
                    key: canonical,
                    teacherId: String(sub.teacherId || "").trim() || teacherSubmissionId,
                    courseId: String(sub.courseId || "").trim(),
                    week: normalizeWeekForKey(sub.week),
                    dayName: normalizeDayForKey(sub.dayName),
                    submittedAt,
                    childKey: sub.childKey || "",
                  };
                }

                if (sub.childKey) {
                  const ck = String(sub.childKey).trim();
                  const parts = ck.split("__").map((p) => String(p ?? "").trim());
                  if (parts.length >= 4) {
                    const [tId, cId, wk, dn] = parts;
                    const canonical = canonicalSubmissionKey(tId, cId, wk, dn);
                    submittedKeySet.add(canonical);
                    const submittedAt = String(sub.submittedAt || sub.createdAt || sub.updatedAt || "").trim();
                    submittedEntriesByKey[canonical] = {
                      key: canonical,
                      teacherId: tId,
                      courseId: cId,
                      week: normalizeWeekForKey(wk),
                      dayName: normalizeDayForKey(dn),
                      submittedAt,
                      childKey: ck,
                    };
                  }
                }
              });
            });

            Object.entries(submissionsCourseNode || {}).forEach(([courseId, semesterNode]) => {
              if (!semesterNode || typeof semesterNode !== "object") return;
              Object.entries(semesterNode).forEach(([semesterKey, monthNode]) => {
                if (!monthNode || typeof monthNode !== "object") return;
                Object.entries(monthNode).forEach(([monthKey, weekNode]) => {
                  if (!weekNode || typeof weekNode !== "object") return;
                  Object.entries(weekNode).forEach(([weekKey, submissionWeek]) => {
                    if (!submissionWeek || typeof submissionWeek !== "object") return;
                    const submittedDays = submissionWeek?.submittedDays && typeof submissionWeek.submittedDays === "object"
                      ? submissionWeek.submittedDays
                      : {};
                    Object.entries(submittedDays).forEach(([dateKey, submittedValue]) => {
                      if (!submittedValue) return;
                      const logMeta = dailyLogsCourseNode?.[courseId]?.[semesterKey]?.[monthKey]?.[weekKey]?.[dateKey] || {};
                      const dayName = String(logMeta?.dayName || getDayNameFromIso(dateKey) || "").trim();
                      const canonical = canonicalSubmissionKey(teacherSubmissionId, courseId, weekKey, dayName || dateKey);
                      submittedKeySet.add(canonical);
                      submittedEntriesByKey[canonical] = {
                        key: canonical,
                        teacherId: teacherSubmissionId,
                        courseId: String(courseId || "").trim(),
                        week: normalizeWeekForKey(weekKey),
                        dayName: normalizeDayForKey(dayName || dateKey),
                        submittedAt: String(submissionWeek?.lastSubmittedAt || "").trim(),
                        date: normalizeISODate(dateKey),
                        childKey: `${teacherSubmissionId}__${courseId}__${weekKey}__${dayName || dateKey}`,
                      };
                    });
                  });
                });
              });
            });
          });

          // Also collect submissions embedded in normalized plan structure
          Object.entries(coursesNode || {}).forEach(([courseId, courseEntry]) => {
            const entriesNode = courseEntry?.submissions?.entries;
            if (!entriesNode) return;

            const entries = Array.isArray(entriesNode)
              ? entriesNode.filter(Boolean)
              : (typeof entriesNode === "object" ? Object.values(entriesNode).filter(Boolean) : []);

            entries.forEach((sub) => {
              if (!sub || typeof sub !== "object") return;

              const subTeacherId = String(sub.teacherId || teacherSubmissionId || "").trim();
              const subCourseId = String(sub.courseId || courseId || "").trim();
              const subWeek = normalizeWeekForKey(sub.week);
              const subDayName = normalizeDayForKey(sub.dayName || sub.day || "");
              const submittedAt = String(sub.submittedAt || sub.createdAt || sub.updatedAt || "").trim();

              if (subTeacherId && subCourseId && subWeek && subDayName) {
                const canonical = canonicalSubmissionKey(subTeacherId, subCourseId, subWeek, subDayName);
                submittedKeySet.add(canonical);
                submittedEntriesByKey[canonical] = {
                  key: canonical,
                  teacherId: subTeacherId,
                  courseId: subCourseId,
                  week: subWeek,
                  dayName: subDayName,
                  submittedAt,
                  childKey: sub.childKey || "",
                };
              }

              if (sub.key) {
                const raw = String(sub.key).trim();
                submittedKeySet.add(raw);
                const parts = raw.split("::").map((p) => String(p ?? "").trim());
                if (parts.length >= 4) {
                  const [tId, cId, wk, dn] = parts;
                  const canonical = canonicalSubmissionKey(tId, cId, wk, dn);
                  submittedKeySet.add(canonical);
                  submittedEntriesByKey[canonical] = {
                    key: canonical,
                    teacherId: tId,
                    courseId: cId,
                    week: normalizeWeekForKey(wk),
                    dayName: normalizeDayForKey(dn),
                    submittedAt,
                    childKey: sub.childKey || "",
                  };
                }
              }
            });
          });
        } catch {
          submittedKeySet = new Set();
        }

        setPlanSubmittedKeys(Array.from(submittedKeySet));
        const submittedEntries = Object.values(submittedEntriesByKey).sort((a, b) => {
          const aTs = a?.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const bTs = b?.submittedAt ? new Date(b.submittedAt).getTime() : 0;
          if (aTs !== bTs) return bTs - aTs;
          const aw = Number(String(a?.week ?? "").match(/\d+/)?.[0] ?? 0);
          const bw = Number(String(b?.week ?? "").match(/\d+/)?.[0] ?? 0);
          return bw - aw;
        });
        setPlanSubmittedEntries(submittedEntries);

        // ---- Extract weeks across all courses ----
        const extractWeeksFromCourse = (courseId, courseEntry, courseDailyLogsEntry) => {
          if (!courseEntry) return [];
          const out = [];

          const pushWeek = (weekObj, weekFallback = "") => {
            if (!weekObj) return;
            const weekNumber = weekObj.week || weekObj.weekNumber || weekFallback || "";
            const semesterKey = weekObj.semester || weekObj.semesterKey || "";
            const monthKey = (weekObj.month || weekObj.monthName || "").toString()
              || inferMonthFromWeekDays(weekObj.weekDays || weekObj.days || weekObj.daily || []);
            const normalizedSemesterKey = normalizeSemesterToken(semesterKey);
            const weekDays = normalizeWeekDays(weekObj.weekDays || weekObj.days || weekObj.daily || []).map((day) => {
              const feedbackKey = buildLessonFeedbackKey({
                courseId: courseId || weekObj.courseId,
                semesterKey: normalizedSemesterKey,
                monthKey,
                weekKey: weekNumber,
                dateKey: day?.date,
                topic: day?.topic,
              });

              return {
                ...day,
                semesterKey,
                normalizedSemesterKey,
                monthKey,
                weekKey: weekNumber,
                feedback: feedbackSummaryByLessonKey[feedbackKey] || null,
              };
            });
            if (!weekDays.length && !(weekObj.topic || weekObj.weekTopic)) return;
            out.push({
              month: monthKey,
              week: weekNumber,
              topic: weekObj.topic || weekObj.weekTopic || "",
              objective: weekObj.objective || weekObj.objectives || weekObj.weekObjective || weekObj.weekObjectives || "",
              method: weekObj.method || weekObj.teachingMethod || weekObj.methods || "",
              material: weekObj.material || weekObj.materials || weekObj.aids || weekObj.resources || "",
              assessment: weekObj.assessment || weekObj.evaluation || weekObj.assessments || "",
              weekDays,
              courseId: courseId || weekObj.courseId || null,
              semesterKey,
              normalizedSemesterKey,
            });
          };

          Object.entries(courseEntry || {}).forEach(([semesterKey, semesterNode]) => {
            if (!semesterNode || typeof semesterNode !== "object") return;
            const monthsNode = semesterNode?.months && typeof semesterNode.months === "object"
              ? semesterNode.months
              : semesterNode;

            Object.entries(monthsNode || {}).forEach(([monthKey, monthNode]) => {
              if (!monthNode || typeof monthNode !== "object") return;
              const weeksNode = monthNode?.weeks && typeof monthNode.weeks === "object"
                ? monthNode.weeks
                : monthNode;

              Object.entries(weeksNode || {}).forEach(([weekKey, weekObj]) => {
                if (!weekObj || typeof weekObj !== "object") return;
                const dailyWeekNode = courseDailyLogsEntry?.[semesterKey]?.[monthKey]?.[weekKey] || {};
                const weekDays = normalizeWeekDays(dailyWeekNode);
                pushWeek(
                  { ...weekObj, semester: semesterKey, month: monthKey, week: weekObj?.week || weekKey, weekDays },
                  weekObj?.week || weekKey
                );
              });
            });
          });

          // annual rows
          if (courseEntry.annual && typeof courseEntry.annual === "object") {
            const annualRows = Array.isArray(courseEntry.annual.annualRows)
              ? courseEntry.annual.annualRows
              : (Array.isArray(courseEntry.annual.rows) ? courseEntry.annual.rows : []);
            annualRows.forEach((r) => pushWeek(r, r.week || ""));
          }

          // normalized weeks node
          if (courseEntry.weeks && typeof courseEntry.weeks === "object") {
            Object.entries(courseEntry.weeks).forEach(([wkKey, wkObj]) => {
              if (!wkObj || typeof wkObj !== "object") return;
              const fallback = String(wkKey || "").replace(/^week_?/i, "");
              pushWeek(wkObj, wkObj.week || fallback);
            });
          }

          // week_{x}
          Object.keys(courseEntry).forEach((k) => {
            if (!k) return;
            if (k.startsWith("week_")) {
              const wk = courseEntry[k];
              const fallback = k.replace(/^week_/, "");
              if (wk && typeof wk === "object") pushWeek(wk, wk.week || fallback);
            }
          });

          if (!out.length && courseDailyLogsEntry && typeof courseDailyLogsEntry === "object") {
            Object.entries(courseDailyLogsEntry).forEach(([semesterKey, monthNode]) => {
              if (!monthNode || typeof monthNode !== "object") return;
              Object.entries(monthNode).forEach(([monthKey, weekNode]) => {
                if (!weekNode || typeof weekNode !== "object") return;
                Object.entries(weekNode).forEach(([weekKey, dailyWeekNode]) => {
                  const weekDays = normalizeWeekDays(dailyWeekNode);
                  if (!weekDays.length) return;
                  pushWeek(
                    {
                      semester: semesterKey,
                      month: monthKey,
                      week: weekKey,
                      topic: weekDays[0]?.topic || "",
                      method: weekDays[0]?.method || "",
                      material: weekDays[0]?.aids || "",
                      assessment: weekDays[0]?.assessment || "",
                      weekDays,
                    },
                    weekKey
                  );
                });
              });
            });
          }

          return out;
        };

        let weeks = [];
        Object.entries(coursesNode || {}).forEach(([courseId, courseEntry]) => {
          weeks = weeks.concat(extractWeeksFromCourse(courseId, courseEntry, dailyLogsCourseNode?.[courseId] || {}));
        });

        // Dedupe loosely by courseId+week+month+topic
        const seen = new Set();
        weeks = weeks.filter((w) => {
          const key = `${String(w.courseId)}::${String(w.week)}::${String(w.month)}::${String(w.topic)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        setPlanWeeks(weeks);

        // ---- Per-course current week ----
        const currentWeeks = [];
        const dailyPlans = [];
        const coursesGrouped = (weeks || []).reduce((acc, w) => {
          const cid = String(w.courseId || "unknown");
          if (!acc[cid]) acc[cid] = [];
          acc[cid].push(w);
          return acc;
        }, {});

        Object.entries(coursesGrouped).forEach(([courseId, courseWeeks]) => {
          let idx = null;
          for (let i = 0; i < courseWeeks.length; i++) {
            if ((courseWeeks[i].weekDays || []).some((d) => normalizeISODate(d.date) === todayISO)) {
              idx = i;
              break;
            }
            if ((courseWeeks[i].weekDays || []).some((d) => (d.dayName || "").toString().toLowerCase() === todayName)) {
              idx = i;
              break;
            }
          }
          if (idx === null && courseWeeks.length) idx = 0;
          if (idx === null) return;

          const wk = courseWeeks[idx];
          currentWeeks.push(wk);

          (wk.weekDays || []).forEach((d) => {
            const scheduledIndex = getScheduledIndex(d.dayName || "");
            const submissionKey = canonicalSubmissionKey(teacherSubmissionId, courseId, wk.week || "", d.dayName || "");
            const submitted = submittedKeySet.has(submissionKey) || submittedKeySet.has(String(submissionKey).replace(/::([a-z]+)$/i, (m) => m));
            const status = submitted
              ? "submitted"
              : (d.date && isPastIso(d.date))
                ? "missed"
                : (scheduledIndex !== null && scheduledIndex < todayIndex)
                  ? "missed"
                  : "pending";

            const matchesToday = (d.date && normalizeISODate(d.date) === todayISO)
              || scheduledIndex === todayIndex
              || (d.dayName || "").toString().toLowerCase() === todayName;

            if (matchesToday) {
              dailyPlans.push({
                ...d,
                courseId,
                week: wk.week || "",
                month: wk.month || "",
                status,
                key: submissionKey,
                scheduledIndex,
              });
            }
          });
        });

        const seenDaily = new Set();
        const dedupedDailyPlans = dailyPlans.filter((p) => {
          const k = String(p.key || "");
          if (!k) return true;
          if (seenDaily.has(k)) return false;
          seenDaily.add(k);
          return true;
        });

        setPlanCurrentWeeks(currentWeeks);
        setPlanCurrentWeekIndex(currentWeeks.length ? 0 : null);
        setTeacherDailyPlans(dedupedDailyPlans);
      } catch (err) {
        console.error("Failed to fetch LessonPlans", err);
        setTeacherDailyPlans([]);
        setPlanWeeks([]);
        setPlanCurrentWeeks([]);
        setPlanCurrentWeekIndex(null);
        setPlanSubmittedKeys([]);
        setPlanSubmittedEntries([]);
        setPlanError("Failed to load lesson plans from database.");
      } finally {
        setPlanLoading(false);
      }
    };

    fetchLessonPlans();
  }, [teacher, isActiveTab, schoolCode, planRefreshKey]);

  // ─────────────────────────────────────────────────────────────────────
  //  Effect 2: course label resolution for the Plan tab dropdown
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!teacher || !isActiveTab) return undefined;

    const ids = Array.from(new Set([
      ...(Array.isArray(planWeeks) ? planWeeks.map((w) => String(w?.courseId || "")).filter(Boolean) : []),
      ...(Array.isArray(planCurrentWeeks) ? planCurrentWeeks.map((w) => String(w?.courseId || "")).filter(Boolean) : []),
    ]));

    if (!ids.length) {
      setPlanCourseLabelMap({});
      setPlanSelectedCourseId("all");
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const courses = await readSchoolNode(schoolCode, "Courses");
        const map = {};
        ids.forEach((courseId) => {
          const c = courses?.[courseId];
          if (!c) return;
          const subject = (c.subject || "").toString().trim() || courseId;
          const grade = c.grade ? `Grade ${c.grade}` : "";
          const section = c.section ? `${c.section}` : "";
          const meta = [grade, section].filter(Boolean).join(" ");
          map[courseId] = meta ? `${subject} • ${meta}` : subject;
        });

        if (cancelled) return;
        setPlanCourseLabelMap(map);
        setPlanSelectedCourseId((prev) => {
          if (prev === "all") return prev;
          return ids.includes(prev) ? prev : "all";
        });
      } catch {
        if (cancelled) return;
        setPlanCourseLabelMap({});
        setPlanSelectedCourseId("all");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teacher, isActiveTab, planWeeks, planCurrentWeeks, schoolCode]);

  return {
    // Data
    teacherDailyPlans,
    planWeeks,
    planCurrentWeeks,
    planCurrentWeekIndex,
    planSubmittedKeys,
    planSubmittedEntries,
    planCourseLabelMap,

    // UI flags
    planLoading,
    planError,
    planSidebarTab,
    setPlanSidebarTab,
    planSidebarOpen,
    setPlanSidebarOpen,
    planAnnualOpen,
    setPlanAnnualOpen,
    planShowSubmittedTable,
    setPlanShowSubmittedTable,
    planSelectedCourseId,
    setPlanSelectedCourseId,

    // Setters exposed for the very few places the page still pokes at state directly
    setPlanCurrentWeekIndex,

    // Action
    refreshPlans,
  };
}
