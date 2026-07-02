import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  FaHome, FaFileAlt, FaChalkboardTeacher, FaCog, 
  FaSignOutAlt, FaBell, FaFacebookMessenger, FaSearch, FaCalendarAlt, FaCommentDots, FaCheck, FaPaperPlane, FaChartLine, FaChevronDown, FaTimes, FaExpand
} from "react-icons/fa";
import axios from "axios";
import { format, parseISO, startOfWeek, startOfMonth } from "date-fns";
import { useMemo } from "react";
import { getDatabase, ref, onValue, push, update } from "firebase/database";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FixedSizeList } from 'react-window';

import app, { db, firestore } from "../firebase"; // Adjust the path if needed
import { BACKEND_BASE } from "../config.js";
import ProfileAvatar from "../components/ProfileAvatar";
import {
  buildChatKeyCandidates,
  buildChatSummaryPath,
  buildChatSummaryUpdate,
  buildOwnerChatSummariesPath,
  normalizeChatSummaryValue,
  uniqueNonEmptyValues,
} from "../utils/chatRtdb";
import { fetchCachedJson, readCachedJson, writeCachedJson } from "../utils/rtdbCache";
import { schoolNodeBase } from "../utils/schoolDbRouting";
import useStudentsList from "../hooks/students/useStudentsList";
import useStudentChat from "../hooks/chat/useStudentChat";
import useStudentPerformance from "../hooks/students/useStudentPerformance";
import StudentAttendanceTab from "../components/dashboard/students/StudentAttendanceTab";
import StudentPerformanceTab from "../components/dashboard/students/StudentPerformanceTab";
import StudentPaymentTab from "../components/dashboard/students/StudentPaymentTab";
import StudentDetailsTab from "../components/dashboard/students/StudentDetailsTab";



function StudentsPage() {
  const API_BASE = `${BACKEND_BASE}/api`;
  // ------------------ STATES ------------------
  const [teachers, setTeachers] = useState([]);
  const [selectedGrade, setSelectedGrade] = useState("All"); // Grade filter
  const [selectedSection, setSelectedSection] = useState("All"); // Section filter
  const [searchTerm, setSearchTerm] = useState("");
  const [sections, setSections] = useState([]); // Sections available for selected grade
  const [selectedStudent, setSelectedStudent] = useState(null); // Currently selected student
  const studentSelectionRequestRef = useRef(0);
  const [details, setDetails] = useState(null);
  const [studentTab, setStudentTab] = useState("details");
  
  // Pagination states
  
  // React Query client for cache management
  const queryClient = useQueryClient();
  const [editingProfile, setEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAdminUsername, setConfirmAdminUsername] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");
  const [studentFullscreenOpen, setStudentFullscreenOpen] = useState(false);
  const [fullscreenEditing, setFullscreenEditing] = useState(false);
  const [fullscreenSaving, setFullscreenSaving] = useState(false);
  const [fullscreenSectionCollapsed, setFullscreenSectionCollapsed] = useState({});
  const [fullscreenEditForm, setFullscreenEditForm] = useState({ sections: {}, additional: {} });
  const [dashboardMenuOpen, setDashboardMenuOpen] = useState(true);
  const [studentMenuOpen, setStudentMenuOpen] = useState(true);
  const navigate = useNavigate();

  // Prefer the best available session payload. Sometimes `finance` can be stale/empty
  // while `admin` still contains a valid adminId/userId (or vice-versa).
  const getStoredAuth = () => {
    const parse = (raw) => {
      try {
        return JSON.parse(raw || "") || {};
      } catch (e) {
        return {};
      }
    };

    const rawAdmin = localStorage.getItem("admin");
    const adminObj = parse(rawAdmin);

    const hasIdentity = (obj) => Boolean(obj && (obj.financeId || obj.adminId || obj.userId));

    if (hasIdentity(adminObj)) return { raw: rawAdmin, data: adminObj, source: "admin" };

    return { raw: rawAdmin, data: adminObj || {}, source: "admin" };
  };

  const toggleStudentActive = async () => {
    if (!selectedStudent) return;
    const newActive = !selectedStudent.isActive;
    setTogglingActive(true);
    try {
      const payload = { isActive: newActive };
      if (selectedStudent.studentId) {
        await patchSchoolNodeApi(`Students/${selectedStudent.studentId}`, payload);
      }
      if (selectedStudent.userId) {
        await patchSchoolNodeApi(`Users/${selectedStudent.userId}`, payload);
      }
      if (selectedStudent.studentId) {
        await patchSchoolNodeApi(`StudentDirectory/${selectedStudent.studentId}`, payload).catch(() => undefined);
        writeStudentDirectoryEntryToCache(selectedStudent.studentId, (previousEntry) => ({
          ...previousEntry,
          ...payload,
        }));
      }
      const updated = { ...(selectedStudent || {}), ...payload };
      setSelectedStudent(updated);
      setStudents((prev) => {
        const nextStudents = prev.map((p) =>
          p.studentId === selectedStudent.studentId || p.userId === selectedStudent.userId
            ? { ...(p || {}), ...payload }
            : p
        );
        writeStudentsCache({
          studentList: nextStudents,
          gradeOptions,
          currentAcademicYear,
        });
        return nextStudents;
      });
    } catch (err) {
      console.error("Toggle active error:", err);
      alert("Could not update student status: " + (err.message || err));
    } finally {
      setTogglingActive(false);
    }
  };

  const openConfirmModal = () => {
    setShowConfirmModal(true);
  };

  const closeConfirmModal = () => {
    setShowConfirmModal(false);
    setConfirmAdminUsername("");
    setConfirmAdminPassword("");
  };

  const confirmToggle = async () => {
    if (!confirmAdminUsername || !confirmAdminPassword) {
      alert("Enter admin credentials to confirm.");
      return;
    }
    try {
      await toggleStudentActive();
      closeConfirmModal();
    } catch (err) {
      // toggleStudentActive handles errors
    }
  };

  const _storedFinance = (() => {
    return getStoredAuth().data || {};
  })();

  const initialSchoolCode = _storedFinance.schoolCode || "";
  const DB_URL = schoolNodeBase(initialSchoolCode);
  const readSchoolNodeApi = async (path, fallbackValue = {}) => {
    const effectiveSchoolCode = String(finance?.schoolCode || initialSchoolCode || "").trim();
    if (!effectiveSchoolCode) {
      return fallbackValue;
    }
    try {
      const response = await axios.get(`${API_BASE}/school-node-read`, {
        params: { schoolCode: effectiveSchoolCode, path },
        timeout: 12000,
      });
      const data = response?.data?.data;
      return data === null || data === undefined ? fallbackValue : data;
    } catch {
      return fallbackValue;
    }
  };
  const patchSchoolNodeApi = async (path, patchValue = {}) => {
    const effectiveSchoolCode = String(finance?.schoolCode || initialSchoolCode || "").trim();
    if (!effectiveSchoolCode) {
      throw new Error("Missing schoolCode");
    }
    const currentValue = await readSchoolNodeApi(path, {});
    const baseValue =
      currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
        ? currentValue
        : {};
    const nextValue = {
      ...baseValue,
      ...(patchValue || {}),
    };

    await axios.put(
      `${API_BASE}/school-node`,
      {
        schoolCode: effectiveSchoolCode,
        path,
        value: nextValue,
      },
      { timeout: 12000 }
    );

    return nextValue;
  };





  const [finance, setFinance] = useState({
    financeId: _storedFinance.financeId || _storedFinance.adminId || "",
    userId: _storedFinance.userId || "",
    schoolCode: _storedFinance.schoolCode || "",
    name: _storedFinance.name || _storedFinance.username || "Register Office",
    username: _storedFinance.username || "",
    profileImage: _storedFinance.profileImage || "/default-profile.png",
    isActive: _storedFinance.isActive || false,
  });

  // Compatibility alias: map `finance` to `admin` for older code
  const admin = {
    adminId: finance.financeId || finance.adminId || "",
    userId: finance.userId || "",
    name: finance.name || finance.username || "Register Office",
    profileImage: finance.profileImage || "/default-profile.png",
    isActive: finance.isActive || false,
  };

  // include username for sidbar display (comes from Users node)
  admin.username = finance.username || "";

  const adminId = admin?.adminId || admin?.userId || null;
  const adminUserId = admin?.userId || null;
  const activeSchoolCode = String(finance?.schoolCode || initialSchoolCode || "").trim();

  const [loadingFinance, setLoadingFinance] = useState(true);

  // ---------------- STUDENTS LIST (hook owns data layer) ----------------
  const {
    students, setStudents,
    gradeOptions, setGradeOptions,
    currentAcademicYear, setCurrentAcademicYear,
    filteredStudentsBase,
    currentYearStudents,
    lastYearStudents,
    previousAcademicYearKey,
    studentsLoading,
    paginationCursor,
    hasMoreStudents,
    loadingMore,
    loadMoreStudents,
    persistStudentList,
    writeStudentsCache,
    writeStudentDirectoryEntryToCache,
  } = useStudentsList({
    schoolCode: activeSchoolCode,
    apiBase: API_BASE,
    loadingFinance,
    selectedGrade,
    setSelectedGrade,
    selectedSection,
    searchTerm,
  });

  // ---------------- STUDENT CHAT (hook owns chat data layer) ----------------
  const {
    studentChatOpen, setStudentChatOpen,
    popupMessages, setPopupMessages,
    popupInput, setPopupInput,
    newMessageText, setNewMessageText,
    unreadMap,
    messagesEndRef,
    sendPopupMessage,
    sendMessage,
    getStudentIdentityCandidates,
  } = useStudentChat({
    selectedStudent,
    students,
    adminUserId,
    adminId,
    dbUrl: DB_URL,
  });

  // ---------------- STUDENT PERFORMANCE (hook owns marks/attendance/payment) ----------------
  const {
    studentMarks, setStudentMarks,
    studentMarksFlattened,
    attendance, setAttendance,
    paymentHistory, setPaymentHistory,
    gradeSubjectsByGrade,
    gradeSubjectsLoaded,
    selectedStudentCourseIds,
  } = useStudentPerformance({
    selectedStudent,
    setSelectedStudent,
    studentTab,
    dbUrl: DB_URL,
    apiBase: API_BASE,
    schoolCode: activeSchoolCode,
    loadingFinance,
  });

  // LOAD FINANCE/ADMIN FROM LOCALSTORAGE (restored)
  const loadFinanceFromStorage = async () => {
    const storedAuth = getStoredAuth();
    const stored = storedAuth.raw;
    const parsed = storedAuth.data || {};

    if (!stored) {
      setLoadingFinance(false);
      return;
    }

    try {
      const financeData = parsed;
      const financeKey = financeData.financeId || financeData.adminId || financeData.id || financeData.uid || "";
      const possibleUserId = financeData.userId || financeData.user_id || financeData.uid || financeData.user || "";

      if (financeKey) {
        let res = null;
        try {
          res = { data: await readSchoolNodeApi(`Finance/${financeKey}`, null) };
        } catch (err) {
          res = null;
        }

        if (!res || !res.data) {
          try {
            res = { data: await readSchoolNodeApi(`Academics/${financeKey}`, null) };
          } catch (err) {
            res = null;
          }
        }

        if (res && res.data) {
          const node = res.data;
          const userId = node.userId || node.user_id || possibleUserId || "";

          if (userId) {
            try {
              const userRes = { data: await readSchoolNodeApi(`Users/${userId}`, {}) };
              const nextFinance = {
                financeId: financeKey,
                userId,
                schoolCode: financeData.schoolCode || "",
                name: userRes.data?.name || node.name || financeData.name || "Register Office",
                username: userRes.data?.username || financeData.username || "",
                profileImage: userRes.data?.profileImage || node.profileImage || financeData.profileImage || "/default-profile.png",
                isActive: node.isActive || financeData.isActive || false,
              };
              setFinance(nextFinance);
              localStorage.setItem("finance", JSON.stringify({ ...financeData, ...nextFinance }));
              localStorage.setItem("admin", JSON.stringify({ ...financeData, ...nextFinance, adminId: nextFinance.financeId }));
              setLoadingFinance(false);
              return;
            } catch (err) {
              const nextFinance = {
                financeId: financeKey,
                userId,
                schoolCode: financeData.schoolCode || "",
                name: node.name || financeData.name || "Register Office",
                username: node.username || financeData.username || "",
                profileImage: node.profileImage || financeData.profileImage || "/default-profile.png",
                isActive: node.isActive || financeData.isActive || false,
              };
              setFinance(nextFinance);
              localStorage.setItem("finance", JSON.stringify({ ...financeData, ...nextFinance }));
              localStorage.setItem("admin", JSON.stringify({ ...financeData, ...nextFinance, adminId: nextFinance.financeId }));
              setLoadingFinance(false);
              return;
            }
          }
        }
      }

      if (possibleUserId) {
        try {
          const userRes = { data: await readSchoolNodeApi(`Users/${possibleUserId}`, {}) };
          const nextFinance = {
            financeId: financeData.financeId || financeData.adminId || "",
            userId: possibleUserId,
            schoolCode: financeData.schoolCode || "",
            name: userRes.data?.name || financeData.name || "Register Office",
            username: userRes.data?.username || financeData.username || "",
            profileImage: userRes.data?.profileImage || financeData.profileImage || "/default-profile.png",
            isActive: financeData.isActive || false,
          };
          setFinance(nextFinance);
          localStorage.setItem("finance", JSON.stringify({ ...financeData, ...nextFinance }));
          localStorage.setItem("admin", JSON.stringify({ ...financeData, ...nextFinance, adminId: nextFinance.financeId }));
          setLoadingFinance(false);
          return;
        } catch (err) {
          // ignore and fallback to stored values
        }
      }

      const fallbackFinance = {
        financeId: financeData.financeId || financeData.adminId || "",
        userId: financeData.userId || "",
        schoolCode: financeData.schoolCode || "",
        name: financeData.name || financeData.username || "Register Office",
        username: financeData.username || "",
        profileImage: financeData.profileImage || "/default-profile.png",
        isActive: financeData.isActive || false,
      };
      setFinance(fallbackFinance);
      localStorage.setItem("finance", JSON.stringify({ ...financeData, ...fallbackFinance }));
      localStorage.setItem("admin", JSON.stringify({ ...financeData, ...fallbackFinance, adminId: fallbackFinance.financeId }));
    } catch (e) {
      try {
        localStorage.removeItem("registrar");
        localStorage.removeItem("admin");
      } catch (err) {}
    }

    setLoadingFinance(false);
  };
  // UI state helpers (responsive + dropdowns/chat)
  const getIsNarrow = () => (typeof window !== "undefined" ? window.innerWidth <= 800 : false);
  const getIsPortrait = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(orientation: portrait)").matches : false);

  const [isNarrow, setIsNarrow] = useState(getIsNarrow());
  const [isPortrait, setIsPortrait] = useState(getIsPortrait());
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [expandedCards, setExpandedCards] = useState({});
  const [attendanceView, setAttendanceView] = useState("daily");
  const [attendanceCourseFilter, setAttendanceCourseFilter] = useState("All");
  const [showMessageDropdown, setShowMessageDropdown] = useState(false);
  const [activeSemester, setActiveSemester] = useState("semester1");
  const [activeQuarter, setActiveQuarter] = useState("quarter1");
  const semesterQuarters = {
    semester1: ["quarter1", "quarter2"],
    semester2: ["quarter3", "quarter4"],
  };


// Place before return (




  const BIG_NODE_CACHE_TTL_MS = 5 * 60 * 1000;
  const DIRECTORY_CACHE_TTL_MS = 15 * 60 * 1000;
  const CHAT_INDEX_CACHE_TTL_MS = 60 * 1000;









  // load finance/admin on mount
  useEffect(() => {
    loadFinanceFromStorage();
  }, []);


  // If we have a `finance.userId`, fetch the Users record to ensure
  // `name`, `username`, and `profileImage` are up-to-date.
  useEffect(() => {
    if (!finance?.userId) return;

    let cancelled = false;

    const refreshUser = async () => {
      try {
        const res = { data: await readSchoolNodeApi(`Users/${finance.userId}`, {}) };
        if (cancelled) return;
        const user = res.data || {};
        setFinance((prev) => ({
          ...prev,
          name: user.name || prev.name,
          username: user.username || prev.username,
          profileImage: user.profileImage || prev.profileImage,
        }));
      } catch (err) {
        // ignore - keep existing values
      }
    };

    refreshUser();
    return () => {
      cancelled = true;
    };
  }, [finance?.userId]);

  const handleClick = () => {
    navigate("/all-chat"); // replace with your target route
  };

  const handleSelectStudent = async (s) => {
    const requestId = studentSelectionRequestRef.current + 1;
    studentSelectionRequestRef.current = requestId;
    setStudentMarks({});
    setAttendance([]);
    setPaymentHistory({});
    setSelectedStudent((prev) => ({ ...(prev || {}), ...s, attendance: [] }));
    setRightSidebarOpen(true);
    try {
      const [user, rtStudent] = await Promise.all([
        s.userId
          ? readSchoolNodeApi(`Users/${s.userId}`, {})
          : Promise.resolve({}),
        s.studentId
          ? readSchoolNodeApi(`Students/${s.studentId}`, {})
          : Promise.resolve({}),
      ]);

      // compute age from DOB (check user.dob, rtStudent.dob, or s.dob)
      const dobRaw = user?.dob || rtStudent?.dob || s?.dob;
      const computeAge = (dob) => {
        if (!dob) return null;
        try {
          const birth = new Date(dob);
          const now = new Date();
          let age = now.getFullYear() - birth.getFullYear();
          const m = now.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
          return age;
        } catch (e) {
          return null;
        }
      };

      const age = computeAge(dobRaw);

      // 5ï¸âƒ£ Resolve parents: collect first parent name & phone and all parents list
      const parentIds = rtStudent?.parents ? Object.keys(rtStudent.parents) : (s.parents ? Object.keys(s.parents) : []);
      const parentsList = (await mapInBatches(parentIds, 4, async (parentId) => {
        try {
          const parentNode = await readSchoolNodeApi(`Parents/${parentId}`, {});
          const parentUserId = String(parentNode?.userId || "").trim();
          if (!parentUserId) {
            return null;
          }

          const parentUser = await readSchoolNodeApi(`Users/${parentUserId}`, {});

          return {
            parentId,
            userId: parentUserId,
            name: parentUser?.name || parentNode?.name || "Parent",
            phone: parentUser?.phone || parentUser?.phoneNumber || parentNode?.phone || null,
            profileImage: parentUser?.profileImage || parentNode?.profileImage || "/default-profile.png",
          };
        } catch (error) {
          return null;
        }
      })).filter(Boolean);
      const parentName = parentsList[0]?.name || null;
      const parentPhone = parentsList[0]?.phone || null;

      // 6ï¸âƒ£ Set selected student state (include age & parent info)
      if (studentSelectionRequestRef.current !== requestId) {
        return;
      }

      setSelectedStudent((prev) => ({
        ...(prev || {}),
        ...s,
        ...rtStudent,
        ...user,
        attendance: [],
        age: age,
        parents: parentsList,
        parentName: parentName,
        parentPhone: parentPhone,
      }));
    } catch (err) {
      if (studentSelectionRequestRef.current === requestId) {
        console.error("Error fetching student data:", err);
      }
    }
  };

 // New: close the right sidebar (keeps selectedStudent in state so it can be reopened)
  const closeRightSidebar = () => {
    setRightSidebarOpen(false);
  };

  // Optional: function to toggle sidebar (can be used by a "Show sidebar" button)
  const openRightSidebar = () => {
    if (selectedStudent) setRightSidebarOpen(true);
  };

  // ---- Student profile edit helpers ----
  const startEditProfile = () => {
    if (!selectedStudent) return;
    setEditForm({ ...(selectedStudent || {}) });
    setEditingProfile(true);
  };

  const cancelEditProfile = () => {
    setEditingProfile(false);
    setEditForm({});
  };

  const saveProfileEdits = async () => {
    if (!selectedStudent) return;
    setSavingProfile(true);
    try {
      const payload = { ...(editForm || {}) };
      const studentDirectoryPayload = {
        name: payload.name,
        email: payload.email,
        profileImage: payload.profileImage,
        grade: payload.grade,
        section: payload.section,
        academicYear: payload.academicYear,
      };

      // Primary: if we have a RTDB studentId, update the Realtime DB directly
      if (selectedStudent.studentId) {
        // PATCH the Students node
        await patchSchoolNodeApi(`Students/${selectedStudent.studentId}`, payload);

        // Also update Users node when userId exists (keep profile in sync)
        if (selectedStudent.userId) {
          const userPayload = {};
          ["name", "email", "phone", "profileImage", "username"].forEach((k) => {
            if (typeof payload[k] !== "undefined") userPayload[k] = payload[k];
          });
          if (Object.keys(userPayload).length > 0) {
            await patchSchoolNodeApi(`Users/${selectedStudent.userId}`, userPayload);
          }
        }

        await patchSchoolNodeApi(`StudentDirectory/${selectedStudent.studentId}`, studentDirectoryPayload).catch(() => undefined);
        writeStudentDirectoryEntryToCache(selectedStudent.studentId, (previousEntry) => ({
          ...previousEntry,
          ...studentDirectoryPayload,
        }));

        const updated = { ...(selectedStudent || {}), ...(payload || {}) };
        setSelectedStudent(updated);
        setStudents((prev) => {
          const nextStudents = prev.map((p) => (p.studentId === selectedStudent.studentId ? { ...(p || {}), ...(payload || {}) } : p));
          writeStudentsCache({
            studentList: nextStudents,
            gradeOptions,
            currentAcademicYear,
          });
          return nextStudents;
        });
        setEditingProfile(false);
        setEditForm({});
        return;
      }

      // Secondary: if we have only a userId, update Users node
      if (selectedStudent.userId) {
        await patchSchoolNodeApi(`Users/${selectedStudent.userId}`, payload);
        const updated = { ...(selectedStudent || {}), ...(payload || {}) };
        setSelectedStudent(updated);
        setStudents((prev) => {
          const nextStudents = prev.map((p) => (p.userId === selectedStudent.userId ? { ...(p || {}), ...(payload || {}) } : p));
          writeStudentsCache({
            studentList: nextStudents,
            gradeOptions,
            currentAcademicYear,
          });
          return nextStudents;
        });
        setEditingProfile(false);
        setEditForm({});
        return;
      }

      // Fallback: call backend register endpoint (create/update) if RTDB not available
      try {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => fd.append(k, v));
        const res = await fetch(`${BACKEND_BASE}/register/student`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to save via backend");

        // backend returned created/updated info
        const updated = { ...(selectedStudent || {}), ...(data || payload) };
        setSelectedStudent(updated);
        setStudents((prev) => prev.map((p) => ((p.userId && data.userId && p.userId === data.userId) || (p.studentId && data.studentId && p.studentId === data.studentId)) ? { ...(p || {}), ...(data || payload) } : p));
        setEditingProfile(false);
        setEditForm({});
        return;
      } catch (be) {
        throw be;
      }
    } catch (err) {
      console.error("Save profile error:", err);
      alert("Could not save profile: " + (err.message || err));
    } finally {
      setSavingProfile(false);
    }
  };

  // close dropdowns outside click - unchanged logic retained
  useEffect(() => {
    const closeDropdown = (e) => {
      if (!e.target.closest(".icon-circle") && !e.target.closest(".messenger-dropdown")) {
        setShowMessageDropdown(false);
      }
    };
    document.addEventListener("click", closeDropdown);
    return () => document.removeEventListener("click", closeDropdown);
  }, []);




  
  






  // ------------------ UPDATE SECTIONS WHEN GRADE CHANGES ------------------
  useEffect(() => {
    if (selectedGrade === "All") {
      setSections([]);
    } else {
      const gradeSections = [...new Set(students.filter(s => String(s.grade) === String(selectedGrade)).map(s => s.section))];
      setSections(gradeSections);
      setSelectedSection("All");
    }
  }, [selectedGrade, students]);









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

  useEffect(() => {
    const onResize = () => {
      try {
        setIsNarrow(getIsNarrow());
        setIsPortrait(getIsPortrait());
      } catch (e) {
        // ignore
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);


  const attendanceStats = useMemo(() => {
    if (!selectedStudent?.attendance) return null;

    const total = selectedStudent.attendance.length;
    const present = selectedStudent.attendance.filter(a => a.status === "present").length;
    const absent = total - present;
    const percent = total ? Math.round((present / total) * 100) : 0;

    // Consecutive absences
    let streak = 0;
    [...selectedStudent.attendance]
      .sort((a, b) => b.date.localeCompare(a.date))
      .some(a => {
        if (a.status === "absent") {
          streak++;
          return false;
        }
        return true;
      });

    return { total, present, absent, percent, streak };
  }, [selectedStudent]);

  const attendanceData = React.useMemo(() => {
    if (!selectedStudent?.attendance) return [];

    return selectedStudent.attendance.map(a => ({
      date: a.date || a.created_at,
      courseId: a.courseId || a.course || "Unknown Course",
      teacherName: a.teacherName || a.teacher || "Unknown Teacher",
      status: a.status || a.attendance_status || "absent"
    }));
  }, [selectedStudent]);

  const groupedAttendance = React.useMemo(() => {
    if (!attendanceData.length) return {};

    return attendanceData.reduce((acc, record) => {
      const dateKey = new Date(record.date).toLocaleDateString();

      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(record);

      return acc;
    }, {});
  }, [attendanceData]);


  const toggleExpand = (key) => {
    setExpandedCards((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const getProgress = (records) => {
    if (!records || !records.length) return 0;
    const presentCount = records.filter(
      (r) => r.status === "present" || r.status === "late"
    ).length;
    return Math.round((presentCount / records.length) * 100);
  };

  const attendanceBySubject = attendanceData.reduce((acc, cur) => {
    if (!acc[cur.courseId]) acc[cur.courseId] = [];
    acc[cur.courseId].push(cur);
    return acc;
  }, {});

  const formatSubjectName = (courseId = "") => {
    if (!courseId) return "";
    // remove common prefixes/suffixes and underscores, then title-case words
    const clean = String(courseId)
      .replace(/^course_/, "")
      .replace(/_[0-9A-Za-z]+$/, "")
      .replace(/_/g, " ")
      .trim();

    return clean
      .split(/\s+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
      .join(" ");
  };





  const contentLeft = 0;
  const mobileDrawerVisible = rightSidebarOpen || Boolean(selectedStudent);
  const rightSidebarOffset = !isPortrait ? 408 : 2;
  const PRIMARY = "#007afb";
  const BACKGROUND = "#ffffff";
  const ACCENT = "#00B6A9";
  const contentWidth = isNarrow
    ? "100%"
    : !isPortrait
      ? "min(760px, max(320px, calc(100vw - 560px)))"
      : "760px";
  const FEED_MAX_WIDTH = "min(1320px, 100%)";
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

  const registrationSections = useMemo(() => {
    if (!selectedStudent) return null;

    return {
      basic: selectedStudent.basicStudentInformation || {},
      parent: selectedStudent.parentGuardianInformation || {},
      address: selectedStudent.addressInformation || {},
      finance: selectedStudent.financeInformation || {},
      health: selectedStudent.healthEmergency || {},
      academic: selectedStudent.academicSetup || {},
      system: selectedStudent.systemAccountInformation || {},
    };
  }, [selectedStudent]);

  const sectionDefinitions = useMemo(() => ([
    { key: "basic", title: "1) Basic Student Information" },
    { key: "parent", title: "2) Parent / Guardian Information", fullWidth: true },
    { key: "address", title: "3) Address Information" },
    { key: "finance", title: "4) Finance Information" },
    { key: "health", title: "5) Health & Emergency" },
    { key: "academic", title: "6) Academic Setup" },
    { key: "system", title: "7) System Account Information" },
  ]), []);

  const excludedAdditionalKeys = useMemo(() => [
    "basicStudentInformation",
    "parentGuardianInformation",
    "addressInformation",
    "financeInformation",
    "healthEmergency",
    "academicSetup",
    "systemAccountInformation",
    "marks",
    "attendance",
    "parents",
    "studentId",
    "userId",
  ], []);

  const stringifyIfObject = (value) => {
    if (value && typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return "";
      }
    }
    return value ?? "";
  };

  const parseEditableValue = (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch (e) {
        return value;
      }
    }
    return value;
  };

  const normalizeEditableMap = (obj = {}) => {
    const out = {};
    Object.entries(obj || {}).forEach(([key, value]) => {
      out[key] = parseEditableValue(value);
    });
    return out;
  };

  const formatFieldLabel = (fieldKey = "") =>
    String(fieldKey)
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, (char) => char.toUpperCase());

  const isImageValue = (fieldKey, value) => {
    if (!value || typeof value !== "string") return false;
    const val = value.trim();
    const isUrlLike = /^https?:\/\//i.test(val) || /^data:image\//i.test(val);
    const hasImageExt = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(val);
    const keyHintsImage = /(image|photo|avatar|nationalid|nid)/i.test(String(fieldKey || ""));
    return (keyHintsImage && isUrlLike) || hasImageExt || /^data:image\//i.test(val);
  };

  const renderDisplayValue = (fieldKey, value) => {
    if (isImageValue(fieldKey, value)) {
      return (
        <img
          src={String(value)}
          alt={formatFieldLabel(fieldKey)}
          style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border-strong)" }}
        />
      );
    }

    if (Array.isArray(value)) {
      if (!value.length) return <span>-</span>;

      return (
        <div style={{ display: "grid", gap: 8 }}>
          {value.map((item, index) => (
            <div
              key={`${String(fieldKey)}_${index}`}
              style={{ background: "var(--surface-muted)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px" }}
            >
              {item && typeof item === "object" ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                  {Object.entries(item).map(([nestedKey, nestedValue]) => (
                    <div key={`${nestedKey}_${index}`}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2 }}>
                        {formatFieldLabel(nestedKey)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-primary)", wordBreak: "break-word" }}>
                        {renderDisplayValue(nestedKey, nestedValue)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span>{String(item || "-")}</span>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (value && typeof value === "object") {
      return (
        <div style={{ display: "grid", gap: 6 }}>
          {Object.entries(value).map(([nestedKey, nestedValue]) => (
            <div
              key={nestedKey}
              style={{ background: "var(--surface-muted)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px" }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2 }}>
                {formatFieldLabel(nestedKey)}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-primary)", wordBreak: "break-word" }}>
                {renderDisplayValue(nestedKey, nestedValue)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (typeof value === "boolean") {
      return <span>{value ? "Yes" : "No"}</span>;
    }

    return <span>{String(value || "-")}</span>;
  };

  const resetFullscreenEditFormFromSelected = () => {
    if (!selectedStudent) return;
    const sectionsForm = {
      basic: Object.fromEntries(Object.entries(registrationSections?.basic || {}).map(([k, v]) => [k, stringifyIfObject(v)])),
      parent: Object.fromEntries(Object.entries(registrationSections?.parent || {}).map(([k, v]) => [k, stringifyIfObject(v)])),
      address: Object.fromEntries(Object.entries(registrationSections?.address || {}).map(([k, v]) => [k, stringifyIfObject(v)])),
      finance: Object.fromEntries(Object.entries(registrationSections?.finance || {}).map(([k, v]) => [k, stringifyIfObject(v)])),
      health: Object.fromEntries(Object.entries(registrationSections?.health || {}).map(([k, v]) => [k, stringifyIfObject(v)])),
      academic: Object.fromEntries(Object.entries(registrationSections?.academic || {}).map(([k, v]) => [k, stringifyIfObject(v)])),
      system: Object.fromEntries(Object.entries(registrationSections?.system || {}).map(([k, v]) => [k, stringifyIfObject(v)])),
    };

    const additionalSource = Object.fromEntries(
      Object.entries(selectedStudent || {}).filter(([key]) => !excludedAdditionalKeys.includes(key))
    );

    const additionalForm = Object.fromEntries(
      Object.entries(additionalSource).map(([k, v]) => [k, stringifyIfObject(v)])
    );

    setFullscreenEditForm({ sections: sectionsForm, additional: additionalForm });
    setFullscreenSectionCollapsed({
      basic: false,
      parent: false,
      address: false,
      finance: false,
      health: false,
      academic: false,
      system: false,
      additional: false,
    });
  };

  useEffect(() => {
    if (!studentFullscreenOpen || !selectedStudent) return;
    resetFullscreenEditFormFromSelected();
    setFullscreenEditing(false);
  }, [studentFullscreenOpen, selectedStudent, registrationSections, excludedAdditionalKeys]);

  const toggleFullscreenSection = (sectionKey) => {
    setFullscreenSectionCollapsed((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const updateFullscreenSectionField = (sectionKey, fieldKey, value) => {
    setFullscreenEditForm((prev) => ({
      ...prev,
      sections: {
        ...(prev.sections || {}),
        [sectionKey]: {
          ...((prev.sections || {})[sectionKey] || {}),
          [fieldKey]: value,
        },
      },
    }));
  };

  const updateFullscreenAdditionalField = (fieldKey, value) => {
    setFullscreenEditForm((prev) => ({
      ...prev,
      additional: {
        ...(prev.additional || {}),
        [fieldKey]: value,
      },
    }));
  };

  const saveFullscreenEdits = async () => {
    if (!selectedStudent?.studentId) return;

    setFullscreenSaving(true);
    try {
      const normalizedSections = {
        basic: normalizeEditableMap(fullscreenEditForm.sections?.basic || {}),
        parent: normalizeEditableMap(fullscreenEditForm.sections?.parent || {}),
        address: normalizeEditableMap(fullscreenEditForm.sections?.address || {}),
        finance: normalizeEditableMap(fullscreenEditForm.sections?.finance || {}),
        health: normalizeEditableMap(fullscreenEditForm.sections?.health || {}),
        academic: normalizeEditableMap(fullscreenEditForm.sections?.academic || {}),
        system: normalizeEditableMap(fullscreenEditForm.sections?.system || {}),
      };

      const normalizedAdditional = normalizeEditableMap(fullscreenEditForm.additional || {});

      const studentPayload = {
        basicStudentInformation: normalizedSections.basic,
        parentGuardianInformation: normalizedSections.parent,
        addressInformation: normalizedSections.address,
        financeInformation: normalizedSections.finance,
        healthEmergency: normalizedSections.health,
        academicSetup: normalizedSections.academic,
        systemAccountInformation: normalizedSections.system,
        ...normalizedAdditional,
      };

      await patchSchoolNodeApi(`Students/${selectedStudent.studentId}`, studentPayload);

      if (selectedStudent.userId) {
        const userPayload = {};
        const userFieldCandidates = [
          "name",
          "email",
          "phone",
          "profileImage",
          "username",
          "dob",
          "gender",
          "nationality",
          "nationalIdNumber",
          "nationalIdImageUrl",
        ];

        userFieldCandidates.forEach((field) => {
          if (typeof normalizedAdditional[field] !== "undefined") {
            userPayload[field] = normalizedAdditional[field];
          }
        });

        if (!userPayload.name && normalizedSections.basic?.studentFullName) {
          userPayload.name = normalizedSections.basic.studentFullName;
        }
        if (!userPayload.username && normalizedSections.system?.studentUsername) {
          userPayload.username = normalizedSections.system.studentUsername;
        }

        if (Object.keys(userPayload).length > 0) {
          await patchSchoolNodeApi(`Users/${selectedStudent.userId}`, userPayload);
        }
      }

      const updatedSelected = {
        ...(selectedStudent || {}),
        ...studentPayload,
        name: normalizedAdditional.name || normalizedSections.basic?.studentFullName || selectedStudent.name,
        profileImage: normalizedAdditional.profileImage || selectedStudent.profileImage,
        email: normalizedAdditional.email || selectedStudent.email,
        phone: normalizedAdditional.phone || selectedStudent.phone,
        username: normalizedAdditional.username || normalizedSections.system?.studentUsername || selectedStudent.username,
      };

      setSelectedStudent(updatedSelected);
      setStudents((prev) =>
        prev.map((item) =>
          item.studentId === selectedStudent.studentId
            ? {
                ...item,
                name: updatedSelected.name || item.name,
                profileImage: updatedSelected.profileImage || item.profileImage,
                email: updatedSelected.email || item.email,
                grade: updatedSelected.grade || item.grade,
                section: updatedSelected.section || item.section,
              }
            : item
        )
      );

      setFullscreenEditing(false);
      alert("Student information updated successfully.");
    } catch (err) {
      console.error("Fullscreen save error:", err);
      alert("Could not save student information: " + (err.message || err));
    } finally {
      setFullscreenSaving(false);
    }
  };

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
  const softPanelStyle = {
    background: "var(--surface-muted)",
    border: "1px solid var(--border-soft)",
    borderRadius: 10,
  };
  const listCardStyle = (isSelected) => ({
    width: contentWidth,
    maxWidth: "100%",
    minHeight: "86px",
    borderRadius: "14px",
    padding: "12px",
    background: isSelected ? "var(--surface-accent)" : "var(--surface-panel)",
    border: isSelected ? "2px solid var(--accent-strong)" : "1px solid var(--border-soft)",
    boxShadow: isSelected ? "var(--shadow-glow)" : "var(--shadow-soft)",
    cursor: "pointer",
    transition: "all 0.25s ease",
    position: "relative",
  });
  const rightDrawerCardStyle = {
    background: "var(--surface-panel)",
    borderRadius: 12,
    border: "1px solid var(--border-soft)",
    boxShadow: "var(--shadow-soft)",
  };
  const sidebarSectionCardStyle = {
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
    borderRadius: 16,
    border: "1px solid var(--border-soft)",
    boxShadow: "var(--shadow-soft)",
  };
  const studentTabButtonStyle = (tab) => ({
    flex: 1,
    padding: "8px",
    background: studentTab === tab ? "var(--surface-accent)" : "transparent",
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    color: studentTab === tab ? "var(--accent-strong)" : "var(--text-muted)",
    fontSize: "11px",
    borderBottom: studentTab === tab ? "2px solid var(--accent-strong)" : "2px solid transparent",
    transition: "all 0.2s ease",
  });
  const studentDetailRows = [
    { label: "Email", key: "email" },
    { label: "Phone", key: "phone" },
    { label: "Gender", key: "gender" },
    { label: "Age", key: "age" },
    { label: "Birth Date", key: "dob" },
    { label: "Parent Name", key: "parentName" },
    { label: "Parent Phone", key: "parentPhone" },
  ];

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
          className={`main-content ${rightSidebarOpen ? "sidebar-open" : ""}`}
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
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.01em" }}>Students</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)", maxWidth: 620, lineHeight: 1.5 }}>
                    Manage student records, attendance, performance, payments, and communication from the same premium admin workspace used across the rest of the platform.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14, position: "relative", zIndex: 1 }}>
                <div style={{ padding: "7px 12px", borderRadius: 999, background: "color-mix(in srgb, var(--surface-panel) 72%, white)", border: "1px solid var(--border-soft)", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                  Total: {filteredStudentsBase.length}
                </div>
                <div style={{ padding: "7px 12px", borderRadius: 999, background: "color-mix(in srgb, var(--surface-panel) 72%, white)", border: "1px solid var(--border-soft)", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                  Current Year: {currentYearStudents.length}
                </div>
                <div style={{ padding: "7px 12px", borderRadius: 999, background: "color-mix(in srgb, var(--surface-panel) 72%, white)", border: "1px solid var(--border-soft)", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                  {currentAcademicYear
                    ? `Academic Year: ${String(currentAcademicYear).replace("_", "/")}`
                    : "Academic Year: Not Set"}
                </div>
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
                  placeholder="Search students..."
                  style={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    fontSize: 13,
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
                {["All", ...gradeOptions].map(g => (
                  <button
                    key={g}
                    onClick={() => setSelectedGrade(g)}
                    style={chipStyle(selectedGrade === g)}
                  >
                    {g === "All" ? "All Grades" : `Grade ${g}`}
                  </button>
                ))}
              </div>
            </div>


            {/* Section Filter */}
            {selectedGrade !== "All" && sections.length > 0 && (
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
                  {["All", ...sections].map(section => (
                    <button
                      key={section}
                      onClick={() => setSelectedSection(section)}
                      style={chipStyle(selectedSection === section)}
                    >
                      {section === "All" ? "All Sections" : `Section ${section}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Students List */}
            {studentsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: isNarrow ? "center" : "flex-start", gap: "12px", paddingLeft: contentLeft }}>
                {Array.from({ length: 6 }).map((_, idx) => (
                    <div key={idx} style={{ width: contentWidth, maxWidth: "100%", height: "86px", borderRadius: "14px", padding: "12px", background: "var(--surface-panel)", border: "1px solid var(--border-soft)", boxShadow: "var(--shadow-soft)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-muted)" }} />
                      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--surface-muted)" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ width: "60%", height: 12, background: "var(--surface-muted)", borderRadius: 6, marginBottom: 8 }} />
                        <div style={{ width: "40%", height: 10, background: "var(--surface-muted)", borderRadius: 6 }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: isNarrow ? "center" : "flex-start", gap: "12px", paddingLeft: contentLeft }}>
                {currentYearStudents.length === 0 ? (
                  <p style={{ width: contentWidth, maxWidth: "100%", textAlign: "center", color: "var(--text-muted)", margin: 0 }}>No current year students for this selection.</p>
                ) : (
                  <>
                    <FixedSizeList
                      height={Math.min(600, currentYearStudents.length * 104)}
                      itemCount={currentYearStudents.length}
                      itemSize={104}
                      width={contentWidth}
                      style={{ maxWidth: "100%" }}
                    >
                      {({ index, style }) => {
                        const s = currentYearStudents[index];
                        return (
                          <div style={{ ...style, padding: "6px 0" }}>
                            <div
                              key={`current-${s.studentId || s.userId || index}`}
                              onClick={() => handleSelectStudent(s)}
                              className="student-card"
                              style={listCardStyle(selectedStudent?.studentId === s.studentId)}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingRight: 110 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-accent)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flex: "0 0 auto" }}>
                                  {index + 1}
                                </div>
                                <ProfileAvatar src={s.profileImage} name={s.name} alt={s.name} loading="lazy" style={{ width: "48px", height: "48px", borderRadius: "50%", border: selectedStudent?.studentId === s.studentId ? "3px solid var(--accent)" : "3px solid var(--border-soft)", objectFit: "cover", transition: "all 0.3s ease" }} />
                                <div style={{ minWidth: 0 }}>
                                  <h3 style={{ margin: 0, fontSize: "14px", color: "var(--text-primary)", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</h3>
                                  <div style={{ color: "var(--text-muted)", fontSize: "11px", marginTop: 4 }}>
                                    Grade {s.grade} â€¢ Section {s.section}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    </FixedSizeList>
                    
                    {/* Load More Button */}
                    {hasMoreStudents && !loadingMore && (
                      <button
                        onClick={loadMoreStudents}
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
                        Load More Students
                      </button>
                    )}
                    
                    {/* Loading More Indicator */}
                    {loadingMore && (
                      <div style={{ width: contentWidth, maxWidth: "100%", textAlign: "center", padding: "12px", color: "var(--text-muted)", fontSize: "13px" }}>
                        Loading more students...
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        {/* RIGHT SIDEBAR */}
  <div
    style={{
      width: isPortrait ? "100%" : "380px",
      position: "fixed",
      left: isPortrait ? 0 : "auto",
      right: isPortrait ? 0 : 14,
      top: isPortrait ? 0 : "calc(var(--topbar-height) + 18px)",
      height: isPortrait ? "100vh" : "calc(100vh - var(--topbar-height) - 36px)",
      maxHeight: isPortrait ? "100vh" : "calc(100vh - var(--topbar-height) - 36px)",
      background: "var(--surface-panel)",
      zIndex: 1000,
      display: !isPortrait || mobileDrawerVisible ? "flex" : "none",
      flexDirection: "column",
      overflowY: "auto",
      padding: "14px",
      boxShadow: "var(--shadow-panel)",
      border: isPortrait ? "none" : "1px solid var(--border-soft)",
      borderRadius: isPortrait ? 0 : 18,
      transition: "all 0.35s ease",
      fontSize: "12px",
      opacity: !isPortrait || mobileDrawerVisible ? 1 : 0,
      pointerEvents: !isPortrait || mobileDrawerVisible ? "auto" : "none",
    }}
  >
    {/* Close button */}
    {selectedStudent && (
      <div style={{ position: "absolute", top: 12, left: 14, zIndex: 2000 }}>
        <button
          onClick={() => {
            studentSelectionRequestRef.current += 1;
            setRightSidebarOpen(false);
            setStudentFullscreenOpen(false);
            setSelectedStudent(null);
          }}
          aria-label="Close sidebar"
          style={{
            width: 34,
            height: 34,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--surface-panel) 22%, transparent)",
            border: "1px solid color-mix(in srgb, var(--surface-panel) 45%, transparent)",
            borderRadius: 999,
            backdropFilter: "blur(6px)",
            fontSize: 24,
            fontWeight: 700,
            color: "var(--on-accent)",
            cursor: "pointer",
            padding: 0,
            lineHeight: 1,
            boxShadow: "var(--shadow-soft)",
          }}
        >
          <FaTimes />
        </button>
      </div>
    )}

    {/* Expand button */}
    {selectedStudent && (
      <div style={{ position: "absolute", top: 8, right: 14, zIndex: 2000 }}>
        <button
          onClick={() => setStudentFullscreenOpen(true)}
          aria-label="Expand student profile"
          title="Expand"
          style={{
            border: "1px solid var(--border-strong)",
            background: "var(--surface-panel)",
            color: "var(--accent-strong)",
            borderRadius: 10,
            padding: "6px 10px",
            fontSize: 14,
            cursor: "pointer",
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          <FaExpand />
        </button>
      </div>
    )}

    {/* Header */}
    <div
      style={{
        background: "linear-gradient(135deg, var(--accent-strong), var(--accent))",
        margin: "-14px -14px 12px",
        padding: "18px 12px 16px",
        textAlign: "center",
      }}
    >
      {selectedStudent ? (
        <>
          <div
            style={{
              width: "70px",
              height: "70px",
              margin: "0 auto 10px",
              borderRadius: "50%",
              overflow: "hidden",
              border: "3px solid rgba(255,255,255,0.8)",
            }}
          >
            <ProfileAvatar src={selectedStudent.profileImage} name={selectedStudent.name} alt={selectedStudent.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>

          <h2 style={{ margin: 0, color: "#ffffff", fontSize: 16, fontWeight: 800 }}>{selectedStudent.name}</h2>
          <p style={{ margin: "6px 0 2px", color: "#dbeafe", fontSize: "11px", fontWeight: 700 }}>{selectedStudent.studentId}</p>
          <p style={{ margin: 0, color: "#dbeafe", fontSize: "11px" }}>
            Grade {selectedStudent.grade} - Section {selectedStudent.section}
          </p>
        </>
      ) : (
        <>
          <div
            style={{
              width: "70px",
              height: "70px",
              margin: "0 auto 10px",
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              background: "rgba(255,255,255,0.1)"
            }}
          >
            <FaChalkboardTeacher size={30} />
          </div>

          <h2 style={{ margin: 0, color: "#ffffff", fontSize: 16, fontWeight: 800 }}>
            Students Workspace
          </h2>

          <p style={{ margin: "6px 0 0", color: "#dbeafe", fontSize: "11px", fontWeight: 600 }}>
            Student Overview
          </p>
        </>
      )}
    </div>

    {/* Tabs */}
    {selectedStudent ? (
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-soft)",
          marginBottom: "10px",
        }}
      >
        {["details", "attendance", "performance", "payment"].map((tab) => (
          <button
            key={tab}
            onClick={() => setStudentTab(tab)}
            style={studentTabButtonStyle(tab)}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>
    ) : null}

    {!selectedStudent ? (
      <div
        style={{
          padding: "10px",
          display: "grid",
          gap: 8,
          gridTemplateColumns: "1fr 1fr",
          marginBottom: "10px"
        }}
      >
        {[
          { label: "Total", value: students.length },
          { label: "Visible", value: filteredStudentsBase.length },
          { label: "Grade", value: selectedGrade === "All" ? "All" : `G${selectedGrade}` },
          { label: "Search", value: searchTerm ? "Active" : "None" }
        ].map((item) => (
          <div
            key={item.label}
            style={{
              ...rightDrawerCardStyle,
              padding: "10px",
              minHeight: 56,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center"
            }}
          >
            <div
              style={{
                fontSize: "9px",
                fontWeight: 800,
                color: "var(--text-muted)",
                letterSpacing: "0.3px",
                textTransform: "uppercase"
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 800,
                color: "var(--text-primary)",
                marginTop: 2
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    ) : null}

    {/* Tab Content */}
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* DETAILS TAB */}
      {studentTab === "details" && selectedStudent && (
        <StudentDetailsTab
          selectedStudent={selectedStudent}
          togglingActive={togglingActive}
          openConfirmModal={openConfirmModal}
          showConfirmModal={showConfirmModal}
          closeConfirmModal={closeConfirmModal}
          confirmToggle={confirmToggle}
          confirmAdminUsername={confirmAdminUsername}
          setConfirmAdminUsername={setConfirmAdminUsername}
          confirmAdminPassword={confirmAdminPassword}
          setConfirmAdminPassword={setConfirmAdminPassword}
          editingProfile={editingProfile}
          savingProfile={savingProfile}
          startEditProfile={startEditProfile}
          cancelEditProfile={cancelEditProfile}
          saveProfileEdits={saveProfileEdits}
          editForm={editForm}
          setEditForm={setEditForm}
          studentDetailRows={studentDetailRows}
          currentAcademicYear={currentAcademicYear}
        />
      )}

      {/* ATTENDANCE TAB */}
      {studentTab === "attendance" && selectedStudent && (
        <StudentAttendanceTab
          attendanceStats={attendanceStats}
          attendanceView={attendanceView}
          setAttendanceView={setAttendanceView}
          attendanceCourseFilter={attendanceCourseFilter}
          attendanceBySubject={attendanceBySubject}
          expandedCards={expandedCards}
          toggleExpand={toggleExpand}
          getProgress={getProgress}
          formatSubjectName={formatSubjectName}
        />
      )}

      {/* PERFORMANCE TAB */}
      {studentTab === "performance" && selectedStudent && (
        <StudentPerformanceTab
          studentMarksFlattened={studentMarksFlattened}
          activeSemester={activeSemester}
          setActiveSemester={setActiveSemester}
        />
      )}

      {/* PAYMENT TAB: Read-only monthly payment history */}
      {studentTab === "payment" && (
        <StudentPaymentTab
          selectedStudent={selectedStudent}
          paymentHistory={paymentHistory}
        />
      )}
    </div>
    {/* Parent Chat Button */}
    {selectedStudent && !studentChatOpen && (
      <div
        onClick={() => {
          if (!selectedStudent?.userId) {
            alert("Please select a student first.");
            return;
          }

          const firstParent = (selectedStudent?.parents || [])[0];
          if (!firstParent?.userId) {
            alert("No parent found for this student.");
            return;
          }

          navigate("/all-chat", {
            state: {
              user: {
                userId: firstParent.userId,
                name: firstParent.name || selectedStudent.parentName || "Parent",
                profileImage: firstParent.profileImage || "/default-profile.png",
                type: "parent",
              },
            },
          });
        }}
        title="Chat with student's parent"
        style={{
          position: "fixed",
          bottom: "20px",
          right: "220px",
          width: "140px",
          height: "48px",
          background: "linear-gradient(135deg, color-mix(in srgb, var(--success) 78%, #0f172a), var(--success))",
          borderRadius: "28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 10,
          padding: "0 12px",
          color: "#fff",
          cursor: "pointer",
          zIndex: 1100,
          boxShadow: "var(--shadow-glow)",
          transition: "transform 0.16s ease",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "rgba(255,255,255,0.14)",
          }}
        >
          <FaFacebookMessenger size={18} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>Parent Chat</span>
        </div>
        <span
          style={{
            position: "absolute",
            top: -8,
            right: 8,
            background: "color-mix(in srgb, var(--success) 42%, #04130b)",
            color: "#fff",
            borderRadius: "999px",
            fontSize: 10,
            fontWeight: 800,
            padding: "2px 6px",
            border: "2px solid #fff",
            lineHeight: 1,
          }}
        >
          P
        </span>
      </div>
    )}

    {/* Student Chat Button (styled like Parent Chat) */}
    {selectedStudent && !studentChatOpen && (
      <div
        onClick={() => {
          if (!selectedStudent?.userId) {
            alert("Please select a student first.");
            return;
          }
          navigate("/all-chat", {
            state: {
              user: {
                userId: selectedStudent.userId,
                name: selectedStudent.name,
                profileImage: selectedStudent.profileImage,
                type: "student",
              },
            },
          });
        }}
        title="Chat with student"
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          width: "140px",
          height: "48px",
          background: "linear-gradient(135deg, color-mix(in srgb, var(--accent-strong) 45%, #7c3aed), var(--accent))",
          borderRadius: "28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 10,
          padding: "0 12px",
          color: "#fff",
          cursor: "pointer",
          zIndex: 1000,
          boxShadow: "var(--shadow-glow)",
          transition: "transform 0.16s ease",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "rgba(255,255,255,0.14)",
          }}
        >
          <FaCommentDots size={18} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>Student Chat</span>
        </div>
        <span
          style={{
            position: "absolute",
            top: -8,
            right: 8,
            background: "color-mix(in srgb, var(--accent-strong) 28%, #020617)",
            color: "#fff",
            borderRadius: "999px",
            fontSize: 10,
            fontWeight: 800,
            padding: "2px 6px",
            border: "2px solid #fff",
            lineHeight: 1,
          }}
        >
          S
        </span>
      </div>
    )}
    {/* Chat Popup */}
    {studentChatOpen && selectedStudent && (
      <div
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          width: "360px",
          height: "480px",
          background: "var(--surface-panel)",
          borderRadius: "16px",
          boxShadow: "var(--shadow-panel)",
          zIndex: 2000,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: "14px",
            borderBottom: "1px solid var(--border-soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--surface-muted)",
          }}
        >
            <strong>{selectedStudent.name}</strong>
          <div style={{ display: "flex", gap: "10px" }}>
            {/* Expand */}
            <button
              onClick={() => {
                setStudentChatOpen(false); // properly close popup
                navigate("/all-chat", {
                  state: {
                    user: {
                      userId: selectedStudent.userId,
                      name: selectedStudent.name,
                      profileImage: selectedStudent.profileImage,
                      type: "student",
                    },
                  },
                });
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "18px",
              }}
            >
              <FaExpand />
            </button>
            {/* Close */}
            <button
              onClick={() => setStudentChatOpen(false)}
              style={{
                background: "none",
                border: "none",
                fontSize: "20px",
                cursor: "pointer",
              }}
            >
              <FaTimes />
            </button>
          </div>
        </div>
        {/* Messages */}
        <div
          style={{
            flex: 1,
            padding: "12px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            background: "var(--surface-muted)",
          }}
        >
          {popupMessages.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-muted)" }}>
              Start chatting with {selectedStudent.name}
            </p>
          ) : (
            popupMessages.map((m) => {
              const isAdmin = String(m.senderId) === String(adminUserId);
              return (
                <div
                  key={m.messageId || m.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isAdmin ? "flex-end" : "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      background: isAdmin ? "var(--accent)" : "var(--surface-panel)",
                      color: isAdmin ? "#fff" : "var(--text-primary)",
                      padding: "10px 14px",
                      borderRadius: 18,
                      borderTopRightRadius: isAdmin ? 0 : 18,
                      borderTopLeftRadius: isAdmin ? 18 : 0,
                      boxShadow: "var(--shadow-soft)",
                      wordBreak: "break-word",
                      cursor: "default",
                      position: "relative",
                    }}
                  >
                    {m.text} {" "}
                    {m.edited && (
                      <small style={{ fontSize: 10 }}> (edited)</small>
                    )}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 6,
                        marginTop: 6,
                        fontSize: 11,
                        color: isAdmin ? "#fff" : "var(--text-muted)",
                      }}
                    >
                      <span style={{ marginRight: 6, fontSize: 11, opacity: 0.9 }}>
                        {formatDateLabel(m.timeStamp)}
                      </span>
                      <span>{formatTime(m.timeStamp)}</span>
                      {isAdmin && !m.deleted && (
                      <span style={{ display: "flex", gap: 0, alignItems: "center" }}>
                                                          <FaCheck size={10} color={isAdmin ? "#fff" : "var(--text-muted)"} style={{ opacity: 0.90, marginLeft: 2 }} />
                                                          {m.seen && (<FaCheck size={10} color={isAdmin ? "#f8fafc" : "var(--text-muted)"} style={{ marginLeft: -6, opacity: 0.95 }} />)}
                                                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
        {/* Input */}
        <div
          style={{
            padding: "10px",
            borderTop: "1px solid var(--border-soft)",
            display: "flex",
            gap: "8px",
            background: "var(--surface-panel)",
          }}
        >
          <input
            value={newMessageText}
            onChange={(e) => setNewMessageText(e.target.value)}
            placeholder="Type a message..."
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "25px",
              border: "1px solid var(--input-border)",
              outline: "none",
              background: "var(--input-bg)",
              color: "var(--text-primary)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
          />
          <button
            onClick={() => sendMessage()}
            style={{
              width: 45,
              height: 45,
              borderRadius: "50%",
              background: "var(--accent)",
              border: "none",
              color: "#fff",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <FaPaperPlane />
          </button>
        </div>
      </div>
    )}
  </div>

{selectedStudent && studentFullscreenOpen && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 3000,
      background: "linear-gradient(180deg, var(--page-bg-secondary) 0%, var(--page-bg) 100%)",
      overflowY: "auto",
      padding: "16px 20px 24px",
    }}
  >
    <div
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        background: "var(--surface-panel)",
        border: "1px solid var(--border-soft)",
        borderRadius: 16,
        boxShadow: "var(--shadow-panel)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          color: "#fff",
          background: "linear-gradient(135deg, var(--accent-strong), var(--accent))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ProfileAvatar src={selectedStudent.profileImage} name={selectedStudent.name} alt={selectedStudent.name} style={{ width: 56, height: 56, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.8)", objectFit: "cover" }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedStudent.name || "Student"}</div>
            <div style={{ fontSize: 12, opacity: 0.95 }}>{selectedStudent.studentId} â€¢ Grade {selectedStudent.grade || "-"} â€¢ Section {selectedStudent.section || "-"}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!fullscreenEditing ? (
            <button
              onClick={() => setFullscreenEditing(true)}
              style={{
                border: "1px solid rgba(255,255,255,0.45)",
                background: "rgba(255,255,255,0.14)",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Edit All Sections
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  resetFullscreenEditFormFromSelected();
                  setFullscreenEditing(false);
                }}
                style={{
                  border: "1px solid rgba(255,255,255,0.45)",
                  background: "rgba(255,255,255,0.14)",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
                disabled={fullscreenSaving}
              >
                Cancel
              </button>
              <button
                onClick={saveFullscreenEdits}
                style={{
                  border: "1px solid rgba(255,255,255,0.45)",
                  background: "#16a34a",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontWeight: 700,
                  opacity: fullscreenSaving ? 0.75 : 1,
                }}
                disabled={fullscreenSaving}
              >
                {fullscreenSaving ? "Saving..." : "Save Changes"}
              </button>
            </>
          )}

          <button
            onClick={() => setStudentFullscreenOpen(false)}
            style={{
              border: "1px solid rgba(255,255,255,0.45)",
              background: "rgba(255,255,255,0.14)",
              color: "#fff",
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Exit Full Screen
          </button>
        </div>
      </div>

      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        {sectionDefinitions.map((section) => {
          const sectionData = fullscreenEditing
            ? (fullscreenEditForm.sections?.[section.key] || {})
            : (registrationSections?.[section.key] || {});
          const isCollapsed = !!fullscreenSectionCollapsed?.[section.key];
          const sectionEntries = Object.entries(sectionData || {});
          const imageEntries = !fullscreenEditing
            ? sectionEntries.filter(([key, value]) => isImageValue(key, value))
            : [];
          const nonImageEntries = !fullscreenEditing
            ? sectionEntries.filter(([key, value]) => !isImageValue(key, value))
            : sectionEntries;

          return (
          <div
            key={section.title}
            style={{
              background: "var(--surface-panel)",
              border: "1px solid var(--border-soft)",
              borderRadius: 12,
              padding: 10,
              boxShadow: "var(--shadow-soft)",
              gridColumn: section.fullWidth ? "1 / -1" : "auto",
            }}
          >
            <button
              type="button"
              onClick={() => toggleFullscreenSection(section.key)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--surface-muted)",
                border: "1px solid var(--border-strong)",
                borderRadius: 10,
                padding: "8px 10px",
                cursor: "pointer",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)" }}>{section.title}</span>
              <FaChevronDown style={{ color: "var(--accent-strong)", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform .2s ease" }} />
            </button>

            {!isCollapsed && (Object.keys(sectionData || {}).length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No data</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {!fullscreenEditing && imageEntries.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                    {imageEntries.map(([key, value]) => (
                      <div key={`image_${key}`} style={{ background: "var(--surface-muted)", border: "1px solid var(--border-soft)", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>{formatFieldLabel(key)}</div>
                        {renderDisplayValue(key, value)}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                  {nonImageEntries.map(([key, value]) => (
                    <div key={key} style={{ background: "var(--surface-muted)", border: "1px solid var(--border-soft)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>{formatFieldLabel(key)}</div>
                      <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: 2, wordBreak: "break-word" }}>
                        {!fullscreenEditing ? (
                          renderDisplayValue(key, value)
                        ) : (
                          <div style={{ display: "grid", gap: 6 }}>
                            <input
                              value={value ?? ""}
                              onChange={(event) => updateFullscreenSectionField(section.key, key, event.target.value)}
                              style={{ width: "100%", border: "1px solid var(--input-border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, background: "var(--input-bg)", color: "var(--text-primary)" }}
                            />
                            {isImageValue(key, value) ? (
                              <img
                                src={String(value || "")}
                                alt={formatFieldLabel(key)}
                                style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border-strong)" }}
                              />
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )})}

        <div
          style={{
            background: "var(--surface-panel)",
            border: "1px solid var(--border-soft)",
            borderRadius: 12,
            padding: 12,
            boxShadow: "var(--shadow-soft)",
            gridColumn: "1 / -1",
          }}
        >
          <button
            type="button"
            onClick={() => toggleFullscreenSection("additional")}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--surface-muted)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              padding: "8px 10px",
              cursor: "pointer",
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)" }}>Additional Student Data</span>
            <FaChevronDown style={{ color: "var(--accent-strong)", transform: fullscreenSectionCollapsed?.additional ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform .2s ease" }} />
          </button>

          {!fullscreenSectionCollapsed?.additional && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
              {Object.entries(fullscreenEditing ? (fullscreenEditForm.additional || {}) : Object.fromEntries(
                Object.entries(selectedStudent || {}).filter(([k]) => !excludedAdditionalKeys.includes(k))
              )).map(([key, value]) => (
                <div key={key} style={{ background: "var(--surface-muted)", border: "1px solid var(--border-soft)", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>{formatFieldLabel(key)}</div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: 2, wordBreak: "break-word" }}>
                    {!fullscreenEditing ? (
                      renderDisplayValue(key, value)
                    ) : (
                      <div style={{ display: "grid", gap: 6 }}>
                        <input
                          value={value ?? ""}
                          onChange={(event) => updateFullscreenAdditionalField(key, event.target.value)}
                          style={{ width: "100%", border: "1px solid var(--input-border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, background: "var(--input-bg)", color: "var(--text-primary)" }}
                        />
                        {isImageValue(key, value) ? (
                          <img
                            src={String(value || "")}
                            alt={formatFieldLabel(key)}
                            style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border-strong)" }}
                          />
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
)}
    </div>

  </div>
)}
export default StudentsPage;
