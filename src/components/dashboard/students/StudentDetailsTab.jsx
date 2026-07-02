import React from "react";

const SIDEBAR_SECTION_CARD = {
  background: "var(--surface-panel)",
  border: "1px solid var(--border-soft)",
  borderRadius: 16,
  boxShadow: "var(--shadow-soft)",
};

/**
 * StudentDetailsTab
 *
 * The "Details" tab of the Students page right-sidebar. Renders profile
 * summary + activate/deactivate + edit-profile flow + the admin-credential
 * confirmation modal that gates the toggle-active action.
 *
 * The page owns the state and all handlers; this component is pure
 * presentation. The credential modal is kept inline here (not promoted to
 * the shared ConfirmDialog) because its UI is specific to this flow.
 */
export default function StudentDetailsTab({
  selectedStudent,
  // toggle active
  togglingActive,
  openConfirmModal,
  showConfirmModal,
  closeConfirmModal,
  confirmToggle,
  confirmAdminUsername,
  setConfirmAdminUsername,
  confirmAdminPassword,
  setConfirmAdminPassword,
  // edit profile
  editingProfile,
  savingProfile,
  startEditProfile,
  cancelEditProfile,
  saveProfileEdits,
  editForm,
  setEditForm,
  // data
  studentDetailRows,
  currentAcademicYear,
}) {
  return (
    <div style={{ ...SIDEBAR_SECTION_CARD, padding: 14, margin: "0 auto", maxWidth: 380 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Student profile</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>Cleaner profile and enrollment snapshot.</div>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: selectedStudent?.isActive ? "var(--success)" : "var(--danger)", fontSize: 11, fontWeight: 900 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: selectedStudent?.isActive ? "var(--success)" : "var(--danger)" }} />
            {selectedStudent?.isActive ? "Active" : "Inactive"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={openConfirmModal}
            disabled={togglingActive}
            style={{
              background: selectedStudent?.isActive ? "#ff4d4f" : "var(--accent-strong)",
              border: "none",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 11,
            }}
          >
            {togglingActive ? (selectedStudent?.isActive ? "Deactivating..." : "Activating...") : (selectedStudent?.isActive ? "Deactivate" : "Activate")}
          </button>
          {!editingProfile ? (
            <button
              onClick={startEditProfile}
              style={{
                background: "var(--surface-panel)",
                border: "1px solid var(--border-strong)",
                color: "var(--accent-strong)",
                padding: "8px 12px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 11,
              }}
            >
              Edit Profile
            </button>
          ) : (
            <>
              <button
                onClick={saveProfileEdits}
                disabled={savingProfile}
                style={{
                  background: "var(--accent-strong)",
                  border: "none",
                  color: "#fff",
                  padding: "8px 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                {savingProfile ? "Saving..." : "Save"}
              </button>
              <button
                onClick={cancelEditProfile}
                style={{
                  background: "var(--surface-panel)",
                  border: "1px solid var(--border-soft)",
                  color: "var(--text-secondary)",
                  padding: "8px 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {[
            { label: "Grade", value: selectedStudent?.grade || "-" },
            { label: "Section", value: selectedStudent?.section || "-" },
            { label: "Parents", value: Array.isArray(selectedStudent?.parents) ? selectedStudent.parents.length : 0 },
          ].map((item) => (
            <div key={item.label} style={{ background: "var(--surface-soft)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-primary)", marginTop: 6 }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: "12px 14px", borderRadius: 14, background: "var(--surface-soft)", border: "1px solid var(--border-soft)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.45px" }}>Student ID</div>
          <div style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 900, marginTop: 4 }}>{selectedStudent?.studentId || "N/A"}</div>
        </div>

        {showConfirmModal && (
          <ToggleActiveConfirmModal
            isActive={selectedStudent?.isActive}
            togglingActive={togglingActive}
            username={confirmAdminUsername}
            setUsername={setConfirmAdminUsername}
            password={confirmAdminPassword}
            setPassword={setConfirmAdminPassword}
            onConfirm={confirmToggle}
            onCancel={closeConfirmModal}
          />
        )}

        <div style={{ ...SIDEBAR_SECTION_CARD, padding: 14, boxShadow: "none" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.45px", marginBottom: 10 }}>Profile details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {studentDetailRows.map((row) => {
              const value = selectedStudent?.[row.key];
              return (
                <div key={row.key} style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 12, alignItems: "start", paddingBottom: 10, borderBottom: "1px solid color-mix(in srgb, var(--border-soft) 70%, white)" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.35px", color: "var(--text-muted)", textTransform: "uppercase" }}>{row.label}</div>
                  {!editingProfile ? (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color:
                          row.label === "Gender"
                            ? String(value || "").toLowerCase() === "male"
                              ? "var(--success)"
                              : String(value || "").toLowerCase() === "female"
                              ? "var(--accent-strong)"
                              : "var(--text-primary)"
                            : "var(--text-primary)",
                        wordBreak: "break-word",
                        lineHeight: 1.45,
                      }}
                    >
                      {value || <span style={{ color: "var(--text-muted)" }}>N/A</span>}
                    </div>
                  ) : row.key === "gender" ? (
                    <select
                      value={typeof editForm[row.key] !== "undefined" ? editForm[row.key] : value || ""}
                      onChange={(e) => setEditForm((p) => ({ ...(p || {}), [row.key]: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--input-border)", fontSize: 12, background: "var(--input-bg)", color: "var(--text-primary)" }}
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  ) : (
                    <input
                      value={typeof editForm[row.key] !== "undefined" ? editForm[row.key] : value || ""}
                      onChange={(e) => setEditForm((p) => ({ ...(p || {}), [row.key]: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--input-border)", fontSize: 12, background: "var(--input-bg)", color: "var(--text-primary)" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ ...SIDEBAR_SECTION_CARD, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.4px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>Enrollment summary</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              `Grade ${selectedStudent?.grade || "-"}`,
              `Section ${selectedStudent?.section || "-"}`,
              `Year ${String(selectedStudent?.academicYear || currentAcademicYear || "-").replace("_", "/")}`,
              `Status ${(selectedStudent?.status || "Active").toString()}`,
              `Parents ${Array.isArray(selectedStudent?.parents) ? selectedStudent.parents.length : 0}`,
            ].map((item, index) => (
              <span
                key={`${item}_${index}`}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--border-soft)",
                  background: "color-mix(in srgb, var(--surface-panel) 78%, white)",
                  color: "var(--text-secondary)",
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1.2,
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleActiveConfirmModal({
  isActive,
  togglingActive,
  username,
  setUsername,
  password,
  setPassword,
  onConfirm,
  onCancel,
}) {
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)", zIndex: 1200 }}>
      <div style={{ width: 420, maxWidth: "92%", background: "var(--surface-panel)", padding: 18, borderRadius: 10, boxShadow: "var(--shadow-soft)", border: "1px solid var(--border-soft)" }}>
        <h3 style={{ margin: 0, marginBottom: 8, fontSize: 14 }}>
          {isActive ? "Confirm Deactivation" : "Confirm Activation"}
        </h3>
        <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>
          {isActive
            ? "You are about to deactivate this student and unassign their subjects. Enter admin credentials to confirm."
            : "You are about to activate this student. Enter admin credentials to confirm."}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Admin username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 6, borderRadius: 6, border: "1px solid var(--border-soft)" }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Admin password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 6, borderRadius: 6, border: "1px solid var(--border-soft)" }}
            />
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ background: "var(--surface-panel)", border: "1px solid var(--border-soft)", color: "var(--text-secondary)", padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={togglingActive}
            style={{ background: "var(--accent-strong)", border: "none", color: "#fff", padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}
          >
            {togglingActive ? "Processing..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
