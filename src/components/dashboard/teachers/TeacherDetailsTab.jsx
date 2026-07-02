import React from "react";

const RIGHT_DRAWER_CARD = {
  background: "var(--surface-panel)",
  borderRadius: 12,
  border: "1px solid var(--border-soft)",
  boxShadow: "var(--shadow-soft)",
};

const SECTION_CARD = {
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid var(--border-soft)",
  borderRadius: 16,
  padding: 14,
  boxShadow: "var(--shadow-soft)",
};

/**
 * TeacherDetailsTab
 *
 * The "Details" tab of the teacher detail sidebar — shows the teacher's
 * profile snapshot, contact info, and teaching load. Includes the
 * Activate/Deactivate action that triggers the admin-verify modal.
 */
export default function TeacherDetailsTab({
  selectedTeacher,
  selectedTeacherUser,
  deactivating,
  onToggleActive,
}) {
  if (!selectedTeacher) return null;

  const teacherIdLabel = String(selectedTeacher.teacherId || "").replace(/^[-]+/, "") || "N/A";
  const statusValue = selectedTeacherUser?.isActive === false ? "Inactive" : "Active";
  const statusTone = statusValue === "Active" ? "var(--success)" : "var(--danger)";

  const subjectList = Array.from(new Set(
    (selectedTeacher?.subjectsUnique || [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  ));

  // Build "Grade 7A → math, science" entries from gradesSubjects assignments
  const classMap = new Map();
  (selectedTeacher?.gradesSubjects || []).forEach((gs) => {
    const grade = String(gs?.grade ?? "").trim();
    const section = String(gs?.section ?? "").trim();
    const subject = String(gs?.subject ?? "").trim();
    if (!grade) return;
    const classKey = section ? `Grade ${grade}${section}` : `Grade ${grade}`;
    if (!classMap.has(classKey)) classMap.set(classKey, new Set());
    if (subject) classMap.get(classKey).add(subject);
  });

  const classEntries = Array.from(classMap.entries())
    .map(([label, subjects]) => ({
      label,
      subjects: Array.from(subjects).sort((a, b) => a.localeCompare(b)).join(", "),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  const contactRows = [
    { label: "Email", value: selectedTeacherUser?.email || selectedTeacher.email || "N/A" },
    { label: "Phone", value: selectedTeacherUser?.phone || selectedTeacher.phone || selectedTeacher.phoneNumber || "N/A" },
    { label: "Gender", value: selectedTeacherUser?.gender || selectedTeacher.gender || "N/A" },
  ];

  const summaryStats = [
    { label: "Subjects", value: subjectList.length || 0 },
    { label: "Classes", value: classEntries.length || 0 },
    { label: "Status", value: statusValue },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "0 auto", maxWidth: 380 }}>
      <div style={{ ...RIGHT_DRAWER_CARD, borderRadius: 18, overflow: "hidden", background: "linear-gradient(180deg, #ffffff 0%, #f9fbff 100%)" }}>
        {/* ---- Profile snapshot + activate/deactivate ---- */}
        <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid var(--border-soft)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                Teacher profile
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
                Clear profile, contact, and teaching assignment summary.
              </div>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: statusTone, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: statusTone }} />
              {statusValue}
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 14,
              background: "var(--surface-soft)",
              border: "1px solid var(--border-soft)",
            }}
          >
            <div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.45px" }}>
                Teacher ID
              </div>
              <div style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 900, marginTop: 4 }}>
                {teacherIdLabel}
              </div>
            </div>
            <button
              type="button"
              disabled={deactivating}
              style={{
                background: selectedTeacherUser?.isActive === false ? "var(--success)" : "var(--danger)",
                color: "#fff",
                border: "none",
                padding: "9px 14px",
                borderRadius: "12px",
                fontWeight: 800,
                fontSize: "11px",
                cursor: deactivating ? "not-allowed" : "pointer",
                opacity: deactivating ? 0.7 : 1,
                whiteSpace: "nowrap",
              }}
              onClick={onToggleActive}
            >
              {deactivating
                ? (selectedTeacherUser?.isActive === false ? "Activating..." : "Deactivating...")
                : (selectedTeacherUser?.isActive === false ? "Activate" : "Deactivate")}
            </button>
          </div>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ---- Summary stats ---- */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {summaryStats.map((item) => (
              <div
                key={item.label}
                style={{
                  background: "var(--surface-soft)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: 14,
                  padding: "12px 10px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: item.label === "Status" ? 13 : 22,
                    fontWeight: 900,
                    color: item.label === "Status" ? statusTone : "var(--text-primary)",
                    marginTop: 6,
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* ---- Contact ---- */}
          <div style={SECTION_CARD}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.45px", marginBottom: 10 }}>
              Contact
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {contactRows.map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "86px 1fr",
                    gap: 12,
                    alignItems: "start",
                    paddingBottom: 10,
                    borderBottom: "1px solid color-mix(in srgb, var(--border-soft) 70%, white)",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.35px" }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", wordBreak: "break-word", lineHeight: 1.45 }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ---- Teaching load ---- */}
          <div style={SECTION_CARD}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.45px" }}>
                Teaching load
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#005bc2" }}>
                {classEntries.length} class{classEntries.length === 1 ? "" : "es"}
              </div>
            </div>

            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: classEntries.length ? 12 : 0 }}>
              {subjectList.length ? subjectList.join(", ") : "No assigned subjects yet."}
            </div>

            {classEntries.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {classEntries.map((entry) => (
                  <div
                    key={entry.label}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "96px 1fr",
                      gap: 12,
                      alignItems: "start",
                      padding: "10px 12px",
                      borderRadius: 14,
                      background: "var(--surface-soft)",
                      border: "1px solid var(--border-soft)",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 900, color: "var(--text-primary)" }}>{entry.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                      {entry.subjects || "No subjects recorded"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--text-muted)",
                  padding: "16px 12px",
                  borderRadius: 14,
                  background: "var(--surface-soft)",
                  border: "1px dashed var(--border-soft)",
                }}
              >
                No class assignments yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
