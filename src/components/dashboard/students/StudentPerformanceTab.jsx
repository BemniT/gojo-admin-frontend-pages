import React from "react";

const SIDEBAR_SECTION_CARD = {
  background: "var(--surface-panel)",
  border: "1px solid var(--border-soft)",
  borderRadius: 16,
  boxShadow: "var(--shadow-soft)",
};

/**
 * StudentPerformanceTab
 *
 * Semester-based performance view. Normalizes course data shaped as either:
 *   - quarter blocks (q1/quarter1/etc.) → renders one card per quarter
 *   - flat semester assessments        → renders a single semester card
 *
 * The hook (useStudentPerformance) already flattens the legacy DB shapes into
 * `studentMarksFlattened[courseKey] = { semester1, semester2, teacherName }`
 * — this component just renders the active semester slice.
 */
export default function StudentPerformanceTab({
  studentMarksFlattened,
  activeSemester,
  setActiveSemester,
}) {
  return (
    <div style={{ ...SIDEBAR_SECTION_CARD, position: "relative", padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.45px" }}>
            Performance
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
            Semester scores with clearer course cards.
          </div>
        </div>
      </div>

      {/* Semester switcher */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "12px",
          padding: 4,
          borderRadius: 999,
          background: "var(--surface-soft)",
          border: "1px solid var(--border-soft)",
        }}
      >
        {["semester1", "semester2"].map((sem) => {
          const isActive = activeSemester === sem;
          return (
            <button
              key={sem}
              onClick={() => setActiveSemester(sem)}
              style={{
                border: "none",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 700,
                color: isActive ? "var(--on-accent)" : "var(--text-muted)",
                padding: "8px 12px",
                borderRadius: 999,
                background: isActive ? "var(--text-primary)" : "transparent",
              }}
            >
              {sem === "semester1" ? "Semester 1" : "Semester 2"}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
        {Object.keys(studentMarksFlattened || {}).length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 12,
              borderRadius: 12,
              background: "var(--surface-panel)",
              color: "var(--text-secondary)",
              fontSize: 11,
              fontWeight: 600,
              border: "1px solid var(--border-soft)",
              gridColumn: "1 / -1",
            }}
          >
            No performance records
          </div>
        ) : (
          Object.entries(studentMarksFlattened)
            .filter(([, studentCourseData]) => Boolean(studentCourseData?.[activeSemester]))
            .map(([courseKey, studentCourseData], idx) => {
              const data = studentCourseData?.[activeSemester];
              if (!data) return null;

              const assessments = data.assessments || {};
              const total = Object.values(assessments).reduce((sum, a) => sum + (a.score || 0), 0);
              const maxTotal = Object.values(assessments).reduce((sum, a) => sum + (a.max || 0), 0);
              const percentage = maxTotal ? (total / maxTotal) * 100 : 0;
              const statusClr = percentage >= 75 ? "#16a34a" : percentage >= 50 ? "#f59e0b" : "#dc2626";

              const courseName = String(courseKey || "")
                .replace("course_", "")
                .replace(/_/g, " ")
                .toUpperCase();

              const quarterEntriesPreview = Object.entries(data || {})
                .filter(([k, v]) => /^(q\d+|quarter\d+|q_\d+)$/i.test(k) && v && typeof v === "object")
                .sort((a, b) => {
                  const toQuarterNum = (value) => {
                    const m = String(value || "").match(/\d+/);
                    return m ? Number(m[0]) : 0;
                  };
                  return toQuarterNum(a[0]) - toQuarterNum(b[0]);
                });
              const hasQuarterFormatPreview = quarterEntriesPreview.length > 0;

              return (
                <div
                  key={`${courseKey}-${idx}`}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: "var(--surface-panel)",
                    border: "1px solid var(--border-soft)",
                    boxShadow: "var(--shadow-soft)",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 10, color: "var(--text-primary)", textAlign: "left" }}>
                    {courseName}
                  </div>

                  <div style={{ fontSize: 10, fontWeight: 800, marginBottom: 10, color: hasQuarterFormatPreview ? "#1d4ed8" : "#0f766e" }}>
                    {hasQuarterFormatPreview ? "Format: Quarter-based" : "Format: Semester-based"}
                  </div>

                  {(() => {
                    const quarterEntries = quarterEntriesPreview;
                    const hasQuarterFormat = hasQuarterFormatPreview;

                    const renderQuarterBlock = (quarterKey, qdata) => {
                      const quarterMatch = String(quarterKey || "").match(/\d+/);
                      const label = quarterMatch ? `Quarter ${quarterMatch[0]}` : String(quarterKey).toUpperCase();

                      const qAss = qdata?.assessments || qdata || {};
                      const qTotal = Object.values(qAss).reduce((s, a) => s + (a.score || 0), 0);
                      const qMax = Object.values(qAss).reduce((s, a) => s + (a.max || 0), 0);
                      const qPct = qMax ? (qTotal / qMax) * 100 : 0;
                      const clr = qPct >= 75 ? "#16a34a" : qPct >= 50 ? "#f59e0b" : "#dc2626";

                      return (
                        <div style={{ flex: 1, minWidth: 0, padding: 8, borderRadius: 8, border: "1px solid #f1f5f9", background: "#fff" }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", marginBottom: 8 }}>{label}</div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{qTotal} / {qMax}</div>
                            <div style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800, color: clr, border: "1px solid #e5e7eb" }}>
                              {Math.round(qPct)}%
                            </div>
                          </div>
                          <div style={{ height: 6, borderRadius: 999, background: "#e5e7eb", overflow: "hidden", marginBottom: 8 }}>
                            <div style={{ width: `${Math.max(0, Math.min(100, qPct))}%`, height: "100%", background: clr }} />
                          </div>
                          {Object.entries(qAss).length === 0 ? (
                            <div style={{ color: "#8b8f95", fontSize: 12 }}>No marks</div>
                          ) : (
                            Object.entries(qAss).map(([k, a]) => (
                              <div key={k} style={{ marginBottom: 8 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 600, color: "#111827" }}>
                                  <span>{a.name || k}</span>
                                  <span>
                                    {(a.score === "" || a.score === null || a.score === undefined || a.score === 0) ? "-" : a.score} / {a.max}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      );
                    };

                    if (hasQuarterFormat) {
                      return (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                          {quarterEntries.map(([quarterKey, quarterData]) => (
                            <React.Fragment key={quarterKey}>
                              {renderQuarterBlock(quarterKey, quarterData)}
                            </React.Fragment>
                          ))}
                        </div>
                      );
                    }

                    return (
                      <>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>Total</div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#111827" }}>{total} / {maxTotal}</div>
                          <div style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800, border: "1px solid #e5e7eb", color: statusClr, background: "#ffffff" }}>
                            {Math.round(percentage)}%
                          </div>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: "#e5e7eb", overflow: "hidden", marginBottom: 12 }}>
                          <div style={{ width: `${Math.max(0, Math.min(100, percentage))}%`, height: "100%", background: statusClr }} />
                        </div>
                        {Object.entries(assessments).map(([key, a]) => (
                          <div key={key} style={{ marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 600, color: "#111827" }}>
                              <span>{a.name}</span>
                              <span>
                                {(a.score === "" || a.score === null || a.score === undefined || a.score === 0) ? "-" : a.score} / {a.max}
                              </span>
                            </div>
                          </div>
                        ))}
                        <div style={{ marginTop: 8, textAlign: "left", fontWeight: 700, fontSize: 10, color: statusClr }}>
                          {percentage >= 75 ? "Excellent" : percentage >= 50 ? "Good" : "Needs Improvement"}
                        </div>
                        <div style={{ marginTop: 6, textAlign: "left", fontSize: 10, color: "#64748b" }}>
                          {studentCourseData.teacherName || data.teacherName || "N/A"}
                        </div>
                      </>
                    );
                  })()}
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
