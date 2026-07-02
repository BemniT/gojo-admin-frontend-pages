import React from "react";
import { FaCheck, FaPaperPlane } from "react-icons/fa";
import { formatDateLabel, formatTime } from "../../../utils/chatFormatters";

/**
 * TeacherChatPopup
 *
 * Floating bottom-right chat overlay for the currently selected teacher
 * on the Teachers page. Kept as a presentational component for now —
 * Session B will introduce a `useTeacherChat` hook that bundles the
 * messages / firebase listeners / sendMessage logic and replaces the
 * long prop list below.
 *
 * Props:
 *   isOpen, teacher              — visibility + which teacher we're chatting with
 *   adminUserId                  — current admin's userId (used to flip message alignment)
 *   messages                     — list of message objects
 *   input, setInput              — the textarea state
 *   typingUserId                 — set when the other side is typing (any non-admin id)
 *   messagesEndRef               — ref for auto-scrolling on new messages
 *   onTyping(text)               — called on input changes (debounced typing indicator publish)
 *   onSend()                     — called on Enter/send
 *   onClose()                    — close the popup
 *   onExpand()                   — open full /all-chat view instead
 *   onClearTyping()              — clear typing indicator (used on close/expand)
 */
export default function TeacherChatPopup({
  isOpen,
  teacher,
  adminUserId,
  messages,
  input,
  setInput,
  typingUserId,
  messagesEndRef,
  onTyping,
  onSend,
  onClose,
  onExpand,
  onClearTyping,
}) {
  if (!isOpen || !teacher) return null;

  const handleClose = () => {
    onClearTyping?.();
    onClose?.();
  };

  const handleExpand = () => {
    onClearTyping?.();
    onExpand?.();
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        width: "360px",
        height: "480px",
        background: "var(--surface-panel)",
        borderRadius: "16px",
        boxShadow: "var(--shadow-panel)",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px",
          borderBottom: "1px solid var(--border-soft)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--surface-muted)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <strong>{teacher.name}</strong>
          {typingUserId && String(typingUserId) !== String(adminUserId) && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Typing...</span>
          )}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={handleExpand}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px" }}
            title="Open full chat"
            aria-label="Open full chat"
          >
            ⤢
          </button>
          <button
            type="button"
            onClick={handleClose}
            style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer" }}
            title="Close"
            aria-label="Close chat"
          >
            ×
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          padding: "12px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          background: "var(--surface-muted)",
        }}
      >
        {messages.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-muted)" }}>
            Start chatting with {teacher.name}
          </p>
        ) : (
          messages.map((m) => {
            const isAdmin = String(m.senderId) === String(adminUserId) || m.sender === "admin";
            return (
              <div
                key={m.messageId || m.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isAdmin ? "flex-end" : "flex-start",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    maxWidth: "70%",
                    background: isAdmin ? "var(--accent)" : "var(--surface-panel)",
                    color: isAdmin ? "#fff" : "var(--text-primary)",
                    padding: "10px 14px",
                    borderRadius: 18,
                    borderTopRightRadius: isAdmin ? 0 : 18,
                    borderTopLeftRadius: isAdmin ? 18 : 0,
                    boxShadow: "var(--shadow-soft)",
                    wordBreak: "break-word",
                    cursor: "default",
                    position: "relative",
                  }}
                >
                  {m.text} {m.edited && <small style={{ fontSize: 10 }}> (edited)</small>}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 6,
                      marginTop: 6,
                      fontSize: 11,
                      color: isAdmin ? "#fff" : "var(--text-muted)",
                    }}
                  >
                    <span style={{ marginRight: 6, fontSize: 11, opacity: 0.9 }}>
                      {formatDateLabel(m.timeStamp)}
                    </span>
                    <span>{formatTime(m.timeStamp)}</span>
                    {isAdmin && !m.deleted && (
                      <span style={{ display: "flex", gap: 0, alignItems: "center" }}>
                        <FaCheck size={10} color="#fff" style={{ opacity: 0.85, marginLeft: 4 }} />
                        {m.seen && (
                          <FaCheck size={10} color="#f3f7f8" style={{ marginLeft: 2, opacity: 0.95 }} />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: "10px",
          borderTop: "1px solid #eee",
          display: "flex",
          gap: "8px",
          background: "#fff",
        }}
      >
        <input
          value={input}
          onChange={(e) => {
            const value = e.target.value;
            setInput(value);
            onTyping?.(value);
          }}
          placeholder="Type a message..."
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "25px",
            border: "1px solid var(--input-border)",
            outline: "none",
            background: "var(--input-bg)",
            color: "var(--text-primary)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend?.();
          }}
        />
        <button
          type="button"
          onClick={() => onSend?.()}
          style={{
            width: 45,
            height: 45,
            borderRadius: "50%",
            background: "var(--accent)",
            border: "none",
            color: "#fff",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            cursor: "pointer",
          }}
          aria-label="Send message"
        >
          <FaPaperPlane />
        </button>
      </div>
    </div>
  );
}
