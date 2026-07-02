import React from "react";

const SIDEBAR_SECTION_CARD = {
  background: "var(--surface-panel)",
  border: "1px solid var(--border-soft)",
  borderRadius: 16,
  boxShadow: "var(--shadow-soft)",
};

/**
 * StudentAttendanceTab
 *
 * Subject-keyed attendance cards with a daily/weekly/monthly view switch.
 * Tapping a card expands per-day records. All data + the expand/format
 * helpers come from the page (the existing implementation kept these
 * derivations on the page so they can be reused by the fullscreen modal).
 */
export default function StudentAttendanceTab({
  attendanceStats,
  attendanceView,
  setAttendanceView,
  attendanceCourseFilter,
  attendanceBySubject,
  expandedCards,
  toggleExpand,
  getProgress,
  formatSubjectName,
}) {
  return (
    <div style={{ ...SIDEBAR_SECTION_CARD, padding: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.45px" }}>
            Attendance
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
            Simple attendance health by subject.
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase" }}>Present rate</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text-primary)", marginTop: 4 }}>
            {attendanceStats?.percent || 0}%
          </div>
        </div>
      </div>

      {/* VIEW SWITCH */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 10,
          padding: 4,
          borderRadius: 999,
          background: "var(--surface-soft)",
          border: "1px solid var(--border-soft)",
        }}
      >
        {["daily", "weekly", "monthly"].map((v) => (
          <button
            key={v}
            onClick={() => setAttendanceView(v)}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "none",
              fontWeight: 700,
              fontSize: 10,
              cursor: "pointer",
              background: attendanceView === v ? "var(--accent-strong)" : "var(--surface-strong)",
              color: attendanceView === v ? "#fff" : "var(--text-primary)",
            }}
          >
            {v.toUpperCase()}
          </button>
        ))}
      </div>

      {/* SUBJECT CARDS */}
      {Object.entries(attendanceBySubject)
        .filter(([course]) => attendanceCourseFilter === "All" || course === attendanceCourseFilter)
        .map(([course, records]) => {
          const today = new Date().toDateString();
          const weekRecords = records.filter(
            (r) => new Date(r.date).getWeek?.() === new Date().getWeek?.()
          );
          const monthRecords = records.filter(
            (r) => new Date(r.date).getMonth() === new Date().getMonth()
          );
          const displayRecords =
            attendanceView === "daily"
              ? records.filter((r) => new Date(r.date).toDateString() === today)
              : attendanceView === "weekly"
              ? weekRecords
              : monthRecords;
          const progress = getProgress(displayRecords);
          const expandKey = `${attendanceView}-${course}`;
          return (
            <div
              key={course}
              onClick={() => toggleExpand(expandKey)}
              style={{
                cursor: "pointer",
                background: "#ffffff",
                borderRadius: 14,
                padding: 12,
                marginBottom: 10,
                border: "1px solid var(--border-soft)",
                boxShadow: "none",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ position: "absolute", inset: 0, background: "transparent", pointerEvents: "none" }} />

              {/* HEADER */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "var(--text-primary)" }}>
                    {formatSubjectName(course)}
                  </h3>
                  <p style={{ margin: "6px 0 0", fontSize: 10, color: "var(--text-muted)" }}>
                    {records[0]?.teacherName}
                  </p>
                </div>
                <div style={{ fontSize: 11, fontWeight: 900, color: "var(--accent-strong)" }}>{progress}%</div>
              </div>

              {/* PROGRESS BAR */}
              <div
                onClick={() => toggleExpand(expandKey)}
                style={{
                  height: 8,
                  background: "var(--surface-strong)",
                  borderRadius: 999,
                  cursor: "pointer",
                  overflow: "hidden",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progress}%`,
                    background: "var(--accent-strong)",
                    transition: "width .3s ease",
                  }}
                />
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 12 }}>
                Tap to view {attendanceView} details
              </div>

              {/* EXPANDED DAYS */}
              {expandedCards[expandKey] && (
                <div
                  style={{
                    marginTop: 14,
                    background: "var(--surface-soft)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  {displayRecords.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 6px",
                        borderBottom: i !== displayRecords.length - 1 ? "1px solid var(--border-soft)" : "none",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: 10, color: "var(--text-primary)" }}>
                          {new Date(r.date).toDateString()}
                        </span>
                      </div>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 800,
                          background:
                            r.status === "present"
                              ? "var(--success-soft)"
                              : r.status === "late"
                              ? "var(--warning-soft)"
                              : "var(--danger-soft)",
                          color:
                            r.status === "present"
                              ? "var(--success)"
                              : r.status === "late"
                              ? "var(--warning)"
                              : "var(--danger)",
                        }}
                      >
                        {r.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
