import React from "react";
import { FaChalkboardTeacher, FaCommentDots } from "react-icons/fa";
import ProfileAvatar from "../../ProfileAvatar";
import TeacherDetailsTab from "./TeacherDetailsTab";
import TeacherScheduleTab from "./TeacherScheduleTab";
import TeacherPlanTab from "./TeacherPlanTab";

const TABS = ["details", "schedule", "plan"];

/**
 * TeacherDetailSidebar
 *
 * Fixed right-hand sidebar of the Teachers page. Shows the selected teacher's
 * header (avatar + name + email), a Details/Schedule/Plan tab strip, the
 * corresponding tab pane, and a floating "Teacher Chat" trigger. When no
 * teacher is selected it shows the faculty-overview placeholder + quick stats.
 *
 * Per-tab props are grouped (detailsTabProps / scheduleTabProps / planTabProps)
 * to keep the surface manageable.
 */
export default function TeacherDetailSidebar({
  // layout
  isPortrait,
  // selection + header
  selectedTeacher,
  setSelectedTeacher,
  sidebarTeacherImage,
  sidebarTeacherName,
  sidebarTeacherEmail,
  // tabs
  activeTab,
  setActiveTab,
  tabButtonStyle,
  // placeholder stats (when no teacher selected)
  teachers,
  filteredTeachers,
  selectedGrade,
  searchTerm,
  rightDrawerCardStyle,
  // per-tab grouped props
  detailsTabProps,
  scheduleTabProps,
  planTabProps,
  // chat trigger
  onOpenChat,
}) {
  return (
    <div
      className="teacher-info-sidebar"
      style={{
        width: isPortrait ? "100%" : "380px",
        position: "fixed",
        left: isPortrait ? 0 : "auto",
        right: isPortrait ? 0 : 14,
        top: isPortrait ? 0 : "calc(var(--topbar-height) + 18px)",
        height: isPortrait ? "100vh" : "calc(100vh - var(--topbar-height) - 36px)",
        maxHeight: isPortrait ? "100vh" : "calc(100vh - var(--topbar-height) - 36px)",
        background: "var(--surface-panel)",
        boxShadow: "var(--shadow-panel)",
        border: isPortrait ? "none" : "1px solid var(--border-soft)",
        borderRadius: isPortrait ? 0 : 18,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        fontSize: "12px",
        overflowY: "auto",
        padding: "14px",
      }}
    >
      {/* CLOSE BUTTON */}
      {selectedTeacher && (
        <div style={{ position: "absolute", top: 12, left: 14, zIndex: 2000 }}>
          <button
            onClick={() => setSelectedTeacher(null)}
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
            ×
          </button>
        </div>
      )}

      {/* SCROLLABLE CONTENT */}
      <div style={{ flex: 1, overflowY: "auto", padding: 0 }}>
        {/* HEADER */}
        <div
          style={{
            background: "linear-gradient(135deg, var(--accent-strong), var(--accent))",
            margin: "-14px -14px 12px",
            padding: "16px 10px",
            textAlign: "center",
          }}
        >
          {selectedTeacher ? (
            <>
              <div
                style={{
                  width: "70px",
                  height: "70px",
                  margin: "0 auto 10px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "3px solid color-mix(in srgb, var(--surface-panel) 78%, transparent)",
                }}
              >
                <ProfileAvatar
                  src={sidebarTeacherImage}
                  name={sidebarTeacherName}
                  alt={sidebarTeacherName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>

              <h2 style={{ margin: 0, color: "var(--on-accent)", fontSize: 14, fontWeight: 800 }}>
                {sidebarTeacherName}
              </h2>

              {sidebarTeacherEmail ? (
                <p style={{ margin: "4px 0", color: "color-mix(in srgb, var(--on-accent) 82%, transparent)", fontSize: "10px" }}>
                  {sidebarTeacherEmail}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div
                style={{
                  width: "70px",
                  height: "70px",
                  margin: "0 auto 10px",
                  borderRadius: "50%",
                  border: "3px solid color-mix(in srgb, var(--surface-panel) 78%, transparent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--on-accent)",
                  background: "color-mix(in srgb, var(--surface-panel) 16%, transparent)",
                }}
              >
                <FaChalkboardTeacher size={30} />
              </div>

              <h2 style={{ margin: 0, color: "var(--on-accent)", fontSize: 14, fontWeight: 800 }}>
                {sidebarTeacherName}
              </h2>

              <p style={{ margin: "4px 0", color: "color-mix(in srgb, var(--on-accent) 82%, transparent)", fontSize: "10px", fontWeight: 600 }}>
                Faculty Overview
              </p>
            </>
          )}
        </div>

        {/* TABS */}
        {selectedTeacher ? (
          <div style={{ display: "flex", borderBottom: "1px solid var(--border-soft)", marginBottom: "10px" }}>
            {TABS.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={tabButtonStyle(tab)}>
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        ) : null}

        {/* PLACEHOLDER STATS (no teacher selected) */}
        {!selectedTeacher ? (
          <div
            style={{
              padding: "10px",
              display: "grid",
              gap: 8,
              gridTemplateColumns: "1fr 1fr",
              marginBottom: "10px",
            }}
          >
            {[
              { label: "Total", value: teachers.length },
              { label: "Visible", value: filteredTeachers.length },
              {
                label: "Grade",
                value:
                  selectedGrade === "All"
                    ? "All"
                    : selectedGrade === "Deactive"
                    ? "Deactivated"
                    : selectedGrade === "Unassigned"
                    ? "Unassigned"
                    : `G${selectedGrade}`,
              },
              { label: "Search", value: searchTerm ? "Active" : "None" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  ...rightDrawerCardStyle,
                  padding: "10px",
                  minHeight: 56,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "9px",
                    fontWeight: 800,
                    color: "var(--text-muted)",
                    letterSpacing: "0.3px",
                    textTransform: "uppercase",
                  }}
                >
                  {item.label}
                </div>
                <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* TAB PANES */}
        {activeTab === "details" && selectedTeacher && <TeacherDetailsTab {...detailsTabProps} />}
        {activeTab === "schedule" && selectedTeacher && <TeacherScheduleTab {...scheduleTabProps} />}
        {activeTab === "plan" && selectedTeacher && <TeacherPlanTab {...planTabProps} />}

        {/* FLOATING CHAT TRIGGER */}
        {selectedTeacher && (
          <div
            onClick={onOpenChat}
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
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1) ")}
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
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Teacher Chat</span>
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
              T
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
