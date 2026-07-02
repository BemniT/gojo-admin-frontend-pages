import React from "react";

const RIGHT_DRAWER_CARD = {
  background: "var(--surface-panel)",
  borderRadius: 12,
  border: "1px solid var(--border-soft)",
  boxShadow: "var(--shadow-soft)",
};

const WEEK_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/**
 * Parse a period label like "08:30 – 09:15" into {start, end} in minutes from midnight.
 * Returns null for unparseable labels. Treats hours < 8 as afternoon (12h offset).
 */
function getPeriodRangeMinutes(label) {
  if (!label) return null;
  const text = String(label);
  const match = text.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
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
}

/**
 * TeacherScheduleTab
 *
 * The "Schedule" tab of the teacher detail sidebar — renders a 2-column grid
 * of weekdays (Mon–Fri), each showing the periods that teacher teaches plus
 * the subjects/classes per period. Highlights the current day + the current
 * period when one is in progress.
 *
 * Props:
 *   schedule       — { [day]: { [periodKey]: [{ subject, class }, ...] } }
 *                      from useTeacherSchedule.
 *   currentDayName — e.g. "Wednesday" — drives the today-highlight.
 *   currentMinutes — minutes-from-midnight; used to detect "NOW" badge on the
 *                      period the user is currently in.
 *   onDownloadPdf  — handler for the "Download PDF" button.
 */
export default function TeacherScheduleTab({
  schedule,
  currentDayName,
  currentMinutes,
  onDownloadPdf,
}) {
  const hasSchedule = schedule && Object.keys(schedule).length > 0;

  return (
    <div style={{ padding: "8px", ...RIGHT_DRAWER_CARD }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <h4
          style={{
            fontSize: "12px",
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "0.1px",
            margin: 0,
          }}
        >
          Weekly Teaching Schedule
        </h4>

        <button
          type="button"
          className="btn btn-sm"
          style={{
            background: "var(--accent-strong)",
            color: "#ffffff",
            border: "none",
            padding: "5px 8px",
            borderRadius: "10px",
            fontWeight: 800,
            fontSize: "9px",
            letterSpacing: "0.2px",
            boxShadow: "none",
            textTransform: "none",
            cursor: hasSchedule ? "pointer" : "not-allowed",
            opacity: hasSchedule ? 1 : 0.6,
          }}
          onClick={onDownloadPdf}
          disabled={!hasSchedule}
        >
          Download PDF
        </button>
      </div>

      {!hasSchedule ? (
        <div
          style={{
            textAlign: "center",
            padding: "12px",
            borderRadius: "12px",
            background: "var(--surface-muted)",
            border: "1px solid var(--border-soft)",
            color: "var(--text-muted)",
            fontSize: "10px",
          }}
        >
          No schedule assigned yet
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px" }}>
          {WEEK_ORDER.filter((day) => schedule[day]).map((day) => {
            const periods = schedule[day];
            const isToday = currentDayName === day;

            return (
              <div
                key={day}
                style={{
                  borderRadius: "12px",
                  padding: "7px",
                  background: "var(--surface-panel)",
                  boxShadow: "var(--shadow-soft)",
                  border: isToday ? "1px solid var(--accent-strong)" : "1px solid var(--border-soft)",
                }}
              >
                {/* Day header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "6px",
                  }}
                >
                  <h5 style={{ fontSize: "12px", fontWeight: 800, color: "var(--text-primary)" }}>{day}</h5>
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "4px 6px",
                      borderRadius: "999px",
                      background: "var(--surface-accent)",
                      color: "var(--text-secondary)",
                      fontWeight: 700,
                    }}
                  >
                    {Object.keys(periods).length} periods
                  </span>
                </div>

                {/* Periods */}
                {Object.entries(periods).map(([period, entries]) => {
                  const range = getPeriodRangeMinutes(period);
                  const isCurrentPeriod =
                    isToday &&
                    range &&
                    currentMinutes >= range.start &&
                    currentMinutes < range.end;

                  return (
                    <div
                      key={period}
                      style={{
                        marginBottom: "6px",
                        borderRadius: "12px",
                        padding: "8px",
                        background: isCurrentPeriod ? "var(--surface-accent)" : "var(--surface-muted)",
                        border: isCurrentPeriod ? "1px solid var(--accent-strong)" : "1px solid var(--border-soft)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "9px",
                          fontWeight: 800,
                          color: "var(--text-primary)",
                          marginBottom: "4px",
                        }}
                      >
                        <span>{period}</span>
                        {isCurrentPeriod && (
                          <span
                            style={{
                              marginLeft: "8px",
                              fontSize: "8px",
                              padding: "1px 4px",
                              borderRadius: "999px",
                              background: "var(--accent-strong)",
                              color: "#ffffff",
                              fontWeight: 700,
                            }}
                          >
                            NOW
                          </span>
                        )}
                      </div>

                      {/* Subjects in this period */}
                      {entries.map((e, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "4px 6px",
                            borderRadius: "8px",
                            background: "var(--surface-panel)",
                            marginBottom: "4px",
                            border: "1px solid var(--border-soft)",
                            fontSize: "10px",
                          }}
                        >
                          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{e.subject}</span>
                          <span
                            style={{
                              fontSize: "8px",
                              fontWeight: 500,
                              padding: "1px 4px",
                              borderRadius: "999px",
                              background: "var(--surface-accent)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {e.class}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
