import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { getDatabase, ref, onValue } from "firebase/database";
import app from "../../firebase";
import { FIREBASE_DATABASE_URL } from "../../config.js";
import {
  buildChatSummaryPath,
  buildChatSummaryUpdate,
  normalizeChatSummaryValue,
} from "../../utils/chatRtdb";

const RTDB_BASE = FIREBASE_DATABASE_URL;

// Canonical chat key (sorted so it's the same key for both participants)
const getChatKey = (userA, userB) => [userA, userB].sort().join("_");

/**
 * useTeacherChat
 *
 * Owns all the state and Firebase plumbing for the 1:1 chat popup between
 * the admin and a selected teacher:
 *   - messages list (sorted by timestamp, live via onValue listener)
 *   - input textarea state
 *   - typing indicator (publishes to /Chats/{key}/typing while typing, clears on idle)
 *   - sendMessage flow (push to messages + update chat summaries + bump unreadCount)
 *   - mark-as-seen when popup is open and incoming messages arrive
 *   - auto-scroll ref for the messages container
 *
 * Returns everything <TeacherChatPopup> needs as props, plus `getChatKey` and
 * `clearTyping` for the parent's close/expand handlers.
 *
 * Side-effect note: when an incoming message gets marked as seen, the hook
 * calls `onUnreadCleared(teacher.userId)` (if provided) so the parent's
 * `unreadTeachers` map stays in sync.
 */
export function useTeacherChat({
  adminUserId,
  teacher,
  isPopupOpen,
  onUnreadCleared,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typingUserId, setTypingUserId] = useState(null);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Lazy-init firebase RTDB client; getDatabase() is cheap but no need to
  // call it on every render.
  const dbRef = useRef(null);
  const getDb = () => {
    if (!dbRef.current) dbRef.current = getDatabase(app);
    return dbRef.current;
  };

  // Auto-scroll on new message arrival
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPopupOpen]);

  // ---- Helpers ----
  const ensureChatRoot = useCallback(
    async (chatKey, otherUserId) => {
      if (!adminUserId || !otherUserId) return;
      try {
        const res = await axios
          .get(`${RTDB_BASE}/Chats/${encodeURIComponent(chatKey)}.json`)
          .catch(() => ({ data: null }));
        const existing = res.data || {};
        const participants = {
          ...(existing.participants || {}),
          [adminUserId]: true,
          [otherUserId]: true,
        };
        const patch = { participants };
        if (existing.typing === undefined) patch.typing = null;
        await axios
          .patch(`${RTDB_BASE}/Chats/${encodeURIComponent(chatKey)}.json`, patch)
          .catch(() => {});
      } catch {
        // Ignore — best-effort upsert.
      }
    },
    [adminUserId]
  );

  const markLastMessageSeenForAdmin = useCallback(
    async (chatKey, otherUserId = "") => {
      try {
        await axios
          .patch(
            `${RTDB_BASE}/${buildChatSummaryPath(adminUserId, chatKey)}.json`,
            buildChatSummaryUpdate({
              chatId: chatKey,
              otherUserId,
              unreadCount: 0,
              lastMessageSeen: true,
              lastMessageSeenAt: Date.now(),
            })
          )
          .catch(() => {});
      } catch {
        // Ignore.
      }
    },
    [adminUserId]
  );

  const clearTyping = useCallback((chatKey) => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    axios
      .put(`${RTDB_BASE}/Chats/${encodeURIComponent(chatKey)}/typing.json`, null)
      .catch(() => {});
  }, []);

  const clearTypingForCurrent = useCallback(() => {
    if (!adminUserId || !teacher?.userId) return;
    clearTyping(getChatKey(teacher.userId, adminUserId));
  }, [adminUserId, teacher, clearTyping]);

  // ---- Handlers ----
  const handleTyping = useCallback(
    (text) => {
      if (!adminUserId || !teacher?.userId) return;
      const chatKey = getChatKey(teacher.userId, adminUserId);

      if (!text || !text.trim()) {
        clearTyping(chatKey);
        return;
      }

      axios
        .put(
          `${RTDB_BASE}/Chats/${encodeURIComponent(chatKey)}/typing.json`,
          { userId: adminUserId }
        )
        .catch(() => {});

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        clearTyping(chatKey);
      }, 1800);
    },
    [adminUserId, teacher, clearTyping]
  );

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !teacher) return;

    const chatKey = getChatKey(teacher.userId, adminUserId);
    const timestamp = Date.now();
    const newMessage = {
      senderId: adminUserId,
      receiverId: teacher.userId,
      type: "text",
      text: input,
      imageUrl: null,
      replyTo: null,
      seen: false,
      edited: false,
      deleted: false,
      timeStamp: timestamp,
    };

    try {
      await ensureChatRoot(chatKey, teacher.userId);

      // Push message
      const pushRes = await axios.post(
        `${RTDB_BASE}/Chats/${encodeURIComponent(chatKey)}/messages.json`,
        newMessage
      );
      const generatedId = pushRes.data && pushRes.data.name;

      // Update both participants' chat summaries in parallel
      await Promise.all([
        axios.patch(
          `${RTDB_BASE}/${buildChatSummaryPath(adminUserId, chatKey)}.json`,
          buildChatSummaryUpdate({
            chatId: chatKey,
            otherUserId: teacher.userId,
            unreadCount: 0,
            lastMessageText: newMessage.text || "",
            lastMessageType: newMessage.type || "text",
            lastMessageTime: newMessage.timeStamp,
            lastSenderId: adminUserId,
            lastMessageSeen: false,
            lastMessageSeenAt: null,
          })
        ),
        axios.patch(
          `${RTDB_BASE}/${buildChatSummaryPath(teacher.userId, chatKey)}.json`,
          buildChatSummaryUpdate({
            chatId: chatKey,
            otherUserId: adminUserId,
            lastMessageText: newMessage.text || "",
            lastMessageType: newMessage.type || "text",
            lastMessageTime: newMessage.timeStamp,
            lastSenderId: adminUserId,
            lastMessageSeen: false,
            lastMessageSeenAt: null,
          })
        ),
      ]).catch(() => {});

      // Bump receiver's unreadCount (read-then-write, not atomic but fine here)
      try {
        const summaryRes = await axios.get(
          `${RTDB_BASE}/${buildChatSummaryPath(teacher.userId, chatKey)}.json`
        );
        const summary = normalizeChatSummaryValue(summaryRes.data, {
          chatId: chatKey,
          otherUserId: adminUserId,
        });
        await axios.patch(
          `${RTDB_BASE}/${buildChatSummaryPath(teacher.userId, chatKey)}.json`,
          buildChatSummaryUpdate({
            chatId: chatKey,
            otherUserId: adminUserId,
            unreadCount: Number(summary.unreadCount || 0) + 1,
          })
        );
      } catch {
        await axios.patch(
          `${RTDB_BASE}/${buildChatSummaryPath(teacher.userId, chatKey)}.json`,
          buildChatSummaryUpdate({
            chatId: chatKey,
            otherUserId: adminUserId,
            unreadCount: 1,
          })
        );
      }

      clearTyping(chatKey);

      // Optimistic UI update
      setMessages((prev) => [
        ...prev,
        { messageId: generatedId || `${timestamp}`, ...newMessage, sender: "admin" },
      ]);
      setInput("");
    } catch (err) {
      console.error("Failed to send teacher chat message:", err);
    }
  }, [adminUserId, teacher, input, ensureChatRoot, clearTyping]);

  // ---- Listener: messages (when popup is open) ----
  useEffect(() => {
    if (!isPopupOpen || !teacher || !adminUserId) return undefined;

    const chatKey = getChatKey(teacher.userId, adminUserId);
    const messagesRef = ref(getDb(), `Chats/${chatKey}/messages`);

    const handleSnapshot = async (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.entries(data)
        .map(([id, msg]) => ({ messageId: id, ...msg }))
        .sort((a, b) => a.timeStamp - b.timeStamp);
      setMessages(list);

      // Mark unseen-incoming as seen
      const updates = {};
      Object.entries(data).forEach(([msgId, msg]) => {
        if (msg && msg.receiverId === adminUserId && !msg.seen) {
          updates[`Chats/${chatKey}/messages/${msgId}/seen`] = true;
        }
      });

      if (Object.keys(updates).length > 0) {
        try {
          await axios.patch(`${RTDB_BASE}/.json`, updates);
          if (typeof onUnreadCleared === "function") onUnreadCleared(teacher.userId);
          await markLastMessageSeenForAdmin(chatKey, teacher.userId);
        } catch (err) {
          console.error("Failed to mark teacher chat messages as seen:", err);
        }
      }
    };

    const unsubscribe = onValue(messagesRef, handleSnapshot);
    return () => unsubscribe();
  }, [isPopupOpen, teacher, adminUserId, onUnreadCleared, markLastMessageSeenForAdmin]);

  // ---- Listener: typing indicator (when popup is open) ----
  useEffect(() => {
    if (!isPopupOpen || !teacher || !adminUserId) {
      setTypingUserId(null);
      return undefined;
    }

    const chatKey = getChatKey(teacher.userId, adminUserId);
    const typingRef = ref(getDb(), `Chats/${chatKey}/typing`);

    const unsubscribe = onValue(typingRef, (snapshot) => {
      const data = snapshot.val();
      setTypingUserId(data?.userId || null);
    });

    return () => {
      unsubscribe();
      setTypingUserId(null);
    };
  }, [isPopupOpen, teacher, adminUserId]);

  // Clear typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    messages,
    input,
    setInput,
    typingUserId,
    messagesEndRef,
    handleTyping,
    sendMessage,
    clearTypingForCurrent,
    getChatKey,
  };
}
