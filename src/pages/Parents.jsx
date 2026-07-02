import React, { useEffect, useState, useRef, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  FaHome,
  FaFileAlt,
  FaChalkboardTeacher,
  FaCog,
  FaSignOutAlt,
  FaBell,
  FaFacebookMessenger,
  FaSearch,
  FaCalendarAlt,
  FaCommentDots,
  FaPaperPlane,
  FaCheck,
  FaChartLine,
  FaChevronDown,
  FaTimes,
  FaExpand,
} from "react-icons/fa";
import axios from "axios";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FixedSizeList } from 'react-window';
import { BACKEND_BASE } from "../config.js";
import useTopbarNotifications from "../hooks/notifications/useTopbarNotifications";
import ProfileAvatar from "../components/ProfileAvatar";
import {
  buildChatSummaryPath,
  buildChatSummaryUpdate,
  normalizeChatSummaryValue,
} from "../utils/chatRtdb";
import { schoolNodeBase } from "../utils/schoolDbRouting";
import useParentsList from "../hooks/parents/useParentsList";
import useParentChat from "../hooks/chat/useParentChat";
import useParentDetail from "../hooks/parents/useParentDetail";
import {
  ParentDetailsSection,
  ParentChildrenSection,
  ParentStatusSection,
} from "../components/dashboard/parents/ParentDetailSections";

const BIG_NODE_CACHE_TTL_MS = 5 * 60 * 1000;

const normalizeText = (value) => String(value || "").trim();

const uniqueTextValues = (values = []) => {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).reduce((result, value) => {
    const text = normalizeText(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      return result;
    }
    seen.add(key);
    result.push(text);
    return result;
  }, []);
};

const normalizeParentDirectoryChild = (child = {}) => ({
  studentId: normalizeText(child?.studentId),
  userId: normalizeText(child?.userId),
  name: normalizeText(child?.name) || "N/A",
  email: normalizeText(child?.email) || "N/A",
  grade: normalizeText(child?.grade) || "N/A",
  section: normalizeText(child?.section) || "N/A",
  relationship: normalizeText(child?.relationship) || "N/A",
  profileImage: normalizeText(child?.profileImage) || "/default-profile.png",
});

const normalizeParentDirectoryEntry = (parentKey, parentValue = {}) => {
  const children = Array.isArray(parentValue?.children)
    ? parentValue.children.map((child) => normalizeParentDirectoryChild(child)).filter((child) => child.studentId)
    : Object.values(parentValue?.children || {})
        .map((child) => normalizeParentDirectoryChild(child))
        .filter((child) => child.studentId);
  const relationships = uniqueTextValues([
    ...(Array.isArray(parentValue?.relationships) ? parentValue.relationships : []),
    ...children.map((child) => child.relationship),
  ]);
  const firstChild = children[0] || {};
  const isActive = parentValue?.isActive !== false;

  return {
    directoryKey: normalizeText(parentKey),
    userId: normalizeText(parentValue?.userId) || normalizeText(parentKey),
    parentId: normalizeText(parentValue?.parentId) || "N/A",
    name: normalizeText(parentValue?.name) || normalizeText(parentValue?.username) || "No Name",
    username: normalizeText(parentValue?.username) || null,
    email: normalizeText(parentValue?.email) || "N/A",
    childName: normalizeText(parentValue?.childName) || firstChild.name || "N/A",
    childRelationship: normalizeText(parentValue?.childRelationship) || firstChild.relationship || "N/A",
    profileImage: normalizeText(parentValue?.profileImage) || "/default-profile.png",
    phone: normalizeText(parentValue?.phone) || "N/A",
    age: parentValue?.age ?? null,
    city: normalizeText(parentValue?.city) || (parentValue?.address && parentValue.address.city) || null,
    citizenship: normalizeText(parentValue?.citizenship) || null,
    job: normalizeText(parentValue?.job) || null,
    address: parentValue?.address || null,
    isActive,
    status: normalizeText(parentValue?.status) || (isActive ? "Active" : "Inactive"),
    additionalInfo: normalizeText(parentValue?.additionalInfo) || "N/A",
    createdAt: parentValue?.createdAt || parentValue?.updatedAt || null,
    relationships,
    children,
    detailsLoaded: true,
  };
};

const sortParentsByName = (items = []) =>
  [...items].sort((left, right) => String(left?.name || "").localeCompare(String(right?.name || "")));

function Parent() {
  const API_BASE = `${BACKEND_BASE}/api`;
  const [searchTerm, setSearchTerm] = useState("");
  const [parentTab, setParentTab] = useState("Details");
  const [showMessageDropdown, setShowMessageDropdown] = useState(false);
  const [showPostDropdown, setShowPostDropdown] = useState(false);
  const [selectedParent, setSelectedParent] = useState(null);
  const [sidebarVisible, setSidebarVisible] = useState(window.innerWidth > 900);
  const [parentFullscreenOpen, setParentFullscreenOpen] = useState(false);
  const [dashboardMenuOpen, setDashboardMenuOpen] = useState(true);
  const [studentMenuOpen, setStudentMenuOpen] = useState(true);
  const typingTimeoutRef = useRef(null);
  const usersDataRef = useRef({});
  const parentsDataRef = useRef({});
  const studentsDataRef = useRef({});

  // Pagination states
  
  // React Query client for cache management
  const queryClient = useQueryClient();

  const navigate = useNavigate();
  const location = useLocation();

  // Build the admin object from the Admin session for the Admin web app.
  const _stored = (() => {
    const s = localStorage.getItem("admin");
    if (!s) return {};
    try {
      return JSON.parse(s) || {};
    } catch (e) {
      return {};
    }
  })();

  const admin = {
    adminId: _stored.financeId || _stored.adminId || _stored.userId || "",
    userId: _stored.userId || _stored.financeId || _stored.adminId || "",
    name: _stored.name || _stored.username || "Admin",
    profileImage: _stored.profileImage || "/default-profile.png",
    token: _stored.token || _stored.accessToken || _stored.idToken || null,
  };
  const schoolCode = _stored.schoolCode || "";
  const DB = schoolNodeBase(schoolCode);
  // Latent bug fix: this URL was referenced in the React Query block but
  // never declared, so `enabled: Boolean(PARENT_DIRECTORY_URL)` resolved
  // to false and the parents list never actually loaded.
  const PARENT_DIRECTORY_URL = `${DB}/ParentDirectory.json`;
  const readSchoolNodeApi = async (path, fallbackValue = {}) => {
    if (!schoolCode) {
      return fallbackValue;
    }
    try {
      const response = await axios.get(`${API_BASE}/school-node-read`, {
        params: { schoolCode, path },
        timeout: 12000,
      });
      const data = response?.data?.data;
      return data === null || data === undefined ? fallbackValue : data;
    } catch {
      return fallbackValue;
    }
  };
  const patchSchoolNodeApi = async (path, patchValue = {}) => {
    if (!schoolCode) {
      return;
    }

    const currentValue = await readSchoolNodeApi(path, {});
    const baseValue =
      currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
        ? currentValue
        : {};

    await axios.put(
      `${API_BASE}/school-node`,
      {
        schoolCode,
        path,
        value: {
          ...baseValue,
          ...(patchValue || {}),
        },
      },
      { timeout: 12000 }
    );
  };
  // expose username (from Users node) for sidebar display
  admin.username = _stored.username || "";
  const adminId = admin.userId;
  const {
    unreadSenders,
    setUnreadSenders,
    unreadPosts: postNotifications,
    setUnreadPosts: setPostNotifications,
    messageCount,
    totalNotifications,
    markMessagesAsSeen,
    markPostAsSeen,
  } = useTopbarNotifications({
    dbRoot: DB,
    currentUserId: admin.userId,
  });




  const formatDateLabel = (ts) => {
    if (!ts) return "";
    try { return new Date(ts).toLocaleDateString(); } catch { return ""; }
  };
  const formatTime = (ts) => {
    if (!ts) return "";
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ""; }
  };
  const [windowW, setWindowW] = useState(window.innerWidth);

  const isNarrow = windowW < 900;

  // Portrait detection helper used in sidebar layout
  const isPortrait = windowW <= 600;
  const contentLeft = 0;

  const loadParentDatasets = async (options = {}) => {
    const force = Boolean(options?.force);
    const hasCachedDatasets =
      Object.keys(usersDataRef.current || {}).length > 0 &&
      Object.keys(parentsDataRef.current || {}).length > 0 &&
      Object.keys(studentsDataRef.current || {}).length > 0;

    if (!force && hasCachedDatasets) {
      return {
        usersData: usersDataRef.current,
        parentsData: parentsDataRef.current,
        studentsData: studentsDataRef.current,
      };
    }

    const [usersData, parentsData, studentsData] = await Promise.all([
      readSchoolNodeApi("Users", {}),
      readSchoolNodeApi("Parents", {}),
      readSchoolNodeApi("Students", {}),
    ]);

    usersDataRef.current = usersData || {};
    parentsDataRef.current = parentsData || {};
    studentsDataRef.current = studentsData || {};

    return {
      usersData: usersDataRef.current,
      parentsData: parentsDataRef.current,
      studentsData: studentsDataRef.current,
    };
  };

  const getUserByKeyOrUserId = (usersData, maybeUserId) => {
    if (!maybeUserId) return null;
    return (
      usersData?.[maybeUserId] ||
      Object.values(usersData || {}).find((u) => String(u?.userId) === String(maybeUserId)) ||
      null
    );
  };

  const findStudentMatchById = (studentsData, maybeStudentId) => {
    if (!maybeStudentId) return null;

    if (studentsData?.[maybeStudentId]) {
      return { key: maybeStudentId, record: studentsData[maybeStudentId] };
    }

    const matchedEntry = Object.entries(studentsData || {}).find(
      ([studentKey, studentRecord]) =>
        String(studentKey) === String(maybeStudentId) ||
        String(studentRecord?.studentId || studentRecord?.id || "") === String(maybeStudentId) ||
        String(studentRecord?.use || studentRecord?.userId || studentRecord?.user || "") === String(maybeStudentId)
    );

    if (!matchedEntry) return null;

    return { key: matchedEntry[0], record: matchedEntry[1] };
  };

  const getResolvedParentChildLinks = ({
    parentRecord,
    parentRecordKey,
    parentUserId,
    studentsData,
  }) => {
    const parentIds = new Set(
      [parentRecordKey, parentRecord?.parentId].filter(Boolean).map((value) => String(value))
    );
    const parentUserIds = new Set(
      [parentUserId, parentRecord?.userId].filter(Boolean).map((value) => String(value))
    );
    const childMap = new Map();

    const addChildLink = (rawLink, fallbackStudentId = null) => {
      const studentMatch = findStudentMatchById(
        studentsData,
        rawLink?.studentId || rawLink?.student_id || rawLink?.id || fallbackStudentId
      );

      if (!studentMatch?.record) return;

      const canonicalStudentId =
        studentMatch.record?.studentId ||
        studentMatch.record?.id ||
        studentMatch.key;

      if (!canonicalStudentId) return;

      const childKey = String(canonicalStudentId);
      const existing = childMap.get(childKey) || {};

      childMap.set(childKey, {
        studentId: childKey,
        relationship:
          rawLink?.relationship ||
          rawLink?.relation ||
          rawLink?.childRelationship ||
          existing.relationship ||
          null,
      });
    };

    Object.values(parentRecord?.children || {}).forEach((childLink) => addChildLink(childLink));

    Object.entries(studentsData || {}).forEach(([studentKey, studentRecord]) => {
      const studentParents = studentRecord?.parents || {};

      Object.entries(studentParents).forEach(([studentParentKey, studentParentLink]) => {
        const matchesParent =
          parentIds.has(String(studentParentKey)) ||
          parentIds.has(String(studentParentLink?.parentId || "")) ||
          parentUserIds.has(String(studentParentLink?.userId || ""));

        if (!matchesParent) return;

        addChildLink(
          {
            studentId: studentRecord?.studentId || studentKey,
            relationship: studentParentLink?.relationship,
          },
          studentKey
        );
      });

      const guardianParents = Array.isArray(studentRecord?.parentGuardianInformation?.parents)
        ? studentRecord.parentGuardianInformation.parents
        : Object.values(studentRecord?.parentGuardianInformation?.parents || {});

      guardianParents.forEach((guardianLink) => {
        const matchesParent =
          parentIds.has(String(guardianLink?.parentId || "")) ||
          parentUserIds.has(String(guardianLink?.userId || guardianLink?.systemAccountInformation?.userId || ""));

        if (!matchesParent) return;

        addChildLink(
          {
            studentId: studentRecord?.studentId || studentKey,
            relationship: guardianLink?.relationship,
          },
          studentKey
        );
      });
    });

    return Array.from(childMap.values());
  };

  // ---------------- PARENTS LIST (hook owns data layer) ----------------
  const {
    parents,
    setParents,
    loadingParents,
    paginationCursor,
    hasMoreParents,
    loadingMore,
    loadMoreParents,
    filteredParents,
  } = useParentsList({
    schoolCode,
    searchTerm,
    setSelectedParent,
    loadParentDatasets,
    getUserByKeyOrUserId,
    findStudentMatchById,
    getResolvedParentChildLinks,
  });

  // ---------------- PARENT CHAT (hook owns chat data layer) ----------------
  const {
    parentChatOpen, setParentChatOpen,
    messages,
    newMessageText, setNewMessageText,
    typingUserId,
    messagesEndRef,
    handleTyping,
    sendMessage,
  } = useParentChat({
    admin,
    selectedParent,
    dbUrl: DB,
    readSchoolNodeApi,
    patchSchoolNodeApi,
  });

  // ---------------- PARENT DETAIL (hook owns per-parent fetch + toggle) ----------------
  const {
    parentInfo, setParentInfo,
    children, setChildren,
    togglingParentActive,
    toggleParentActive,
    updateParentInState,
  } = useParentDetail({
    selectedParent,
    setSelectedParent,
    setParents,
    dbUrl: DB,
    loadParentDatasets,
    getUserByKeyOrUserId,
    getResolvedParentChildLinks,
    findStudentMatchById,
  });

  // Window resize handling for responsiveness
  useEffect(() => {
    const onResize = () => setWindowW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Keep sidebarVisible default based on screen size
  useEffect(() => {
    setSidebarVisible(windowW > 900);
  }, [windowW]);

  useEffect(() => {
    if (!selectedParent) {
      setParentFullscreenOpen(false);
    }
  }, [selectedParent]);

  


  // Mark post notification & navigate
  const handleNotificationClick = async (notification) => {
    try {
      await markPostAsSeen(notification.postId);
    } catch (err) {
      console.warn("Failed to mark notification:", err);
    }
    setPostNotifications((prev) =>
      prev.filter((n) => n.notificationId !== notification.notificationId)
    );
    setShowPostDropdown(false);
    navigate("/dashboard", { state: { postId: notification.postId } });
  };

  useEffect(() => {
    if (location.state?.postId) setPostNotifications([]);
  }, [location.state]);

  // Close messenger dropdown if clicked outside
  useEffect(() => {
    const closeDropdown = (e) => {
      if (!e.target.closest(".icon-circle") && !e.target.closest(".messenger-dropdown")) {
        setShowMessageDropdown(false);
      }
    };
    document.addEventListener("click", closeDropdown);
    return () => document.removeEventListener("click", closeDropdown);
  }, []);









  // allow rendering even if no admin/userId is present; effects will no-op when adminId is falsy


  const PRIMARY = "#007afb";
  const BACKGROUND = "#ffffff";
  const ACCENT = "#00B6A9";
  const rightSidebarOffset = !isPortrait ? 408 : 2;
  const FEED_MAX_WIDTH = "min(1320px, 100%)";
  const contentWidth = isNarrow
    ? "100%"
    : !isPortrait
      ? "min(760px, max(320px, calc(100vw - 560px)))"
      : "760px";

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

  const elevatedPanelStyle = {
    background: "var(--surface-panel)",
    border: "1px solid var(--border-soft)",
    boxShadow: "var(--shadow-soft)",
  };

  const searchShellStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    borderRadius: "12px",
    padding: "10px 12px",
    background: "var(--surface-panel)",
    border: "1px solid var(--border-soft)",
    boxShadow: "var(--shadow-soft)",
  };

  const sidebarShellStyle = {
    background: "var(--surface-panel)",
    boxShadow: "var(--shadow-panel)",
    border: isPortrait ? "none" : "1px solid var(--border-soft)",
    borderRadius: isPortrait ? 0 : 18,
  };

  const detailsCardStyle = {
    padding: "14px",
    borderRadius: 16,
    margin: "0 auto",
    maxWidth: 380,
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
    border: "1px solid var(--border-soft)",
    boxShadow: "var(--shadow-soft)",
  };

  const infoTileStyle = {
    alignItems: "center",
    justifyContent: "flex-start",
    display: "flex",
    background: "var(--surface-soft)",
    padding: "10px",
    borderRadius: 14,
    border: "1px solid var(--border-soft)",
    minHeight: 52,
  };

  const statusValueColor = (label, value) => {
    if (label !== "Status") return "var(--text-primary)";
    return value && String(value).toLowerCase() === "active" ? "var(--success)" : "var(--danger)";
  };

  const tabButtonStyle = (isActive) => ({
    flex: 1,
    padding: "8px",
    background: isActive ? "var(--surface-accent)" : "transparent",
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    color: isActive ? "var(--accent-strong)" : "var(--text-muted)",
    fontSize: "11px",
    borderBottom: isActive ? "2px solid var(--accent-strong)" : "2px solid transparent",
    transition: "all 0.2s ease",
  });

  const chatFabStyle = {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "56px",
    height: "56px",
    background: "var(--accent-strong)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    cursor: "pointer",
    zIndex: 1000,
    boxShadow: "var(--shadow-glow)",
    transition: "transform 0.2s ease",
  };

  const chatWindowStyle = {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "360px",
    height: "480px",
    background: "var(--surface-panel)",
    borderRadius: "16px",
    boxShadow: "var(--shadow-panel)",
    border: "1px solid var(--border-soft)",
    zIndex: 2000,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };

  const chatInputStyle = {
    flex: 1,
    padding: "10px 14px",
    borderRadius: "25px",
    border: "1px solid var(--input-border)",
    outline: "none",
    background: "var(--input-bg)",
    color: "var(--text-primary)",
  };

  const actionCircleButtonStyle = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-secondary)",
  };

  const parentCardBase = {
    maxWidth: "100%",
    minHeight: "86px",
    borderRadius: "14px",
    padding: "12px",
    cursor: "pointer",
    transition: "all 0.25s ease",
    width: "100%",
    boxSizing: "border-box",
    position: "relative",
  };

  const renderParentProfilePanel = (isFullscreen = false) => {
    if (!selectedParent) return null;

    const activeParent = parentInfo && String(parentInfo.userId) === String(selectedParent.userId)
      ? { ...selectedParent, ...parentInfo }
      : selectedParent;

    const formattedStatus = activeParent.status
      ? `${String(activeParent.status).charAt(0).toUpperCase()}${String(activeParent.status).slice(1)}`
      : "—";
    const parentIsActive = activeParent.isActive !== false;
    const formattedRelationships = Array.isArray(activeParent.relationships) && activeParent.relationships.length > 0
      ? Array.from(new Set(activeParent.relationships.filter(Boolean))).join(", ")
      : (activeParent.childRelationship && activeParent.childRelationship !== "N/A" ? activeParent.childRelationship : "—");
    const formattedAddress = typeof activeParent.address === "string"
      ? activeParent.address
      : activeParent.address && typeof activeParent.address === "object"
        ? [
            activeParent.address.street,
            activeParent.address.subCity,
            activeParent.address.city,
            activeParent.address.state,
            activeParent.address.region,
          ].filter(Boolean).join(", ") || JSON.stringify(selectedParent.address)
        : "—";
    const formattedCreatedAt = activeParent.createdAt && activeParent.createdAt !== "N/A"
      ? new Date(activeParent.createdAt).toLocaleString()
      : "—";
    const profileItems = [
      { label: "Parent ID", value: activeParent.parentId || "—" },
      { label: "Username", value: activeParent.username || "—" },
      { label: "Email", value: activeParent.email || "N/A" },
      { label: "Phone", value: activeParent.phone || "N/A" },
      { label: "Age", value: activeParent.age || "—" },
      { label: "City", value: activeParent.city || (activeParent.address && typeof activeParent.address === "object" ? activeParent.address.city : activeParent.city) || "—" },
      { label: "Citizenship", value: activeParent.citizenship || "—" },
      { label: "Job", value: activeParent.job || "—" },
      { label: "Status", value: formattedStatus },
      { label: "Relationship", value: formattedRelationships },
      { label: "Children", value: children.length || "0" },
      { label: "Created", value: formattedCreatedAt },
      { label: "Address", value: formattedAddress, fullWidth: true },
      { label: "Additional Info", value: activeParent.additionalInfo && activeParent.additionalInfo !== "N/A" ? activeParent.additionalInfo : "—", fullWidth: true },
    ];

    const detailsSection = (
      <ParentDetailsSection
        activeParent={activeParent}
        parentIsActive={parentIsActive}
        togglingParentActive={togglingParentActive}
        toggleParentActive={toggleParentActive}
        children={children}
        formattedRelationships={formattedRelationships}
        profileItems={profileItems}
        detailsCardStyle={detailsCardStyle}
        infoTileStyle={infoTileStyle}
        statusValueColor={statusValueColor}
      />
    );

    const childrenSection = (
      <ParentChildrenSection children={children} elevatedPanelStyle={elevatedPanelStyle} />
    );

    const statusSection = (
      <ParentStatusSection selectedParent={selectedParent} />
    );

    if (isFullscreen) {
      return (
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
                <ProfileAvatar src={activeParent.profileImage} name={activeParent.name} alt={activeParent.name} style={{ width: 56, height: 56, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.8)", objectFit: "cover" }} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{activeParent.name || "Parent"}</div>
                  <div style={{ fontSize: 12, opacity: 0.95 }}>
                    {activeParent.parentId || "No Parent ID"}
                    {activeParent.phone ? ` • ${activeParent.phone}` : ""}
                    {activeParent.email ? ` • ${activeParent.email}` : ""}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => setParentFullscreenOpen(false)}
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
              <div style={{ background: "var(--surface-panel)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: 10, boxShadow: "var(--shadow-soft)" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)", marginBottom: 8 }}>Parent Details</div>
                {detailsSection}
              </div>

              <div style={{ background: "var(--surface-panel)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: 10, boxShadow: "var(--shadow-soft)" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)", marginBottom: 8 }}>Status</div>
                {statusSection}
              </div>

              <div style={{ background: "var(--surface-panel)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: 10, boxShadow: "var(--shadow-soft)", gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)", marginBottom: 8 }}>Children</div>
                {childrenSection}
              </div>
            </div>
          </div>
        </div>
      );
    }

    const panelStyle = isFullscreen
      ? {
          position: "fixed",
          inset: 12,
          background: "var(--page-bg-secondary)",
          zIndex: 1400,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: isPortrait ? 0 : 24,
          border: isPortrait ? "none" : "1px solid var(--border-soft)",
          boxShadow: "var(--shadow-panel)",
          fontSize: "10px",
        }
      : {
          width: isPortrait ? "100%" : "380px",
          position: "fixed",
          left: isPortrait ? 0 : "auto",
          right: isPortrait ? 0 : 14,
          top: isPortrait ? 0 : "calc(var(--topbar-height) + 18px)",
          height: isPortrait ? "100vh" : "calc(100vh - var(--topbar-height) - 36px)",
          maxHeight: isPortrait ? "100vh" : "calc(100vh - var(--topbar-height) - 36px)",
          ...sidebarShellStyle,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          padding: "14px",
          fontSize: "12px",
        };

    return (
      <aside className="parent-info-sidebar" style={panelStyle}>
        <div style={{ position: "absolute", top: 12, left: 14, zIndex: 999 }}>
          <button
            onClick={() => {
              if (isFullscreen) {
                setParentFullscreenOpen(false);
                return;
              }
              setParentFullscreenOpen(false);
              setSidebarVisible(false);
            }}
            aria-label={isFullscreen ? "Close expanded parent profile" : "Close sidebar"}
            style={{
              width: 34,
              height: 34,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.42)",
              borderRadius: 999,
              backdropFilter: "blur(6px)",
              fontSize: 24,
              fontWeight: 700,
              color: "#ffffff",
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
              boxShadow: "0 8px 22px rgba(15, 23, 42, 0.18)",
            }}
          >
            <FaTimes />
          </button>
        </div>

        {!isFullscreen && (
          <div style={{ position: "absolute", top: 8, right: 14, zIndex: 999 }}>
            <button
              onClick={() => setParentFullscreenOpen(true)}
              aria-label="Expand parent profile"
              title="Expand"
              style={{
                border: "1px solid var(--border-strong)",
                background: "var(--surface-panel)",
                color: "var(--accent-strong)",
                borderRadius: 8,
                padding: "4px 8px",
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

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div
            style={{
              background: "linear-gradient(135deg, var(--accent-strong), var(--accent))",
              margin: "-14px -14px 12px",
              padding: "16px 10px",
              textAlign: "center",
            }}
          >
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
              <ProfileAvatar src={selectedParent.profileImage} name={selectedParent.name} alt={selectedParent.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <h2 style={{ margin: 0, color: "#ffffff", fontSize: 14, fontWeight: 800 }}>{selectedParent.name}</h2>
            <p style={{ margin: "4px 0", color: "#dbeafe", fontSize: "10px" }}>{selectedParent.parentId || "No Parent ID"}</p>
            <p style={{ margin: 0, color: "#dbeafe", fontSize: "10px" }}>
              {selectedParent.phone || "No phone"}
              {selectedParent.email ? ` • ${selectedParent.email}` : ""}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--border-soft)",
              marginBottom: "10px",
              flexShrink: 0,
              background: "var(--surface-panel)",
            }}
          >
            {[
              { key: "Details", label: "DETAILS" },
              { key: "Children", label: "CHILDREN" },
              { key: "Status", label: "STATUS" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setParentTab(t.key)}
                style={tabButtonStyle(parentTab === t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingBottom: 40, paddingRight: 2 }}>
            {parentTab === "Details" && detailsSection}
            {parentTab === "Children" && childrenSection}
            {parentTab === "Status" && statusSection}
          </div>

          {!parentChatOpen && (
            <div onClick={() => setParentChatOpen(true)} style={chatFabStyle}>
              <FaCommentDots size={30} />
            </div>
          )}

          {parentChatOpen && (
            <div style={chatWindowStyle}>
              <div style={{ padding: "14px", borderBottom: "1px solid var(--border-soft)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "color-mix(in srgb, var(--accent-soft) 78%, var(--surface-panel) 22%)" }}>
                <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
                  <strong style={{ color: "var(--text-primary)" }}>{selectedParent.name}</strong>
                  {typingUserId && String(typingUserId) === String(selectedParent.userId) && (
                    <small style={{ color: "var(--accent-strong)", marginTop: 4 }}>Typing…</small>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => {
                      setParentChatOpen(false);
                      navigate("/all-chat", { state: { user: selectedParent, tab: "parent" } });
                    }}
                    style={{ ...actionCircleButtonStyle, fontSize: "18px" }}
                  >
                    <FaExpand />
                  </button>
                  <button onClick={() => setParentChatOpen(false)} style={{ ...actionCircleButtonStyle, fontSize: "20px" }}><FaTimes /></button>
                </div>
              </div>

              <div style={{ flex: 1, padding: "12px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", background: "var(--surface-muted)" }}>
                {messages.length === 0 ? (
                  <p style={{ textAlign: "center", color: "var(--text-muted)" }}>Start chatting with {selectedParent.name}</p>
                ) : (
                  messages.map((m) => {
                    const isAdmin = String(m.senderId) === String(admin.userId);
                    return (
                      <div key={m.messageId || m.id} style={{ display: "flex", flexDirection: "column", alignItems: isAdmin ? "flex-end" : "flex-start", marginBottom: 10 }}>
                        <div style={{ maxWidth: "70%", background: isAdmin ? "var(--accent-strong)" : "var(--surface-panel)", color: isAdmin ? "#fff" : "var(--text-primary)", padding: "10px 14px", borderRadius: 18, borderTopRightRadius: isAdmin ? 0 : 18, borderTopLeftRadius: isAdmin ? 18 : 0, boxShadow: "0 1px 3px rgba(0,0,0,0.10)", wordBreak: "break-word", cursor: "default", position: "relative", border: isAdmin ? "none" : "1px solid var(--border-soft)" }}>
                          {m.text} {m.edited && (<small style={{ fontSize: 10 }}> (edited)</small>)}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 6, fontSize: 11, color: isAdmin ? "#fff" : "var(--text-muted)" }}>
                            <span style={{ marginRight: 6, fontSize: 11, opacity: 0.9 }}>{formatDateLabel(m.timeStamp)}</span>
                            <span>{formatTime(m.timeStamp)}</span>
                            {isAdmin && !m.deleted && (
                              <span style={{ display: "flex", gap: 0, alignItems: "center" }}>
                                <FaCheck size={10} color={isAdmin ? "#fff" : "var(--text-muted)"} style={{ opacity: 0.90, marginLeft: 2 }} />
                                {m.seen && (<FaCheck size={10} color={isAdmin ? "color-mix(in srgb, white 90%, var(--accent-soft) 10%)" : "var(--border-strong)"} style={{ marginLeft: -6, opacity: 0.95 }} />)}
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

              <div style={{ padding: "10px", borderTop: "1px solid var(--border-soft)", display: "flex", gap: "8px", background: "var(--surface-panel)" }}>
                <input value={newMessageText} onChange={(e) => { setNewMessageText(e.target.value); handleTyping(e.target.value); }} placeholder="Type a message..." style={chatInputStyle} onKeyDown={(e) => { if (e.key === "Enter") sendMessage(newMessageText); }} />
                <button onClick={() => sendMessage(newMessageText)} style={{ width: 45, height: 45, borderRadius: "50%", background: "var(--accent-strong)", border: "none", color: "#fff", display: "flex", justifyContent: "center", alignItems: "center", cursor: "pointer" }}>
                  <FaPaperPlane />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    );
  };

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
        "--surface-soft": "#F8FBFF",
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

        {/* MAIN CONTENT */}
        <main
          className={`main-content ${selectedParent && sidebarVisible && !parentFullscreenOpen ? "sidebar-open" : ""}`}
          style={{
            flex: "1 1 0",
            minWidth: 0,
            maxWidth: "none",
            margin: 0,
            boxSizing: "border-box",
            alignSelf: "flex-start",
            minHeight: "calc(100vh - 24px)",
            overflowY: "visible",
            overflowX: "hidden",
            position: "relative",
            padding: `0 ${selectedParent && sidebarVisible && !parentFullscreenOpen ? rightSidebarOffset : 2}px 0 2px`,
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
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.01em" }}>Parents</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)", maxWidth: 620, lineHeight: 1.5 }}>
                    Manage parent accounts, child links, activation status, and communication from the same admin workspace as the Students page.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14, position: "relative", zIndex: 1 }}>
                {[
                  { label: `Total: ${parents.length}` },
                  { label: `Visible: ${filteredParents.length}` },
                  { label: `Active: ${parents.filter((parent) => parent.isActive !== false).length}` },
                ].map((item) => (
                  <div key={item.label} style={{ padding: "7px 12px", borderRadius: 999, background: "color-mix(in srgb, var(--surface-panel) 72%, white)", border: "1px solid var(--border-soft)", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                    {item.label}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: isNarrow ? "center" : "flex-start", marginBottom: "10px", paddingLeft: contentLeft }}>
              <div
                style={{
                  width: contentWidth,
                  ...searchShellStyle,
                }}
              >
                <FaSearch style={{ color: "var(--text-muted)", fontSize: "12px" }} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search parents by name, email, phone"
                  style={{
                    border: "none",
                    outline: "none",
                    width: "100%",
                    fontSize: "13px",
                    color: "var(--text-primary)",
                    background: "transparent",
                  }}
                />
              </div>
            </div>

            {loadingParents ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: isNarrow ? "center" : "flex-start", gap: "12px", paddingLeft: contentLeft }}>
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} style={{ width: contentWidth, minHeight: "86px", borderRadius: "14px", padding: "12px", background: "var(--surface-panel)", border: "1px solid var(--border-soft)", boxShadow: "var(--shadow-soft)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-muted)" }} />
                      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--surface-muted)" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ width: "55%", height: 12, background: "var(--surface-muted)", borderRadius: 6, marginBottom: 8 }} />
                        <div style={{ width: "45%", height: 10, background: "var(--surface-muted)", borderRadius: 6 }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredParents.length === 0 ? (
              <p style={{ width: contentWidth, marginLeft: contentLeft, textAlign: "center", color: "var(--text-secondary)" }}>No parents found.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: isNarrow ? "center" : "flex-start", gap: "12px", paddingLeft: contentLeft }}>
                <FixedSizeList
                  height={Math.min(600, filteredParents.length * 104)}
                  itemCount={filteredParents.length}
                  itemSize={104}
                  width={contentWidth}
                  style={{ maxWidth: "100%" }}
                >
                  {({ index, style }) => {
                    const p = filteredParents[index];
                    return (
                      <div style={{ ...style, padding: "6px 0" }}>
                        <div
                          key={p.userId}
                          onClick={() => { setSelectedParent(p); setSidebarVisible(true); }}
                          style={{
                            ...parentCardBase,
                            width: "100%",
                            background: selectedParent?.userId === p.userId ? "var(--surface-accent)" : "var(--surface-panel)",
                            border: selectedParent?.userId === p.userId ? "2px solid var(--accent-strong)" : "1px solid var(--border-soft)",
                            boxShadow: selectedParent?.userId === p.userId ? "var(--shadow-glow)" : "var(--shadow-soft)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingRight: 94 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: "color-mix(in srgb, var(--accent-soft) 75%, var(--surface-panel) 25%)",
                                color: "var(--accent-strong)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 800,
                                fontSize: 13,
                                flex: "0 0 auto",
                              }}
                            >
                              {index + 1}
                            </div>
                            <ProfileAvatar src={p.profileImage} name={p.name} alt={p.name} loading="lazy" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: selectedParent?.userId === p.userId ? "3px solid var(--accent-strong)" : "3px solid var(--border-soft)", transition: "all 0.3s ease" }} />
                            <div style={{ minWidth: 0 }}>
                              <h3 style={{ margin: 0, fontSize: "14px", color: "var(--text-primary)", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {p.name}
                              </h3>
                              <div style={{ color: "var(--text-muted)", fontSize: "11px", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {p.email && p.email !== "N/A" ? p.email : `${p.childRelationship || "N/A"}: ${p.childName || "N/A"}`}
                              </div>
                            </div>
                          </div>
                          <div
                            style={{
                              position: "absolute",
                              top: 14,
                              right: 12,
                              padding: "5px 9px",
                              borderRadius: 999,
                              background: p.isActive === false ? "var(--warning-soft)" : "var(--success-soft)",
                              color: p.isActive === false ? "var(--danger)" : "var(--success)",
                              border: p.isActive === false ? "1px solid var(--warning-border)" : "1px solid var(--success-border)",
                              fontSize: 10,
                              fontWeight: 900,
                              lineHeight: 1,
                            }}
                          >
                            {p.isActive === false ? "Inactive" : "Active"}
                          </div>
                        </div>
                      </div>
                    );
                  }}
                </FixedSizeList>
                
                {/* Load More Button */}
                {hasMoreParents && !loadingMore && (
                  <button
                    onClick={loadMoreParents}
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
                    Load More Parents
                  </button>
                )}
                
                {/* Loading More Indicator */}
                {loadingMore && (
                  <div style={{ width: contentWidth, maxWidth: "100%", textAlign: "center", padding: "12px", color: "var(--text-muted)", fontSize: "13px" }}>
                    Loading more parents...
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* RIGHT SIDEBAR */}
        {selectedParent && sidebarVisible && !parentFullscreenOpen && renderParentProfilePanel(false)}
        {selectedParent && parentFullscreenOpen && renderParentProfilePanel(true)}

      </div>
    </div>
  );
}

export default Parent;
