import React from "react";

/**
 * AdminVerifyModal
 *
 * Re-authentication gate for sensitive actions (currently used by the
 * Teachers page when toggling a teacher's active/inactive status).
 *
 * Props:
 *   isOpen           — whether to render the modal
 *   pendingAction    — { newActive: boolean, ...whatever else } | null
 *   username, setUsername
 *   password, setPassword
 *   error
 *   verifying        — when true, shows "Verifying..." on the confirm button
 *   onCancel         — called when user clicks Cancel
 *   onConfirm        — called when user clicks Confirm (handler reads username/password from state)
 */
export default function AdminVerifyModal({
  isOpen,
  pendingAction,
  username,
  setUsername,
  password,
  setPassword,
  error,
  verifying,
  onCancel,
  onConfirm,
}) {
  if (!isOpen) return null;

  const isActivating = Boolean(pendingAction?.newActive);
  const title = isActivating ? "Confirm Activation" : "Confirm Deactivation";
  const body = isActivating
    ? "You are about to activate this teacher. Please enter admin credentials to confirm."
    : "You are about to deactivate this teacher and unassign their subjects. Enter admin credentials to confirm.";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: "92%",
          background: "var(--surface-panel)",
          borderRadius: 12,
          padding: 18,
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
          border: "1px solid var(--border-soft)",
        }}
      >
        <h3 style={{ margin: 0, marginBottom: 8 }}>{title}</h3>
        <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>{body}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            autoFocus
            placeholder="Admin username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-soft)",
              outline: "none",
            }}
          />
          <input
            placeholder="Admin password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !verifying) onConfirm();
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-soft)",
              outline: "none",
            }}
          />
          {error ? (
            <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>
          ) : null}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "transparent",
                border: "1px solid var(--border-soft)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={verifying}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                cursor: verifying ? "not-allowed" : "pointer",
                opacity: verifying ? 0.7 : 1,
              }}
            >
              {verifying ? "Verifying..." : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
