import React from "react";
import { FaTimes } from "react-icons/fa";

/**
 * Three small chat overlay components extracted from AllChat.jsx:
 *   - ChatImagePreview: fullscreen image lightbox
 *   - ChatImageActionMenu: bottom-sheet menu on long-press / right-click on
 *     an image message (download + optional delete for own images)
 *   - ChatTextActionMenu: bottom-sheet menu on long-press / right-click on
 *     a text message (edit + delete)
 *
 * All three are purely presentational; the page owns the open/close state.
 */

export function ChatImagePreview({ src, onClose }) {
  if (!src) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.85)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          width: 36,
          height: 36,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.35)",
          background: "rgba(15,23,42,0.5)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
        aria-label="Close image"
      >
        <FaTimes />
      </button>
      <img
        src={src}
        alt="Preview"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: "92vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 14 }}
      />
    </div>
  );
}

const SHEET_BACKDROP = {
  position: "fixed",
  inset: 0,
  background: "rgba(2,6,23,0.45)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 18,
};

const SHEET_CARD = {
  width: "min(420px, 96vw)",
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  boxShadow: "0 20px 45px rgba(2,6,23,0.3)",
  overflow: "hidden",
};

const SHEET_BUTTON = {
  width: "100%",
  border: "none",
  background: "#fff",
  borderBottom: "1px solid #e2e8f0",
  padding: "14px 16px",
  textAlign: "left",
  fontWeight: 700,
  cursor: "pointer",
};

const SHEET_CANCEL_BUTTON = {
  ...SHEET_BUTTON,
  borderBottom: "none",
  color: "#475569",
};

export function ChatImageActionMenu({ open, message, onDownload, onDelete, onClose }) {
  if (!open) return null;

  return (
    <div onClick={onClose} style={{ ...SHEET_BACKDROP, zIndex: 1250 }}>
      <div onClick={(event) => event.stopPropagation()} style={SHEET_CARD}>
        <button
          onClick={async () => {
            await onDownload(message);
            onClose();
          }}
          style={{ ...SHEET_BUTTON, color: "#0f172a" }}
        >
          Download image
        </button>
        {message?.isAdmin ? (
          <button
            onClick={() => {
              if (message?.id) onDelete(message.id);
              onClose();
            }}
            style={{ ...SHEET_BUTTON, color: "#b91c1c" }}
          >
            Delete image
          </button>
        ) : null}
        <button onClick={onClose} style={SHEET_CANCEL_BUTTON}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ChatTextActionMenu({ open, message, onEdit, onDelete, onClose }) {
  if (!open) return null;

  return (
    <div onClick={onClose} style={{ ...SHEET_BACKDROP, zIndex: 1251 }}>
      <div onClick={(event) => event.stopPropagation()} style={SHEET_CARD}>
        <button
          onClick={() => {
            if (message?.id) onEdit(message.id);
            onClose();
          }}
          style={{ ...SHEET_BUTTON, color: "#0f172a" }}
        >
          Edit message
        </button>
        <button
          onClick={() => {
            if (message?.id) onDelete(message.id);
            onClose();
          }}
          style={{ ...SHEET_BUTTON, color: "#b91c1c" }}
        >
          Delete message
        </button>
        <button onClick={onClose} style={SHEET_CANCEL_BUTTON}>
          Cancel
        </button>
      </div>
    </div>
  );
}
