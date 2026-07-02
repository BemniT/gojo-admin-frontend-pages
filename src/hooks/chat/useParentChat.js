import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { getDatabase, ref as rdbRef, onValue } from "firebase/database";
import {
  buildChatSummaryPath,
  buildChatSummaryUpdate,
  normalizeChatSummaryValue,
} from "../../utils/chatRtdb";

const getChatId = (a, b) => [a, b].sort().join("_");

/**
 * useParentChat
 *
 * Owns the Parents page's chat data layer:
 *   - chat popup state (open flag, messages list, input text, typing user)
 *   - Firebase RTDB listeners for messages + typing indicator
 *   - mark-as-seen flow for incoming messages
 *   - typing-debounce write + cleanup on close
 *   - sendMessage handler (push message, patch summaries, increment receiver
 *     unread)
 *   - mark-seen-on-parent-change effect
 *
 * Page concerns kept out: `admin`, `selectedParent`, `dbUrl`,
 * `readSchoolNodeApi`, and `patchSchoolNodeApi` are passed in so the hook
 * doesn't reach into Parents page closures.
 */
export default function useParentChat({
  admin,
  selectedParent,
  dbUrl,
  readSchoolNodeApi,
  patchSchoolNodeApi,
}) {
  const [parentChatOpen, setParentChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessageText, setNewMessageText] = useState("");
  const [typingUserId, setTypingUserId] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const chatId =
    admin?.userId && selectedParent?.userId ? getChatId(admin.userId, selectedParent.userId) : null;

  // ---------------- MARK LAST MESSAGE SEEN ----------------
  const maybeMarkLastMessageSeenForAdmin = async (chatKey, otherUserId = "") => {
    try {
      const summaryNodePath = buildChatSummaryPath(admin.userId, chatKey);
      const summaryData = await readSchoolNodeApi(summaryNodePath, null);
      const summary = normalizeChatSummaryValue(summaryData, {
        chatId: chatKey,
        otherUserId,
      });
      const shouldMarkSeen =
        Boolean(summary.chatId) &&
        summary.lastSenderId &&
        String(summary.lastSenderId) !== String(admin.userId) &&
        !summary.lastMessageSeen;

      await patchSchoolNodeApi(
        summaryNodePath,
        buildChatSummaryUpdate({
          chatId: chatKey,
          otherUserId,
          unreadCount: 0,
          ...(shouldMarkSeen
            ? {
                lastMessageSeen: true,
                lastMessageSeenAt: Date.now(),
              }
            : {}),
        })
      ).catch(() => {});
    } catch {
      // ignore
    }
  };

  // ---------------- MESSAGES LISTENER ----------------
  useEffect(() => {
    if (!chatId || !parentChatOpen) {
      setMessages([]);
      return undefined;
    }
    const db = getDatabase();
    const messagesRef = rdbRef(db, `Chats/${chatId}/messages`);
    const unsubscribe = onValue(messagesRef, async (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.entries(data)
        .map(([id, msg]) => ({ messageId: id, ...msg }))
        .sort((a, b) => a.timeStamp - b.timeStamp);
      setMessages(list);

      // Mark unseen messages addressed to admin as seen
      const updates = {};
      Object.entries(data).forEach(([msgId, msg]) => {
        if (msg && msg.receiverId === admin.userId && !msg.seen) {
          updates[`${msgId}/seen`] = true;
        }
      });

      if (Object.keys(updates).length > 0) {
        try {
          await axios.patch(`${dbUrl}/Chats/${chatId}/messages.json`, updates).catch(() => {});
        } catch (err) {
          console.warn("Failed to patch parent seen updates", err);
        }
      }

      maybeMarkLastMessageSeenForAdmin(chatId, selectedParent?.userId).catch(() => {});

      if (Object.keys(updates).length > 0) {
        setMessages((prev) => prev.map((m) => (m.receiverId === admin.userId ? { ...m, seen: true } : m)));
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUrl, admin?.userId, chatId, parentChatOpen, selectedParent?.userId]);

  // ---------------- TYPING LISTENER ----------------
  useEffect(() => {
    if (!chatId || !parentChatOpen) {
      setTypingUserId(null);
      return undefined;
    }
    const db = getDatabase();
    const typingRef = rdbRef(db, `Chats/${chatId}/typing`);
    const unsub = onValue(typingRef, (snapshot) => {
      const t = snapshot.val();
      setTypingUserId(t && t.userId ? t.userId : null);
    });
    return () => unsub();
  }, [chatId, parentChatOpen]);

  // ---------------- TYPING HANDLER ----------------
  const handleTyping = (text) => {
    if (!admin?.userId || !selectedParent?.userId) return;
    const chatKey = getChatId(admin.userId, selectedParent.userId);

    if (!text || !text.trim()) {
      axios.put(`${dbUrl}/Chats/${chatKey}/typing.json`, null).catch(() => {});
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      return;
    }

    axios.put(`${dbUrl}/Chats/${chatKey}/typing.json`, { userId: admin.userId }).catch(() => {});

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      axios.put(`${dbUrl}/Chats/${chatKey}/typing.json`, null).catch(() => {});
      typingTimeoutRef.current = null;
    }, 1800);
  };

  // ---------------- TYPING CLEANUP ----------------
  useEffect(() => {
    if (!parentChatOpen && selectedParent && admin?.userId) {
      const chatKey = getChatId(admin.userId, selectedParent.userId);
      axios.put(`${dbUrl}/Chats/${chatKey}/typing.json`, null).catch(() => {});
    }
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [parentChatOpen, selectedParent, admin, dbUrl]);

  // ---------------- AUTO-SCROLL ----------------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, parentChatOpen]);

  // ---------------- INIT CHAT IF MISSING ----------------
  const initChatIfMissing = async () => {
    if (!chatId) return;
    await axios
      .patch(`${dbUrl}/Chats/${chatId}.json`, {
        participants: { [admin.userId]: true, [selectedParent.userId]: true },
        typing: null,
      })
      .catch(() => {});
  };

  // ---------------- SEND MESSAGE ----------------
  const sendMessage = async (text) => {
    if (!text || !text.trim() || !selectedParent) return;
    if (!admin?.userId || !selectedParent?.userId) return;
    const id = getChatId(admin.userId, selectedParent.userId);
    await initChatIfMissing();

    const newMsg = {
      senderId: admin.userId,
      receiverId: selectedParent.userId,
      type: "text",
      text,
      imageUrl: null,
      replyTo: null,
      seen: false,
      edited: false,
      deleted: false,
      timeStamp: Date.now(),
    };

    try {
      await axios.post(`${dbUrl}/Chats/${id}/messages.json`, newMsg).catch(() => ({ data: null }));

      await axios
        .patch(`${dbUrl}/Chats/${id}.json`, {
          participants: { [admin.userId]: true, [selectedParent.userId]: true },
          typing: null,
        })
        .catch(() => {});

      await Promise.all([
        axios.patch(
          `${dbUrl}/${buildChatSummaryPath(admin.userId, id)}.json`,
          buildChatSummaryUpdate({
            chatId: id,
            otherUserId: selectedParent.userId,
            unreadCount: 0,
            lastMessageText: newMsg.text || "",
            lastMessageType: newMsg.type || "text",
            lastMessageTime: newMsg.timeStamp,
            lastSenderId: admin.userId,
            lastMessageSeen: false,
            lastMessageSeenAt: null,
          })
        ),
        axios.patch(
          `${dbUrl}/${buildChatSummaryPath(selectedParent.userId, id)}.json`,
          buildChatSummaryUpdate({
            chatId: id,
            otherUserId: admin.userId,
            lastMessageText: newMsg.text || "",
            lastMessageType: newMsg.type || "text",
            lastMessageTime: newMsg.timeStamp,
            lastSenderId: admin.userId,
            lastMessageSeen: false,
            lastMessageSeenAt: null,
          })
        ),
      ]).catch(() => {});

      // increment unread for receiver summary
      try {
        const summaryRes = await axios.get(`${dbUrl}/${buildChatSummaryPath(selectedParent.userId, id)}.json`);
        const summary = normalizeChatSummaryValue(summaryRes.data, {
          chatId: id,
          otherUserId: admin.userId,
        });
        await axios
          .patch(
            `${dbUrl}/${buildChatSummaryPath(selectedParent.userId, id)}.json`,
            buildChatSummaryUpdate({
              chatId: id,
              otherUserId: admin.userId,
              unreadCount: Number(summary.unreadCount || 0) + 1,
            })
          )
          .catch(() => {});
      } catch {
        await axios
          .patch(
            `${dbUrl}/${buildChatSummaryPath(selectedParent.userId, id)}.json`,
            buildChatSummaryUpdate({
              chatId: id,
              otherUserId: admin.userId,
              unreadCount: 1,
            })
          )
          .catch(() => {});
      }

      setNewMessageText("");
      axios.put(`${dbUrl}/Chats/${id}/typing.json`, null).catch(() => {});
    } catch (err) {
      console.error("Failed to send parent message:", err);
    }
  };

  // ---------------- MARK SEEN ON PARENT CHANGE ----------------
  useEffect(() => {
    if (!selectedParent || !admin?.userId) return;
    const id = getChatId(admin.userId, selectedParent.userId);
    maybeMarkLastMessageSeenForAdmin(id, selectedParent.userId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUrl, selectedParent, admin]);

  return {
    parentChatOpen,
    setParentChatOpen,
    messages,
    setMessages,
    newMessageText,
    setNewMessageText,
    typingUserId,
    messagesEndRef,
    handleTyping,
    sendMessage,
    chatId,
    maybeMarkLastMessageSeenForAdmin,
  };
}
