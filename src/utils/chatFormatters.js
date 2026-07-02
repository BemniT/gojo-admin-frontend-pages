/**
 * Chat timestamp formatters — shared by all chat popups and threads
 * (AllChat, TeacherChatPopup, Parents, Students, etc.).
 *
 * Extracted from inline implementations that were copy-pasted across pages.
 * Single source of truth means consistent "Yesterday / 3 days ago / 10:42 AM"
 * rendering everywhere.
 */

/** "10:42 AM" style time-of-day. Returns empty string for falsy input. */
export function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(Number(timestamp)).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "Today" / "Yesterday" / "3 days ago" / "12/3/2025" style date label.
 * Returns empty string for falsy input.
 */
export function formatDateLabel(timestamp) {
  if (!timestamp) return "";
  const msgDate = new Date(Number(timestamp));
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMsgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());
  const diffMs = startOfToday - startOfMsgDay;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return msgDate.toLocaleDateString();
}
