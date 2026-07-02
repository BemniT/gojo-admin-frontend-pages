import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { BACKEND_BASE, FIREBASE_DATABASE_URL } from "../../config.js";
import {
  buildOwnerChatSummariesPath,
  normalizeChatSummaryValue,
  buildChatSummaryPath,
  buildChatSummaryUpdate,
} from "../../utils/chatRtdb.js";

const DB_URL = FIREBASE_DATABASE_URL;

function resolveOtherUserId(summary = {}, currentUserId = "") {
  const explicit = String(summary?.otherUserId || "").trim();
  if (explicit) return explicit;
  const cur = String(currentUserId || "").trim();
  if (!cur) return "";
  return String(summary?.chatId || "").split("_").map((v) => String(v || "").trim()).find((id) => id && id !== cur) || "";
}

function inferContactType(role = "") {
  const r = String(role || "").trim().toLowerCase();
  if (r === "teacher" || r === "teachers") return "teacher";
  if (r === "student" || r === "students") return "student";
  if (r === "parent" || r === "parents") return "parent";
  return "management";
}

export function useConversations({ adminUserId, schoolScopeCode }) {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState([]);

  const dbRoot = schoolScopeCode
    ? `${DB_URL}/Platform1/Schools/${encodeURIComponent(schoolScopeCode)}`
    : DB_URL;

  const fetchConversations = useCallback(async () => {
    if (!adminUserId) { setConversations([]); return; }
    try {
      const path = buildOwnerChatSummariesPath(adminUserId);
      const res = await axios.get(`${dbRoot}/${path}.json`, { timeout: 4000 });
      const data = res.data && typeof res.data === "object" ? res.data : {};

      const entries = Object.entries(data)
        .map(([chatId, val]) => normalizeChatSummaryValue(val, { chatId }))
        .filter((s) => String(s?.chatId || "").trim());

      const resolved = entries
        .map((summary) => {
          const otherId = resolveOtherUserId(summary, adminUserId);
          if (!otherId) return null;
          return {
            chatId: summary.chatId,
            contact: { id: otherId, userId: otherId, type: inferContactType(summary.otherUserRole) },
            displayName: summary.otherUserName || otherId,
            profile: summary.otherUserProfile || "/default-profile.png",
            lastMessageText: summary.lastMessageText || "",
            lastMessageTime: Number(summary.lastMessageTime || 0),
            unreadForMe: Number(summary.unreadCount || 0),
            lastSenderId: summary.lastSenderId || "",
            lastMessageSeen: Boolean(summary.lastMessageSeen),
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));

      setConversations(resolved);
    } catch {
      setConversations([]);
    }
  }, [adminUserId, dbRoot]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleOpenConversation = useCallback(async (conversation) => {
    if (!conversation) return;
    const contact = conversation.contact || {};
    navigate("/all-chat", { state: { contact, chatId: conversation.chatId, tab: contact.type || "teacher", userType: contact.type || "teacher" } });
    setConversations((prev) =>
      prev.map((c) => c.chatId === conversation.chatId ? { ...c, unreadForMe: 0 } : c)
    );
    try {
      await axios.patch(
        `${dbRoot}/${buildChatSummaryPath(adminUserId, conversation.chatId)}.json`,
        buildChatSummaryUpdate({ chatId: conversation.chatId, otherUserId: contact.userId || contact.id || "", unreadCount: 0 })
      );
    } catch {}
  }, [navigate, adminUserId, dbRoot]);

  const totalUnreadMessages = conversations.reduce(
    (sum, c) => sum + (Number(c.unreadForMe) || 0), 0
  );

  return { conversations, unreadMessages, fetchConversations, handleOpenConversation, totalUnreadMessages };
}