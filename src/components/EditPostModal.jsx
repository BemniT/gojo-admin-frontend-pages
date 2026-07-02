import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

export default function EditPostModal({ isOpen, initialText, onConfirm, onCancel, isSubmitting }) {
  const [text, setText] = useState(initialText || "");
  const textareaRef = useRef(null);
  const cancelBtnRef = useRef(null);
  const saveBtnRef = useRef(null);

  // Focus textarea on open
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Reset text when modal opens
  useEffect(() => {
    if (isOpen) setText(initialText || "");
  }, [isOpen, initialText]);

  // Keyboard accessibility: Escape closes, Tab order
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Tab") {
        // Trap focus: textarea -> Cancel -> Save -> textarea
        const focusables = [textareaRef.current, cancelBtnRef.current, saveBtnRef.current].filter(Boolean);
        const idx = focusables.indexOf(document.activeElement);
        if (e.shiftKey) {
          if (idx === 0) {
            e.preventDefault();
            focusables[focusables.length - 1].focus();
          }
        } else {
          if (idx === focusables.length - 1) {
            e.preventDefault();
            focusables[0].focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        background: "rgba(15,23,42,0.18)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(6px)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          minWidth: 340,
          maxWidth: 420,
          width: "100%",
          padding: "28px 28px 22px 28px",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "#0f172a" }}>Edit Post</h2>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          style={{
            width: "100%",
            minHeight: 120,
            fontSize: 16,
            padding: "12px 10px",
            borderRadius: 10,
            border: "1px solid #B5D2F8",
            resize: "vertical",
            outline: "none",
            color: "#0f172a",
            background: "#f8fafc",
            fontWeight: 500,
          }}
          aria-label="Edit post text"
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            style={{
              minWidth: 80,
              padding: "8px 0",
              borderRadius: 8,
              border: "1px solid #D7E7FB",
              background: "#f8fafc",
              color: "#334155",
              fontWeight: 700,
              fontSize: 15,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.7 : 1,
            }}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            ref={saveBtnRef}
            type="button"
            onClick={() => onConfirm(text)}
            style={{
              minWidth: 80,
              padding: "8px 0",
              borderRadius: 8,
              border: "1px solid #007AFB",
              background: isSubmitting ? "#B5D2F8" : "#007AFB",
              color: "#fff",
              fontWeight: 800,
              fontSize: 15,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.7 : 1,
            }}
            disabled={isSubmitting || !text.trim()}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
