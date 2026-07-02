import React, { useEffect } from "react";

const TONE_STYLES = {
  success: { bg: "#10b981", color: "#fff", icon: "✓" },
  error: { bg: "#dc2626", color: "#fff", icon: "✕" },
  info: { bg: "#2563eb", color: "#fff", icon: "ℹ" },
};

/**
 * Toast — minimal auto-dismissing notification.
 * Props:
 *   toast: { message: string, tone?: "success"|"error"|"info" } | null
 *   onDismiss: () => void
 *   durationMs?: number (default 2800)
 */
export default function Toast({ toast, onDismiss, durationMs = 2800 }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [toast, onDismiss, durationMs]);

  if (!toast) return null;
  const style = TONE_STYLES[toast.tone] || TONE_STYLES.success;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: style.bg,
        color: style.color,
        padding: "12px 18px",
        borderRadius: 999,
        boxShadow: "0 12px 32px rgba(15, 23, 42, 0.20)",
        fontSize: 13,
        fontWeight: 700,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 240,
        justifyContent: "center",
        animation: "toastSlideUp 220ms ease-out",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.22)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        {style.icon}
      </span>
      <span>{toast.message}</span>
      <style>{`
        @keyframes toastSlideUp {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}
