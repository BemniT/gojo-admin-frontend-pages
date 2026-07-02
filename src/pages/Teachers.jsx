import React, { useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FaHome,
  FaFileAlt,
  FaCog,
  FaSignOutAlt,
  FaBell,
  FaFacebookMessenger,
  FaSearch,
  FaCalendarAlt,
  FaPaperPlane,
  FaCheck,
  FaChevronLeft,
  FaChevronRight,
  FaCheckCircle,
  FaClock
} from "react-icons/fa";
import axios from "axios";
import { getDatabase, ref, onValue } from "firebase/database";
import app from "../firebase";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FixedSizeList } from 'react-window';
import { BACKEND_BASE } from "../config.js";
import ProfileAvatar from "../components/ProfileAvatar";
import AdminVerifyModal from "../components/dashboard/modals/AdminVerifyModal";
import TeacherChatPopup from "../components/dashboard/chat/TeacherChatPopup";
import { useTeacherSchedule } from "../hooks/teachers/useTeacherSchedule";
import { useTeacherChat } from "../hooks/chat/useTeacherChat";
import { useTeacherLessonPlans } from "../hooks/teachers/useTeacherLessonPlans";
import TeacherDetailSidebar from "../components/dashboard/teachers/TeacherDetailSidebar";
import useTeachersList from "../hooks/teachers/useTeachersList";
import {
  normalizeWeekForKey,
  normalizeDayForKey,
  canonicalSubmissionKey,
  normalizeISODate,
  isPastISODate,
  normalizeWeekDays,
  getDayNameFromIso,
  normalizeSemesterToken,
  normalizeTopicToken,
  buildLessonFeedbackKey,
  normalizeUnderstandingLevel,
  summarizeFeedbackEntries,
  parseLessonFeedbackPointer,
  isFeedbackEntryRecord,
  collectLessonFeedbackEntries,
  pickAcademicYearKey,
  parsePreferredAcademicYear,
  resolveAcademicYearNode,
  resolveAcademicYearNodeAny,
  isLikelyCourseEntry,
  isCourseCollectionNode,
  resolvePlanCourseCollection,
  ALL_MONTHS,
  inferMonthFromWeekDays,
} from "../utils/lessonPlanHelpers";
import { schoolNodeBase } from "../utils/schoolDbRouting";
import {
  buildChatSummaryPath,
  buildChatSummaryUpdate,
  buildOwnerChatSummariesPath,
  fetchJson,
  getConversationSortTime,
  getSafeProfileImage,
  mapInBatches,
  normalizeChatSummaryValue,
  parseChatParticipantIds,
} from "../utils/chatRtdb";
import { fetchCachedJson, readCachedJson, writeCachedJson } from "../utils/rtdbCache";




const NOTIFICATION_REFRESH_MS = 3 * 60 * 1000;
const NOTIFICATION_IDLE_GRACE_MS = 5 * 60 * 1000;

function TeachersPage() {
  const API_BASE = `${BACKEND_BASE}/api`;
  const bootstrapAdmin = (() => {
    try {
      return JSON.parse(localStorage.getItem("admin") || "{}") || {};
    } catch {
      return {};
    }
  })();
  const bootstrapSchoolCode = String(bootstrapAdmin.schoolCode || "").trim();
  const TEACHERS_UI_STATE_KEY = `teachers_page_ui_v2_${bootstrapSchoolCode || "global"}`;
  const readBootstrapUiState = () => {
    try {
      const rawSession = sessionStorage.getItem(TEACHERS_UI_STATE_KEY);
      const rawLocal = localStorage.getItem(TEACHERS_UI_STATE_KEY);
      const parsed = JSON.parse(rawSession || rawLocal || "null");
      if (!parsed || typeof parsed !== "object") return null;
      if (!rawSession && rawLocal) {
        sessionStorage.setItem(TEACHERS_UI_STATE_KEY, rawLocal);
      }
      return parsed;
    } catch {
      return null;
    }
  };
  const bootstrapUiState = readBootstrapUiState();

  const [selectedGrade, setSelectedGrade] = useState(
    typeof bootstrapUiState?.selectedGrade === "string" && bootstrapUiState.selectedGrade.trim()
      ? bootstrapUiState.selectedGrade
      : "All"
  );
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [teacherChatOpen, setTeacherChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [searchTerm, setSearchTerm] = useState(
    typeof bootstrapUiState?.searchTerm === "string" ? bootstrapUiState.searchTerm : ""
  );
  // Chat state (popupMessages, popupInput, typingUserId, messagesEndRef,
  // typingTimeoutRef) and all related handlers + Firebase listeners now live
  // inside useTeacherChat â€” the hook call is added below once adminUserId
  // and selectedTeacher are available.
  const lastNotificationInteractionAtRef = useRef(Date.now());

  // Schedule comes from a dedicated hook (replaces the in-page useEffect below).
  // We alias the hook's `schedule` to the legacy `teacherSchedule` name so the
  // ~8 read sites further down the file don't need touching.
  const { schedule: teacherSchedule } = useTeacherSchedule({
    teacher: selectedTeacher,
    isActiveTab: activeTab === "schedule",
    schoolCode: bootstrapSchoolCode,
  });
  // Lesson plans: all related state (15 fields), both fetch effects, and the
  // refresh action are owned by the useTeacherLessonPlans hook.
  // The hook needs selectedTeacher + activeTab + schoolCode which are declared
  // further down â€” we call it just below those declarations.

  const [showMessageDropdown, setShowMessageDropdown] = useState(false);

  const [unreadTeachers, setUnreadTeachers] = useState({});
  const [unreadSenders, setUnreadSenders] = useState({}); 
  const [postNotifications, setPostNotifications] = useState([]);
  const [showPostDropdown, setShowPostDropdown] = useState(false);
  const [selectedTeacherUser, setSelectedTeacherUser] = useState(null);
  const [deactivating, setDeactivating] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminModalUsername, setAdminModalUsername] = useState("");
  const [adminModalPassword, setAdminModalPassword] = useState("");
  const [adminModalError, setAdminModalError] = useState("");
  const [adminVerifying, setAdminVerifying] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null); // { userId, curBool, newActive }

  
  // React Query client for cache management
  const queryClient = useQueryClient();

  const shouldRunPassiveNotificationRefresh = () => {
    const isVisible = typeof document === "undefined" || document.visibilityState === "visible";
    const isOnline = typeof navigator === "undefined" || navigator.onLine !== false;
    const isRecentlyActive = Date.now() - lastNotificationInteractionAtRef.current < NOTIFICATION_IDLE_GRACE_MS;
    return isVisible && isOnline && isRecentlyActive;
  };

  useEffect(() => {
    const markNotificationInteraction = () => {
      lastNotificationInteractionAtRef.current = Date.now();
    };

    const handleVisibilityChange = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") {
        return;
      }
      markNotificationInteraction();
    };

    window.addEventListener("focus", markNotificationInteraction);
    window.addEventListener("online", markNotificationInteraction);
    window.addEventListener("pointerdown", markNotificationInteraction, { passive: true });
    window.addEventListener("touchstart", markNotificationInteraction, { passive: true });
    window.addEventListener("keydown", markNotificationInteraction);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", markNotificationInteraction);
      window.removeEventListener("online", markNotificationInteraction);
      window.removeEventListener("pointerdown", markNotificationInteraction);
      window.removeEventListener("touchstart", markNotificationInteraction);
      window.removeEventListener("keydown", markNotificationInteraction);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // open modal to confirm toggle and collect admin credentials
  const handleToggleActiveTeacher = async () => {
    if (!selectedTeacherUser?.userId && !selectedTeacher?.userId) return;
    const userId = selectedTeacherUser?.userId || selectedTeacher?.userId;
    if (!userId) return;

    const currentVal = selectedTeacherUser?.isActive ?? selectedTeacher?.isActive;
    const curBool = currentVal === true || String(currentVal) === "true";
    const newActive = !curBool;

    setPendingToggle({ userId, curBool, newActive });
    setAdminModalUsername("");
    setAdminModalPassword("");
    setAdminModalError("");
    setShowAdminModal(true);
  };

  const closeAdminModal = () => {
    setShowAdminModal(false);
    setPendingToggle(null);
    setAdminModalError("");
  };

  const submitAdminModal = async () => {
    if (!pendingToggle) return;
    const { userId, curBool, newActive } = pendingToggle;
    if (!adminModalUsername || !adminModalPassword) {
      setAdminModalError('Enter admin username and password');
      return;
    }

    setAdminVerifying(true);
    setDeactivating(true);

    try {
      const verifyRes = await axios.post(`${API_BASE}/login`, { username: String(adminModalUsername).trim(), password: String(adminModalPassword) });
      if (!verifyRes?.data?.success) {
        setAdminModalError(verifyRes?.data?.message || 'Admin credentials verification failed');
        setAdminVerifying(false);
        setDeactivating(false);
        return;
      }
    } catch (verErr) {
      console.error('Admin credential verification failed', verErr);
      setAdminModalError('Failed to verify admin credentials. Check server or try again.');
      setAdminVerifying(false);
      setDeactivating(false);
      return;
    }

    const teacherId =
      (selectedTeacher && selectedTeacher.teacherId) ||
      (selectedTeacherUser && selectedTeacherUser.teacherId) ||
      Object.values(teachers || {}).find((teacher) => teacher.userId === userId)?.teacherId ||
      "";
    const optimisticUsersMap = {
      ...(usersByUserId || {}),
      [userId]: { ...((usersByUserId || {})[userId] || {}), isActive: newActive },
    };
    const optimisticTeachers = Array.isArray(teachers)
      ? teachers.map((teacher) => (teacher.userId === userId ? { ...teacher, isActive: newActive } : teacher))
      : teachers;

    // optimistic UI update
    setSelectedTeacherUser((prev) => (prev ? { ...prev, isActive: newActive } : prev));
    setUsersByUserId(optimisticUsersMap);
    setTeachers(optimisticTeachers);

    try {
      const allUsers = await readSchoolNode("Users");
      const normalize = (v) => String(v || "").replace(/^[-]+/, "").trim();
      const pushKeys = Object.keys(allUsers || {}).filter((pk) => {
        const rec = allUsers[pk] || {};
        const recUserId = normalize(rec.userId || pk);
        const recUsername = String(rec.username || "").trim();
        return recUserId === userId || recUsername === userId || pk === userId;
      });

      if (pushKeys.length === 0) {
        console.error('submitAdminModal: user push-key not found for', userId, allUsers);
        throw new Error('user_record_not_found');
      }

      await axios.put(`${API_BASE}/school-node`, {
        schoolCode,
        path: `Users/${encodeURIComponent(pushKeys[0])}/isActive`,
        value: newActive,
      });
      if (teacherId) {
        await axios.put(`${API_BASE}/school-node`, {
          schoolCode,
          path: `TeacherDirectory/${encodeURIComponent(teacherId)}/isActive`,
          value: newActive,
        }).catch(() => undefined);
        writeTeacherDirectoryEntryToCache(teacherId, (previousEntry) => ({
          ...previousEntry,
          isActive: newActive,
        }));
      }
      // Was: pushed a fake "Teacher activated/deactivated" entry into the chat thread.
      // That's the wrong UX channel (chat listener would overwrite it on next tick) â€”
      // log it instead. Session D adds a Toast here.
      console.info(newActive ? "Teacher activated." : "Teacher deactivated.");

      // If we just deactivated the teacher, also unassign them from courses/grade assignments
      if (newActive === false) {
        try {
          if (teacherId) {
            // 1) Remove TeacherAssignments entries that reference this teacherId
            try {
              const taData = await readSchoolNode("TeacherAssignments");
              for (const [taKey, taVal] of Object.entries(taData)) {
                if (!taVal) continue;
                if (String(taVal.teacherId || "").trim() === String(teacherId).trim()) {
                  await axios.put(`${API_BASE}/school-node`, {
                    schoolCode,
                    path: `TeacherAssignments/${encodeURIComponent(taKey)}`,
                    value: null,
                  });
                }
              }
            } catch (e) {
              console.error('Failed removing TeacherAssignments for', teacherId, e);
            }

            // 2) Delete GradeManagement sectionSubjectTeachers entries that reference this teacher
            try {
              const gmData = await readSchoolNode("GradeManagement/grades");
              for (const [gradeKey, gradeNode] of Object.entries(gmData)) {
                const sst = gradeNode?.sectionSubjectTeachers || {};
                for (const [sectionKey, subjectsNode] of Object.entries(sst || {})) {
                  for (const [subjectKey, assign] of Object.entries(subjectsNode || {})) {
                    if (!assign) continue;
                    const assignedTeacherId = String(assign.teacherId || assign.teacherRecordKey || "").trim();
                    if (assignedTeacherId && assignedTeacherId === String(teacherId).trim()) {
                      try {
                        await axios.put(`${API_BASE}/school-node`, {
                          schoolCode,
                          path: `GradeManagement/grades/${encodeURIComponent(gradeKey)}/sectionSubjectTeachers/${encodeURIComponent(sectionKey)}/${encodeURIComponent(subjectKey)}`,
                          value: null,
                        });
                      } catch (err) {
                        console.error('Failed deleting sectionSubjectTeachers entry', err?.response?.data || err.message || err);
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.error('Failed clearing GradeManagement assignments for', teacherId, e);
            }

            // 3) Update local UI state to remove their grades/subjects
            const clearedTeachers = Array.isArray(optimisticTeachers)
              ? optimisticTeachers.map((teacher) => (
                  teacher.teacherId === teacherId ? { ...teacher, gradesSubjects: [], subjectsUnique: [] } : teacher
                ))
              : optimisticTeachers;
            const clearedUsersMap = {
              ...optimisticUsersMap,
              [userId]: { ...(optimisticUsersMap[userId] || {}), isActive: false },
            };
            setTeachers(clearedTeachers);
            setUsersByUserId(clearedUsersMap);
            writeTeacherDirectoryEntryToCache(teacherId, (previousEntry) => ({
              ...previousEntry,
              isActive: false,
              gradesSubjects: [],
              subjectsUnique: [],
            }));
            persistTeachersCache(clearedTeachers, clearedUsersMap, gradeOptions);
          }
        } catch (e) {
          console.error('Error during unassign steps for deactivated teacher', e);
          console.warn("Teacher deactivated but failed to fully unassign from courses.");
        }
      } else {
        persistTeachersCache(optimisticTeachers, optimisticUsersMap, gradeOptions);
      }
    } catch (err) {
      console.error('submitAdminModal error:', err);
      // revert optimistic changes on failure
      setSelectedTeacherUser((prev) => (prev ? { ...prev, isActive: curBool } : prev));
      setUsersByUserId((prev) => ({ ...(prev || {}), [userId]: { ...((prev || {})[userId] || {}), isActive: curBool } }));
      setTeachers((prev) => (Array.isArray(prev) ? prev.map(t => t.userId === userId ? { ...t, isActive: curBool } : t) : prev));
      console.error(
        err?.message === "user_record_not_found"
          ? "User record not found in Users node."
          : `Failed to update teacher status: ${err?.message || "network error"}`
      );
    } finally {
      setAdminVerifying(false);
      setDeactivating(false);
      closeAdminModal();
    }
  };
  
  const [isPortrait, setIsPortrait] = useState(typeof window !== "undefined" ? window.innerWidth < window.innerHeight : false);
  const [isNarrow, setIsNarrow] = useState(typeof window !== "undefined" ? window.innerWidth < 900 : false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const navigate = useNavigate();
  const location = useLocation();
  const admin = bootstrapAdmin;
  const adminUserId = admin.userId;
  const adminId = admin.userId;
  const schoolCode = String(admin.schoolCode || "").trim();

  // ---------------- TEACHERS LIST (hook owns data layer) ----------------
  const {
    teachers, setTeachers,
    gradeOptions, setGradeOptions,
    usersByUserId, setUsersByUserId,
    filteredTeachers,
    loadingTeachers,
    teachersInitialized,
    paginationCursor,
    hasMoreTeachers,
    loadingMore,
    refreshTeachers,
    loadMoreTeachers,
    persistTeachersCache,
    writeTeacherDirectoryEntryToCache,
  } = useTeachersList({
    schoolCode,
    apiBase: API_BASE,
    selectedGrade,
    setSelectedGrade,
    searchTerm,
  });

  const dbRT = getDatabase(app);
  const weekOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const nowDate = new Date(nowTick);
  const currentDayName = nowDate.toLocaleDateString("en-US", { weekday: "long" });
  const currentMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
  const RTDB_BASE = "https://gojo-education-default-rtdb.firebaseio.com";
  const SCHOOL_DB_ROOT = schoolNodeBase(schoolCode);

  // ---- Teacher chat popup (state + Firebase listeners + send/typing handlers) ----
  // The hook also exposes `clearTypingForCurrent` and `getChatKey` for the
  // popup's close/expand buttons. When an unread message gets marked seen,
  // the hook calls `onUnreadCleared` so the local unreadTeachers map stays
  // in sync.
  const chatApi = useTeacherChat({
    adminUserId,
    teacher: selectedTeacher,
    isPopupOpen: teacherChatOpen,
    onUnreadCleared: (userId) =>
      setUnreadTeachers((prev) => ({ ...prev, [userId]: 0 })),
  });
  const {
    messages: popupMessages,
    input: popupInput,
    setInput: setPopupInput,
    typingUserId,
    messagesEndRef,
    handleTyping,
    sendMessage: sendPopupMessage,
    clearTypingForCurrent,
  } = chatApi;

  // ---- Lesson plans (fetch + state + refresh) ----
  // Replaces 15 useState declarations and 2 useEffects (~650 lines) that used
  // to live in this page. See src/hooks/useTeacherLessonPlans.js.
  const plansApi = useTeacherLessonPlans({
    teacher: selectedTeacher,
    isActiveTab: activeTab === "plan",
    schoolCode,
  });
  const {
    teacherDailyPlans,
    planWeeks,
    planCurrentWeeks,
    planCurrentWeekIndex,
    planSubmittedKeys,
    planSubmittedEntries,
    planCourseLabelMap,
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
    setPlanCurrentWeekIndex,
    refreshPlans,
  } = plansApi;

  const PRIMARY = "#007afb";
  const BACKGROUND = "#ffffff";
  const ACCENT = "#00B6A9";

  const chipStyle = (active) => ({
    padding: "6px 12px",
    borderRadius: "999px",
    background: active ? "var(--accent-strong)" : "var(--surface-accent)",
    color: active ? "#fff" : "var(--accent-strong)",
    cursor: "pointer",
    border: active ? "1px solid var(--accent-strong)" : "1px solid var(--border-strong)",
    fontSize: "11px",
    fontWeight: 700,
    whiteSpace: "nowrap",
    transition: "all 0.2s ease",
  });

  const shellCardStyle = {
    background: "var(--surface-panel)",
    border: "1px solid var(--border-soft)",
    borderRadius: 12,
    boxShadow: "var(--shadow-soft)",
  };

  const headerCardStyle = {
    ...shellCardStyle,
    borderRadius: 14,
    padding: "16px 18px 14px",
    position: "relative",
    overflow: "hidden",
    background: "linear-gradient(135deg, color-mix(in srgb, var(--surface-panel) 88%, white) 0%, color-mix(in srgb, var(--surface-panel) 94%, var(--surface-accent)) 100%)",
  };

  const contentWidth = isNarrow
    ? "100%"
    : !isPortrait
      ? "min(760px, max(320px, calc(100vw - 560px)))"
      : "760px";
  const FEED_MAX_WIDTH = "min(1320px, 100%)";
  const rightSidebarOffset = !isPortrait ? 408 : 2;
  const sidebarTeacherName = selectedTeacher?.name || "Teachers Workspace";
  const sidebarTeacherImage = selectedTeacher?.profileImage || "/default-profile.png";
  const sidebarTeacherEmail = selectedTeacherUser?.email || selectedTeacher?.email || "";
  const listCardStyle = (isSelected) => ({
    width: contentWidth,
    maxWidth: "100%",
    minHeight: isNarrow ? "76px" : "88px",
    borderRadius: "16px",
    padding: isNarrow ? "9px 10px" : "12px 14px",
    background: isSelected ? "var(--surface-accent)" : "var(--surface-panel)",
    border: isSelected ? "2px solid var(--accent-strong)" : "1px solid var(--border-soft)",
    boxShadow: isSelected ? "var(--shadow-glow)" : "var(--shadow-soft)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    boxSizing: "border-box",
    transition: "all 0.25s ease",
  });

  const rightDrawerCardStyle = {
    background: "var(--surface-panel)",
    borderRadius: 12,
    border: "1px solid var(--border-soft)",
    boxShadow: "var(--shadow-soft)",
  };

  const tabButtonStyle = (tab) => ({
    flex: 1,
    padding: "8px",
    background: activeTab === tab ? "var(--surface-accent)" : "transparent",
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    color: activeTab === tab ? "var(--accent-strong)" : "var(--text-muted)",
    fontSize: "11px",
    borderBottom:
      activeTab === tab
        ? "2px solid var(--accent-strong)"
        : "2px solid transparent",
    transition: "all 0.2s ease",
  });

  const contentLeft = 0;


  const getSchoolNodeUrl = (nodeName) => `${SCHOOL_DB_ROOT}/${nodeName}.json`;
  const readSchoolNode = async (nodeName) => {
    try {
      const response = await axios.get(`${API_BASE}/school-node-read`, {
        params: { schoolCode, path: nodeName },
        timeout: 7000,
      });
      return response?.data?.data || {};
    } catch (err) {
      return {};
    }
  };



  useEffect(() => {
    const tick = () => setNowTick(Date.now());
    const intervalId = setInterval(tick, 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    try {
      const value = JSON.stringify({ selectedGrade, searchTerm });
      sessionStorage.setItem(TEACHERS_UI_STATE_KEY, value);
      localStorage.setItem(TEACHERS_UI_STATE_KEY, value);
    } catch {
      // ignore UI state cache write errors
    }
  }, [selectedGrade, searchTerm, TEACHERS_UI_STATE_KEY]);

  const getPeriodRangeMinutes = (label) => {
    if (!label) return null;
    const text = String(label);
    const match = text.match(/(\d{1,2}):(\d{2})\s*[â€“-]\s*(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const toMinutes = (hStr, mStr) => {
      let h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      if (h < 8) h += 12; // afternoon/evening schedule without AM/PM
      return h * 60 + m;
    };
    const start = toMinutes(match[1], match[2]);
    const end = toMinutes(match[3], match[4]);
    if (start === null || end === null) return null;
    return { start, end };
  };

  const downloadTeacherTimetablePdf = () => {
    try {
      if (!selectedTeacher) return;
      if (!teacherSchedule || Object.keys(teacherSchedule).length === 0) return;

      const teacherName = (selectedTeacher?.name || "Teacher").toString().trim();
      const safeName = teacherName.replace(/[<>:"/\\|?*]+/g, "").trim() || "Teacher";
      const fileName = `${safeName}_Weekly_Timetable.pdf`;

      const days = weekOrder.filter((d) => teacherSchedule[d]);
      const periodKeySet = new Set();
      days.forEach((day) => {
        const periods = teacherSchedule?.[day] || {};
        Object.keys(periods).forEach((p) => periodKeySet.add(p));
      });

      const sortPeriodKeys = (keys) => {
        return [...keys].sort((a, b) => {
          const sa = String(a || "");
          const sb = String(b || "");
          const na = (sa.match(/\d+/) || [null])[0];
          const nb = (sb.match(/\d+/) || [null])[0];
          if (na !== null && nb !== null) {
            const ia = parseInt(na, 10);
            const ib = parseInt(nb, 10);
            if (!Number.isNaN(ia) && !Number.isNaN(ib) && ia !== ib) return ia - ib;
          }
          return sa.localeCompare(sb);
        });
      };

      const periodKeys = sortPeriodKeys(Array.from(periodKeySet));

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const marginX = 40;
      const titleY = 40;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Weekly Teaching Timetable", marginX, titleY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const metaStartY = titleY + 18;
      const emailText = (selectedTeacherUser?.email || selectedTeacher?.email || "").toString();
      const subjectsText = (selectedTeacher?.subjectsUnique || []).join(", ");
      doc.text(`Teacher: ${teacherName}`, marginX, metaStartY);
      doc.text(`Email: ${emailText}`, marginX, metaStartY + 14);
      doc.text(`Subjects: ${subjectsText}`, marginX, metaStartY + 28);
      doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, metaStartY + 42);

      const tableHead = [["Period", ...days]];
      const tableBody = periodKeys.map((periodKey) => {
        return [
          periodKey,
          ...days.map((day) => {
            const entries = teacherSchedule?.[day]?.[periodKey] || [];
            if (!Array.isArray(entries) || entries.length === 0) return "";
            const labels = entries
              .map((e) => {
                const subject = (e?.subject || "").toString().trim();
                const cls = (e?.class || "").toString().trim();
                if (subject && cls) return `${subject} (${cls})`;
                return subject || cls;
              })
              .filter(Boolean);
            return Array.from(new Set(labels)).join("\n");
          }),
        ];
      });

      autoTable(doc, {
        startY: metaStartY + 60,
        head: tableHead,
        body: tableBody,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 9,
          cellPadding: 4,
          valign: "top",
        },
        headStyles: {
          fillColor: [30, 64, 175],
          textColor: 255,
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 90 },
        },
      });

      doc.save(fileName);
    } catch (e) {
      console.error("Failed to export teacher timetable:", e);
    }
  };

  const dayOrder = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };


useEffect(() => {
  const closeDropdown = (e) => {
    if (
      !e.target.closest(".icon-circle") &&
      !e.target.closest(".notification-dropdown")
    ) {
      setShowPostDropdown(false);
    }
  };

  document.addEventListener("click", closeDropdown);
  return () => document.removeEventListener("click", closeDropdown);
}, []);


  
  



  useEffect(() => {
    if (!selectedTeacher?.userId) {
      setSelectedTeacherUser(null);
      return;
    }

    setSelectedTeacherUser(usersByUserId[selectedTeacher.userId] || null);
  }, [selectedTeacher, usersByUserId]);


  // Ensure selected teacher remains visible even if filters exclude them
  const displayedTeachers = (() => {
    const list = Array.isArray(filteredTeachers) ? [...filteredTeachers] : [];
    try {
      const sel = selectedTeacher || (selectedTeacherUser ? teachers.find(tt => tt.userId === selectedTeacherUser.userId) : null);
      if (sel) {
        const exists = list.some((x) => (x.teacherId && sel.teacherId && x.teacherId === sel.teacherId) || (x.userId && sel.userId && x.userId === sel.userId));
        if (!exists) {
          // prepend selected teacher so UI keeps showing details
          list.unshift(sel);
        }
      }
    } catch (e) {
      // ignore
    }
    return list;
  })();

  // debug: why filteredTeachers may be empty
  useEffect(() => {
    try {
      console.debug('Teachers filter debug', {
        selectedGrade,
        gradeOptions,
        teachersCount: Array.isArray(teachers) ? teachers.length : 0,
        filteredCount: Array.isArray(filteredTeachers) ? filteredTeachers.length : 0,
        searchTerm,
        sampleTeachers: Array.isArray(teachers) ? teachers.slice(0,3) : []
      });
    } catch (e) {}
  }, [selectedGrade, gradeOptions, teachers, filteredTeachers, searchTerm]);



// Schedule fetching moved to useTeacherSchedule hook (see top of component).



// Lesson plans fetching lives in src/hooks/useTeacherLessonPlans.js.


// Chat helpers (getChatKey, ensureChatRoot, maybeMarkLastMessageSeenForAdmin,
// clearTyping, handleTyping) all live in useTeacherChat now â€” see hook call
// near the top of the component.

//----------------------Fetch unread messages for teachers--------------------

      useEffect(() => {
  if (!adminUserId || teachers.length === 0) return;

  const fetchUnreadTeachers = async () => {
    const unread = {};

    try {
            const unreadRes = await axios.get(`${API_BASE}/unread_messages/${encodeURIComponent(adminUserId)}`, {
              timeout: 10000,
            }).catch(() => ({ data: { messages: [] } }));
            const unreadMessages = Array.isArray(unreadRes?.data?.messages) ? unreadRes.data.messages : [];
            const summariesByOtherUserId = unreadMessages.reduce((result, msg) => {
              const senderId = String(msg?.senderId || "").trim();
              if (!senderId) return result;
              result[senderId] = Number(result[senderId] || 0) + 1;
              return result;
            }, {});

      teachers.forEach((teacherEntry) => {
        const count = Number(summariesByOtherUserId[teacherEntry.userId] || 0);
        if (count > 0) {
          unread[teacherEntry.userId] = count;
        }
      });
    } catch (err) {
      console.error(err);
    }

    setUnreadTeachers(unread);
  };

  fetchUnreadTeachers();
}, [teachers, adminUserId]);


// sendPopupMessage, getUnreadCount, and the chat-related setup helpers all
// live in useTeacherChat now. The hook's exposed `sendMessage` is aliased
// to the legacy name `sendPopupMessage` at the hook call site above.



  // ---------------- CLOSE DROPDOWN ON OUTSIDE CLICK ----------------
useEffect(() => {
  const closeDropdown = (e) => {
    if (
      !e.target.closest(".icon-circle") &&
      !e.target.closest(".messenger-dropdown")
    ) {
      setShowMessageDropdown(false);
    }
  };

  document.addEventListener("click", closeDropdown);
  return () => document.removeEventListener("click", closeDropdown);
}, []);


// Firebase chat listeners (messages + typing indicator) live inside
// useTeacherChat now â€” removed from the page body.



 const fetchPostNotifications = async () => {
  if (!adminId || !schoolCode) {
    setPostNotifications([]);
    return;
  }

  try {
    const response = await axios.get(`${API_BASE}/get_post_notifications/${encodeURIComponent(adminId)}`, {
      params: { schoolCode },
      timeout: 12000,
    });
    const notifications = Array.isArray(response?.data)
      ? response.data
      : (Array.isArray(response?.data?.notifications) ? response.data.notifications : []);

    setPostNotifications(notifications);
  } catch (err) {
    // Keep current UI state during transient backend latency/timeouts.
    if (String(err?.code || "") !== "ECONNABORTED") {
      console.warn("Post notification fetch failed", err?.message || err);
    }
  }
};


  useEffect(() => {
    if (!adminId || !schoolCode) return undefined;

    const runFocusedRefresh = () => {
      lastNotificationInteractionAtRef.current = Date.now();
      fetchPostNotifications();
    };

    const runPassiveRefresh = () => {
      if (!shouldRunPassiveNotificationRefresh()) {
        return;
      }

      fetchPostNotifications();
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      runFocusedRefresh();
    };

    runFocusedRefresh();
    const interval = window.setInterval(runPassiveRefresh, NOTIFICATION_REFRESH_MS);
    window.addEventListener("focus", runFocusedRefresh);
    window.addEventListener("online", runFocusedRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", runFocusedRefresh);
      window.removeEventListener("online", runFocusedRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [adminId, schoolCode]);

 const handleNotificationClick = async (notification) => {
  try {
    await axios.post(`${API_BASE}/mark_post_notification_read`, {
      schoolCode,
      adminId: admin.userId,
      postId: notification?.postId,
    });
  } catch (err) {
    console.warn("Failed to mark post as seen:", err);
  }

  // ðŸ”¥ REMOVE FROM UI IMMEDIATELY
  setPostNotifications((prev) =>
    prev.filter((n) => n.notificationId !== notification.notificationId)
  );

  setShowPostDropdown(false);

  // âžœ Navigate to post
  navigate("/dashboard", {
    state: { postId: notification.postId },
  });
};
useEffect(() => {
  if (location.state?.postId) {
    setPostNotifications([]);
  }
}, []);


  useEffect(() => {
    const closeDropdown = (e) => {
      if (
        !e.target.closest(".icon-circle") &&
        !e.target.closest(".notification-dropdown")
      ) {
        setShowPostDropdown(false);
      }
    };

    document.addEventListener("click", closeDropdown);
    return () => document.removeEventListener("click", closeDropdown);
  }, []);


  const toggleDropdown = () => {
    setShowMessageDropdown((prev) => !prev);
  };

  useEffect(() => {
    const closeDropdown = (e) => {
      setShowMessageDropdown(false);
    };

    document.addEventListener("click", closeDropdown);
    return () => document.removeEventListener("click", closeDropdown);
  }, []);

  const handleClick = () => {
    navigate("/all-chat");
  };

  // ---------------- FETCH UNREAD MESSAGES ----------------
  const fetchUnreadMessages = async () => {
    if (!admin.userId) return;

    try {
      const unreadRes = await axios.get(`${API_BASE}/unread_messages/${encodeURIComponent(admin.userId)}`, {
        timeout: 12000,
      });
      const unreadMessages = Array.isArray(unreadRes?.data?.messages) ? unreadRes.data.messages : [];
      const unreadCounts = unreadMessages.reduce((acc, msg) => {
        const senderId = String(msg?.senderId || "").trim();
        if (!senderId) return acc;
        acc[senderId] = Number(acc[senderId] || 0) + 1;
        return acc;
      }, {});

      const senderIds = Object.keys(unreadCounts);
      if (!senderIds.length) {
        setUnreadSenders({});
        return;
      }

      const usersLookupRes = await axios.get(`${API_BASE}/users_lookup`, {
        params: { schoolCode, userIds: senderIds.join(",") },
        timeout: 12000,
      }).catch(() => ({ data: { users: {} } }));
      const users = usersLookupRes?.data?.users && typeof usersLookupRes.data.users === "object"
        ? usersLookupRes.data.users
        : {};

      const senders = senderIds.reduce((acc, senderId) => {
        const user = users[senderId] || {};
        acc[senderId] = {
          type: String(user?.role || "").toLowerCase() || "teacher",
          name: user?.name || user?.username || senderId,
          profileImage: getSafeProfileImage(user?.profileImage, "/default-profile.png"),
          count: Number(unreadCounts[senderId] || 0),
        };
        return acc;
      }, {});

      setUnreadSenders(senders);
    } catch (err) {
      if (String(err?.code || "") !== "ECONNABORTED") {
        console.warn("Unread fetch failed:", err?.message || err);
      }
    }
  };

  // ---------------- CLOSE DROPDOWN WHEN CLICKING OUTSIDE ----------------
  useEffect(() => {
    const closeDropdown = (e) => {
      if (!e.target.closest(".icon-circle") && !e.target.closest(".messenger-dropdown")) {
        setShowMessageDropdown(false);
      }
    };

    document.addEventListener("click", closeDropdown);
    return () => document.removeEventListener("click", closeDropdown);
  }, []);

  useEffect(() => {
    if (!admin.userId) return undefined;

    const runFocusedRefresh = () => {
      lastNotificationInteractionAtRef.current = Date.now();
      fetchUnreadMessages();
    };

    const runPassiveRefresh = () => {
      if (!shouldRunPassiveNotificationRefresh()) {
        return;
      }

      fetchUnreadMessages();
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      runFocusedRefresh();
    };

    runFocusedRefresh();
    const interval = window.setInterval(runPassiveRefresh, NOTIFICATION_REFRESH_MS);
    window.addEventListener("focus", runFocusedRefresh);
    window.addEventListener("online", runFocusedRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", runFocusedRefresh);
      window.removeEventListener("online", runFocusedRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [admin.userId]);

  const markMessagesAsSeen = async (userId) => {
    const key1 = `${admin.userId}_${userId}`;
    const key2 = `${userId}_${admin.userId}`;

    const [r1, r2] = await Promise.all([
      axios.get(
        `${RTDB_BASE}/Chats/${key1}/messages.json`
      ),
      axios.get(
        `${RTDB_BASE}/Chats/${key2}/messages.json`
      ),
    ]);

    const updates = {};

    const collectUpdates = (data, basePath) => {
      Object.entries(data || {}).forEach(([msgId, msg]) => {
        if (msg.receiverId === admin.userId && !msg.seen) {
          updates[`${basePath}/${msgId}/seen`] = true;
        }
      });
    };

    collectUpdates(r1.data, `Chats/${key1}/messages`);
    collectUpdates(r2.data, `Chats/${key2}/messages`);

    if (Object.keys(updates).length > 0) {
      await axios.patch(
        `${RTDB_BASE}/.json`,
        updates
      );
    }
  };

  // badge counts (match MyPosts UI)
  const messageCount = Object.values(unreadSenders || {}).reduce((acc, s) => acc + (s.count || 0), 0);
  const totalNotifications = (postNotifications?.length || 0) + messageCount;














  return (
    <div
      className="dashboard-page"
      style={{
        background: BACKGROUND,
        minHeight: "100vh",
        color: "var(--text-primary)",
        "--page-bg": BACKGROUND,
        "--page-bg-secondary": "#F7FBFF",
        "--surface-panel": BACKGROUND,
        "--surface-muted": "#F8FBFF",
        "--surface-accent": "#EAF4FF",
        "--surface-strong": "#D7E7FB",
        "--border-soft": "#D7E7FB",
        "--border-strong": "#B5D2F8",
        "--text-primary": "#0f172a",
        "--text-secondary": "#334155",
        "--text-muted": "#64748b",
        "--accent": PRIMARY,
        "--accent-soft": "#E7F2FF",
        "--accent-strong": PRIMARY,
        "--success": ACCENT,
        "--success-soft": "#E9FBF9",
        "--success-border": "#AAEDE7",
        "--warning": "#DC2626",
        "--warning-soft": "#FEE2E2",
        "--warning-border": "#FCA5A5",
        "--danger": "#b91c1c",
        "--danger-border": "#fca5a5",
        "--sidebar-width": "clamp(230px, 16vw, 290px)",
        "--surface-overlay": "#F1F8FF",
        "--input-bg": BACKGROUND,
        "--input-border": "#B5D2F8",
        "--shadow-soft": "0 10px 24px rgba(0, 122, 251, 0.10)",
        "--shadow-panel": "0 14px 30px rgba(0, 122, 251, 0.14)",
        "--shadow-glow": "0 0 0 2px rgba(0, 122, 251, 0.18)",
        "--on-accent": "#ffffff",
      }}
    >
      <div className="google-dashboard" style={{ display: "flex", gap: 14, padding: "18px 14px", minHeight: "100vh", background: "var(--page-bg)", width: "100%", boxSizing: "border-box", alignItems: "flex-start" }}>
        <div
          className="admin-sidebar-spacer"
          style={{
            width: "var(--sidebar-width)",
            minWidth: "var(--sidebar-width)",
            flex: "0 0 var(--sidebar-width)",
            pointerEvents: "none",
          }}
        />

        {/* ---------------- MAIN CONTENT ---------------- */}
        <div
          className="main-content google-main"
          style={{
            flex: "1 1 0",
            minWidth: 0,
            maxWidth: "none",
            margin: "0",
            boxSizing: "border-box",
            alignSelf: "flex-start",
            minHeight: "calc(100vh - 24px)",
            overflowY: "visible",
            overflowX: "hidden",
            position: "relative",
            scrollbarWidth: "thin",
            scrollbarColor: "transparent transparent",
            padding: `0 ${rightSidebarOffset}px 0 2px`,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div className="main-inner" style={{ width: "100%", maxWidth: FEED_MAX_WIDTH, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 56 }}>
            <div
              className="section-header-card"
              style={headerCardStyle}
            >
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg, var(--accent), var(--accent-strong), color-mix(in srgb, var(--accent) 68%, white))" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.01em" }}>Teachers</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)", maxWidth: 620, lineHeight: 1.5 }}>
                    Manage faculty, schedules, lesson plans, and communication from the same premium admin workspace used across the rest of the platform.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14, position: "relative", zIndex: 1 }}>
                <div style={{ padding: "7px 12px", borderRadius: 999, background: "color-mix(in srgb, var(--surface-panel) 72%, white)", border: "1px solid var(--border-soft)", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                  Total: {filteredTeachers.length}
                </div>
                <div style={{ padding: "7px 12px", borderRadius: 999, background: "color-mix(in srgb, var(--surface-panel) 72%, white)", border: "1px solid var(--border-soft)", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                  {selectedGrade === "All" ? "All Grades" : selectedGrade === "Deactive" ? "Deactivated" : selectedGrade === "Unassigned" ? "Unassigned" : `Grade ${selectedGrade}`}
                </div>
                <button
                  type="button"
                  onClick={refreshTeachers}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 999,
                    background: "color-mix(in srgb, var(--surface-panel) 72%, white)",
                    border: "1px solid var(--border-soft)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  Refresh
                </button>
              </div>
            </div>

          {/* Search */}
          <div style={{ display: "flex", justifyContent: isNarrow ? "center" : "flex-start", marginBottom: "10px", paddingLeft: contentLeft }}>
            <div
              style={{
                width: contentWidth,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "var(--surface-panel)",
                border: "1px solid var(--border-soft)",
                borderRadius: "12px",
                padding: "10px 12px",
                boxShadow: "var(--shadow-soft)",
              }}
            >
              <FaSearch style={{ color: "var(--text-muted)", fontSize: 14 }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search teachers by name, subject, or grade"
                style={{
                  border: "none",
                  outline: "none",
                  width: "100%",
                  fontSize: 13,
                  color: "var(--text-primary)",
                  background: "transparent",
                }}
              />
            </div>
          </div>

          {/* Grade Filter */}
          <div style={{ display: "flex", justifyContent: isNarrow ? "center" : "flex-start", marginBottom: "10px", paddingLeft: contentLeft }}>
            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                justifyContent: "center",
                maxWidth: "100%",
                overflowX: "auto",
                paddingBottom: 1,
              }}
            >
              {(["All", "Deactive", "Unassigned", ...gradeOptions]).map(g => (
                <button
                  key={g}
                  onClick={() => setSelectedGrade(g)}
                  style={chipStyle(selectedGrade === g)}
                >
                  {g === "All" ? "All Teachers" : g === "Deactive" ? "Deactivated" : g === "Unassigned" ? "Unassigned" : `Grade ${g}`}
                </button>
              ))}
            </div>
          </div>

          {/* Teachers List */}
          {(!teachersInitialized || (loadingTeachers && displayedTeachers.length === 0)) ? (
            <p style={{ width: contentWidth, textAlign: "center", color: "var(--text-muted)", margin: "0 auto" }}>Loading teachers...</p>
          ) : displayedTeachers.length === 0 ? (
            <p style={{ width: contentWidth, textAlign: "center", color: "var(--text-muted)", margin: "0 auto" }}>No teachers found for this grade.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: isNarrow ? "center" : "flex-start", gap: "12px", paddingLeft: contentLeft }}>
              {/*
                Slot height must be â‰¥ card's minHeight + vertical padding + desired
                visual gap, otherwise each card bleeds into the next slot.
                  Wide:    card minHeight 88 + 6+6 padding = 100, + 8 gap = 108
                  Narrow:  card minHeight 76 + 6+6 padding =  88, + 8 gap =  96
              */}
              <FixedSizeList
                height={Math.min(600, displayedTeachers.length * (isNarrow ? 96 : 108))}
                itemCount={displayedTeachers.length}
                itemSize={isNarrow ? 96 : 108}
                width={contentWidth}
                style={{ maxWidth: "100%" }}
              >
                {({ index, style }) => {
                  const t = displayedTeachers[index];
                  return (
                    <div style={{ ...style, padding: "6px 0" }}>
                      <div
                        key={t.teacherId}
                        onClick={() => setSelectedTeacher(t)}
                        className="teacher-card"
                        style={listCardStyle(selectedTeacher?.teacherId === t.teacherId)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: isNarrow ? 8 : 12, minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              width: isNarrow ? 30 : 36,
                              height: isNarrow ? 30 : 36,
                              borderRadius: isNarrow ? 8 : 10,
                              background: "var(--surface-accent)",
                              color: "var(--accent)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: isNarrow ? 11 : 13,
                              flex: "0 0 auto",
                            }}
                          >
                            {index + 1}
                          </div>
                          <ProfileAvatar src={t.profileImage} name={t.name} alt={t.name} loading="lazy" style={{ width: isNarrow ? 40 : 48, height: isNarrow ? 40 : 48, borderRadius: "50%", border: selectedTeacher?.teacherId === t.teacherId ? "2px solid var(--accent)" : "2px solid var(--border-soft)", objectFit: "cover", transition: "all 0.3s ease", flex: "0 0 auto" }} />
                          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <h3 style={{ margin: 0, fontSize: isNarrow ? "12px" : "14px", color: "var(--text-primary)", fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</h3>
                            {unreadTeachers[t.userId] > 0 && (
                              <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 12, padding: isNarrow ? '1px 5px' : '2px 6px', fontSize: isNarrow ? 10 : 11, fontWeight: 700, marginLeft: 8 }}>{unreadTeachers[t.userId]}</span>
                            )}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: isNarrow ? "10px" : "11px", marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.subjectsUnique?.length > 0 ? t.subjectsUnique.join(', ') : 'No assigned courses'}
                          </div>
                          </div>
                        </div>

                        <div style={{ flex: "0 0 auto", marginLeft: isNarrow ? 4 : 8 }}>
                          <span
                            style={{
                              padding: isNarrow ? "4px 8px" : "5px 10px",
                              borderRadius: 999,
                              border: "1px solid var(--border-soft)",
                              background: "color-mix(in srgb, var(--surface-panel) 78%, white)",
                              color: "var(--text-secondary)",
                              fontSize: isNarrow ? 9 : 10,
                              fontWeight: 800,
                              letterSpacing: "0.2px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {t.subjectsUnique?.length || 0} Subject{(t.subjectsUnique?.length || 0) === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              </FixedSizeList>
              
              {/* Load More Button */}
              {hasMoreTeachers && !loadingMore && (
                <button
                  onClick={loadMoreTeachers}
                  style={{
                    width: contentWidth,
                    maxWidth: "100%",
                    padding: "12px 16px",
                    background: "var(--accent-strong)",
                    border: "none",
                    borderRadius: "12px",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 800,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow: "var(--shadow-soft)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--accent-hover)";
                    e.currentTarget.style.transform = "scale(1.02)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--accent-strong)";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  Load More Teachers
                </button>
              )}
              
              {/* Loading More Indicator */}
              {loadingMore && (
                <div style={{ width: contentWidth, maxWidth: "100%", textAlign: "center", padding: "12px", color: "var(--text-muted)", fontSize: "13px" }}>
                  Loading more teachers...
                </div>
              )}
            </div>
          )}
          </div>
        </div>

        {/* ---------------- RIGHT SIDEBAR ---------------- */}
        {/* ---------------- RIGHT SIDEBAR ---------------- */}
        <TeacherDetailSidebar
          isPortrait={isPortrait}
          selectedTeacher={selectedTeacher}
          setSelectedTeacher={setSelectedTeacher}
          sidebarTeacherImage={sidebarTeacherImage}
          sidebarTeacherName={sidebarTeacherName}
          sidebarTeacherEmail={sidebarTeacherEmail}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          tabButtonStyle={tabButtonStyle}
          teachers={teachers}
          filteredTeachers={filteredTeachers}
          selectedGrade={selectedGrade}
          searchTerm={searchTerm}
          rightDrawerCardStyle={rightDrawerCardStyle}
          detailsTabProps={{
            selectedTeacher,
            selectedTeacherUser,
            deactivating,
            onToggleActive: handleToggleActiveTeacher,
          }}
          scheduleTabProps={{
            schedule: teacherSchedule,
            currentDayName,
            currentMinutes,
            onDownloadPdf: downloadTeacherTimetablePdf,
          }}
          planTabProps={{
            selectedTeacher,
            planWeeks,
            planCurrentWeeks,
            planSubmittedKeys,
            planSubmittedEntries,
            teacherDailyPlans,
            planCourseLabelMap,
            planLoading,
            planError,
            planSelectedCourseId,
            setPlanSelectedCourseId,
            planSidebarTab,
            setPlanSidebarTab,
            planSidebarOpen,
            setPlanSidebarOpen,
            planAnnualOpen,
            setPlanAnnualOpen,
            planShowSubmittedTable,
            setPlanShowSubmittedTable,
            isPortrait,
            refreshPlans,
          }}
          onOpenChat={() => setTeacherChatOpen(true)}
        />
 

      </div>

      <TeacherChatPopup
        isOpen={teacherChatOpen && Boolean(selectedTeacher)}
        teacher={selectedTeacher}
        adminUserId={adminUserId}
        messages={popupMessages}
        input={popupInput}
        setInput={setPopupInput}
        typingUserId={typingUserId}
        messagesEndRef={messagesEndRef}
        onTyping={handleTyping}
        onSend={sendPopupMessage}
        onClose={() => setTeacherChatOpen(false)}
        onExpand={() => {
          setTeacherChatOpen(false);
          navigate("/all-chat", { state: { user: selectedTeacher, tab: "teacher" } });
        }}
        onClearTyping={clearTypingForCurrent}
      />
      <AdminVerifyModal
        isOpen={showAdminModal}
        pendingAction={pendingToggle}
        username={adminModalUsername}
        setUsername={setAdminModalUsername}
        password={adminModalPassword}
        setPassword={setAdminModalPassword}
        error={adminModalError}
        verifying={adminVerifying}
        onCancel={closeAdminModal}
        onConfirm={submitAdminModal}
      />
    </div>
  );
}

export default TeachersPage;
