/**
 * lessonPlanHelpers
 *
 * Pure functions extracted from the giant Teachers.jsx `useEffect` that
 * fetches a teacher's lesson plans, feedback, and submission state.
 *
 * Why a separate file:
 *   - Original code defined ALL of these inside the effect body, meaning they
 *     were re-created on every effect run.
 *   - They're pure (no React, no axios, no state) so they belong outside
 *     the component tree.
 *   - They're now testable in isolation.
 *
 * Two helpers that previously closed over the effect scope are reshaped:
 *   - `isPastISODate(iso, todayISO)` now takes `todayISO` as a parameter
 *     instead of capturing it.
 */

// ─────────────────────────────────────────────────────────────────────
//  Date / key normalization
// ─────────────────────────────────────────────────────────────────────

export const normalizeWeekForKey = (val) => {
  if (val === undefined || val === null) return "";
  const s = String(val).trim();
  if (!s) return "";
  const m = s.match(/\d+/);
  return m ? m[0] : s;
};

export const normalizeDayForKey = (dayName) =>
  String(dayName || "").trim().toLowerCase();

export const canonicalSubmissionKey = (teacherId, courseId, weekVal, dayName) => {
  const t = String(teacherId || "").trim();
  const c = String(courseId || "").trim();
  return `${t}::${c}::${normalizeWeekForKey(weekVal)}::${normalizeDayForKey(dayName)}`;
};

export const normalizeISODate = (val) => {
  if (!val) return "";
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return "";
};

/**
 * @param {string} iso       — any date-ish value, will be normalized to YYYY-MM-DD
 * @param {string} todayISO  — today's date in YYYY-MM-DD form (caller provides it
 *                              so the comparison stays deterministic during a single
 *                              effect run, even across tick boundaries)
 */
export const isPastISODate = (iso, todayISO) => {
  const d = normalizeISODate(iso);
  if (!d || !todayISO) return false;
  return d < todayISO;
};

export const normalizeWeekDays = (input) => {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((d) => ({
      dayName: (d.dayName || d.name || d.day || d.label || "").toString(),
      date: normalizeISODate(d.date || d.dayDate || d.isoDate || d.dayISO || ""),
      topic: d.topic || d.subject || d.title || "",
      method: d.method || d.methods || "",
      aids: d.aids || d.material || d.materials || "",
      assessment: d.assessment || d.assess || d.evaluation || "",
      note: d.note || d.notes || "",
    }));
  }
  if (typeof input === "object") {
    return Object.keys(input).map((key) => {
      const val = input[key] || {};
      const dateFromKey = /^\d{4}-\d{2}-\d{2}$/.test(String(key || "").trim())
        ? String(key).trim()
        : "";
      if (typeof val === "string") {
        return { dayName: key, date: dateFromKey, topic: val, method: "", aids: "", assessment: "", note: "" };
      }
      return {
        dayName: (val.dayName || val.name || key).toString(),
        date: normalizeISODate(val.date || val.dayDate || val.isoDate || val.dayISO || dateFromKey || ""),
        topic: val.topic || val.subject || "",
        method: val.method || val.methods || "",
        aids: val.aids || val.material || "",
        assessment: val.assessment || val.assess || "",
        note: val.note || val.notes || "",
      };
    });
  }
  return [];
};

export const getDayNameFromIso = (isoValue) => {
  const iso = normalizeISODate(isoValue);
  if (!iso) return "";
  const dt = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", { weekday: "long" });
};

export const normalizeSemesterToken = (value) => {
  const raw = String(value || "").trim().toLowerCase().replace(/[_\s-]+/g, "");
  if (!raw) return "";
  if (raw === "sem1" || raw === "semester1") return "semester1";
  if (raw === "sem2" || raw === "semester2") return "semester2";
  return raw;
};

export const normalizeTopicToken = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

export const buildLessonFeedbackKey = ({ courseId, semesterKey, monthKey, weekKey, dateKey, topic }) =>
  [
    String(courseId || "").trim(),
    normalizeSemesterToken(semesterKey),
    String(monthKey || "").trim().toLowerCase(),
    normalizeWeekForKey(weekKey),
    normalizeISODate(dateKey),
    normalizeTopicToken(topic),
  ].join("::");

// ─────────────────────────────────────────────────────────────────────
//  Feedback aggregation
// ─────────────────────────────────────────────────────────────────────

export const normalizeUnderstandingLevel = (level, label) => {
  const raw = String(level || label || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!raw) return "unknown";
  if (raw.includes("excellent") || raw.includes("outstanding")) return "excellent";
  if (raw.includes("good") || raw.includes("very_good")) return "good";
  if (raw.includes("partial") || raw.includes("medium") || raw.includes("fair")) return "partial";
  if (raw.includes("dont_understand") || raw.includes("don't_understand") || raw.includes("poor")) {
    return "dont_understand";
  }
  return "unknown";
};

const UNDERSTANDING_LABELS = {
  excellent: "Excellent",
  good: "Good",
  partial: "Partially understood",
  dont_understand: "Don't understand",
  unknown: "No signal",
};

export const summarizeFeedbackEntries = (entries) => {
  const safeEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const responseCount = safeEntries.length;
  const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const understandingCounts = {
    excellent: 0,
    good: 0,
    partial: 0,
    dont_understand: 0,
    unknown: 0,
  };

  let ratingTotal = 0;
  safeEntries.forEach((entry) => {
    const rating = Number(entry?.teacherRating || 0);
    if (Number.isFinite(rating) && rating >= 1 && rating <= 5) {
      ratingCounts[rating] += 1;
      ratingTotal += rating;
    }
    const understandingKey = normalizeUnderstandingLevel(
      entry?.understandingLevel,
      entry?.understandingLabel
    );
    understandingCounts[understandingKey] = (understandingCounts[understandingKey] || 0) + 1;
  });

  const dominantUnderstandingKey =
    Object.entries(understandingCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";

  return {
    responseCount,
    averageRating: responseCount ? Number((ratingTotal / responseCount).toFixed(1)) : 0,
    ratingCounts,
    understandingCounts,
    dominantUnderstandingKey,
    dominantUnderstandingLabel: UNDERSTANDING_LABELS[dominantUnderstandingKey] || "No signal",
  };
};

export const parseLessonFeedbackPointer = (rawKey, fallbackCourseId = "") => {
  const pointer = String(rawKey || "").trim();
  if (!pointer) {
    return {
      courseId: String(fallbackCourseId || "").trim(),
      semesterKey: "",
      monthKey: "",
      weekKey: "",
      dateKey: "",
      topic: "",
    };
  }

  const parts = pointer.split("__");
  const [courseIdPart, semesterKey = "", monthKey = "", weekKey = "", dateKey = "", ...topicParts] = parts;
  const hasStructuredPointer = parts.length >= 6;
  const resolvedCourseId = String(
    hasStructuredPointer ? courseIdPart || fallbackCourseId || "" : fallbackCourseId || courseIdPart || ""
  ).trim();
  let topic = topicParts.join("__");

  if (hasStructuredPointer && topic) {
    try {
      topic = decodeURIComponent(topic);
    } catch {
      topic = topic.replace(/%20/g, " ");
    }
  }

  return {
    courseId: resolvedCourseId,
    semesterKey: hasStructuredPointer ? semesterKey : "",
    monthKey: hasStructuredPointer ? monthKey : "",
    weekKey: hasStructuredPointer ? weekKey : "",
    dateKey: hasStructuredPointer ? dateKey : "",
    topic: hasStructuredPointer ? topic : "",
  };
};

export const isFeedbackEntryRecord = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return [
    value.teacherRating,
    value.understandingLevel,
    value.understandingLabel,
    value.teacherId,
    value.courseId,
  ].some((field) => field !== undefined && field !== null && String(field).trim() !== "");
};

export const collectLessonFeedbackEntries = (root) => {
  const collected = [];

  const pushEntry = (studentId, entry, lessonKey = "", fallbackCourseId = "") => {
    if (!isFeedbackEntryRecord(entry)) return;
    const pointerParts = parseLessonFeedbackPointer(lessonKey, entry?.courseId || fallbackCourseId);
    collected.push({
      ...entry,
      ...pointerParts,
      courseId: String(entry?.courseId || pointerParts.courseId || fallbackCourseId || "").trim(),
      lessonKey: String(lessonKey || "").trim(),
      studentId: String(studentId || "").trim(),
    });
  };

  Object.entries(root || {}).forEach(([studentId, studentNode]) => {
    if (!studentNode || typeof studentNode !== "object") return;
    Object.entries(studentNode).forEach(([firstKey, firstValue]) => {
      if (!firstValue || typeof firstValue !== "object") return;
      if (isFeedbackEntryRecord(firstValue)) {
        pushEntry(studentId, firstValue, firstKey, firstValue?.courseId || "");
        return;
      }
      Object.entries(firstValue).forEach(([secondKey, secondValue]) => {
        if (!secondValue || typeof secondValue !== "object") return;
        pushEntry(studentId, secondValue, secondKey, firstKey);
      });
    });
  });

  return collected;
};

// ─────────────────────────────────────────────────────────────────────
//  Academic year + course tree resolution
// ─────────────────────────────────────────────────────────────────────

export const pickAcademicYearKey = (obj, preferred = null) => {
  if (!obj || typeof obj !== "object") return null;
  const keys = Object.keys(obj);
  if (!keys.length) return null;
  if (preferred && obj[preferred]) return preferred;
  if (preferred) {
    const variants = [
      preferred,
      preferred.replaceAll("/", "_"),
      preferred.replaceAll("/", "-"),
      preferred.replaceAll("/", ""),
    ];
    for (const v of variants) {
      if (obj[v]) return v;
    }
  }
  return keys.sort().slice(-1)[0];
};

export const parsePreferredAcademicYear = (preferred) => {
  const s = String(preferred || "").trim();
  const m = s.match(/^(\d{4})\s*\/\s*(\d{2,4})$/);
  if (!m) return null;
  const yearKey = m[1];
  let termKey = m[2];
  if (termKey.length === 4) termKey = termKey.slice(2);
  return { yearKey, termKey };
};

export const resolveAcademicYearNode = (root, preferred) => {
  if (!root || typeof root !== "object") return { node: {}, path: [] };

  const directKey = pickAcademicYearKey(root, preferred);
  if (directKey && root[directKey] && typeof root[directKey] === "object") {
    const directNode = root[directKey];
    if (directNode.courses && typeof directNode.courses === "object") {
      return { node: directNode, path: [directKey] };
    }
  }

  const parsed = parsePreferredAcademicYear(preferred);
  if (parsed && root[parsed.yearKey] && typeof root[parsed.yearKey] === "object") {
    const yearLevel = root[parsed.yearKey];
    if (yearLevel[parsed.termKey] && typeof yearLevel[parsed.termKey] === "object") {
      const nestedNode = yearLevel[parsed.termKey];
      if (nestedNode.courses && typeof nestedNode.courses === "object") {
        return { node: nestedNode, path: [parsed.yearKey, parsed.termKey] };
      }
    }
    for (const subKey of Object.keys(yearLevel || {})) {
      const nestedNode = yearLevel?.[subKey];
      if (nestedNode && typeof nestedNode === "object" && nestedNode.courses && typeof nestedNode.courses === "object") {
        return { node: nestedNode, path: [parsed.yearKey, subKey] };
      }
    }
  }

  for (const k of Object.keys(root || {})) {
    const v = root?.[k];
    if (v && typeof v === "object") {
      if (v.courses && typeof v.courses === "object") return { node: v, path: [k] };
      for (const sk of Object.keys(v || {})) {
        const vv = v?.[sk];
        if (vv && typeof vv === "object" && vv.courses && typeof vv.courses === "object") {
          return { node: vv, path: [k, sk] };
        }
      }
    }
  }

  return { node: {}, path: [] };
};

/**
 * Like resolveAcademicYearNode, but does NOT require a `.courses` child.
 * Used for nodes like LessonPlanSubmissions where the year node directly
 * contains courseIds.
 */
export const resolveAcademicYearNodeAny = (root, preferred) => {
  if (!root || typeof root !== "object") return { node: {}, path: [] };

  const parsed = parsePreferredAcademicYear(preferred);
  if (parsed && root[parsed.yearKey] && typeof root[parsed.yearKey] === "object") {
    const yearLevel = root[parsed.yearKey];
    if (yearLevel[parsed.termKey] && typeof yearLevel[parsed.termKey] === "object") {
      return { node: yearLevel[parsed.termKey], path: [parsed.yearKey, parsed.termKey] };
    }
    for (const subKey of Object.keys(yearLevel || {})) {
      const nestedNode = yearLevel?.[subKey];
      if (nestedNode && typeof nestedNode === "object") {
        return { node: nestedNode, path: [parsed.yearKey, subKey] };
      }
    }
  }

  if (preferred) {
    const variants = [
      preferred,
      String(preferred).replaceAll("/", "_"),
      String(preferred).replaceAll("/", "-"),
      String(preferred).replaceAll("/", ""),
    ];
    const directKey = variants.find((k) => root[k] && typeof root[k] === "object");
    if (directKey) return { node: root[directKey], path: [directKey] };
  }

  const topLevelKeys = Object.keys(root || {});
  if (topLevelKeys.length) {
    const latestKey = topLevelKeys.sort().slice(-1)[0];
    const latestNode = root?.[latestKey];
    if (latestNode && typeof latestNode === "object") {
      return { node: latestNode, path: [latestKey] };
    }
  }

  for (const k of Object.keys(root || {})) {
    const v = root?.[k];
    if (v && typeof v === "object") {
      for (const sk of Object.keys(v || {})) {
        const vv = v?.[sk];
        if (vv && typeof vv === "object") return { node: vv, path: [k, sk] };
      }
      return { node: v, path: [k] };
    }
  }

  return { node: {}, path: [] };
};

export const isLikelyCourseEntry = (entryKey, entryValue) => {
  if (!entryValue || typeof entryValue !== "object") return false;
  const key = String(entryKey || "").trim();
  if (key.startsWith("course_")) return true;
  if (entryValue.weeks || entryValue.annual || entryValue.dailyLogs || entryValue.submissions) return true;
  return Object.keys(entryValue || {}).some((childKey) => String(childKey || "").startsWith("week_"));
};

export const isCourseCollectionNode = (node) => {
  if (!node || typeof node !== "object") return false;
  return Object.entries(node).some(([entryKey, entryValue]) => isLikelyCourseEntry(entryKey, entryValue));
};

export const resolvePlanCourseCollection = (root, preferred) => {
  if (!root || typeof root !== "object") return {};

  if (root.courses && isCourseCollectionNode(root.courses)) {
    return root.courses;
  }
  if (isCourseCollectionNode(root)) {
    return root;
  }

  const resolved = resolveAcademicYearNode(root, preferred);
  if (resolved?.node?.courses && isCourseCollectionNode(resolved.node.courses)) {
    return resolved.node.courses;
  }
  if (resolved?.node && isCourseCollectionNode(resolved.node)) {
    return resolved.node;
  }

  const resolvedAny = resolveAcademicYearNodeAny(root, preferred);
  if (resolvedAny?.node?.courses && isCourseCollectionNode(resolvedAny.node.courses)) {
    return resolvedAny.node.courses;
  }
  if (resolvedAny?.node && isCourseCollectionNode(resolvedAny.node)) {
    return resolvedAny.node;
  }

  for (const value of Object.values(root || {})) {
    if (!value || typeof value !== "object") continue;
    if (value.courses && isCourseCollectionNode(value.courses)) {
      return value.courses;
    }
    if (isCourseCollectionNode(value)) {
      return value;
    }
  }

  return {};
};

// ─────────────────────────────────────────────────────────────────────
//  Misc
// ─────────────────────────────────────────────────────────────────────

export const ALL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const inferMonthFromWeekDays = (weekDays) => {
  const d = (weekDays || []).find((x) => normalizeISODate(x?.date));
  const iso = normalizeISODate(d?.date);
  if (!iso) return "";
  const dt = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  return ALL_MONTHS[dt.getMonth()] || "";
};
