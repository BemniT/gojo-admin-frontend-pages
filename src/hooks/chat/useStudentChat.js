import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { getDatabase, ref, onValue } from "firebase/database";
import app from "../../firebase";
import {
  buildChatKeyCandidates,
  buildChatSummaryPath,
  buildChatSummaryUpdate,
  buildOwnerChatSummariesPath,
  normalizeChatSummaryValue,
  uniqueNonEmptyValues,
} from "../../utils/chatRtdb";
import { fetchCachedJson } from "../../utils/rtdbCache";

const CHAT_INDEX_CACHE_TTL_MS = 60 * 1000;

/**
 * useStudentChat
 *
 * Owns the Students page's chat data layer:
 *   - chat-popup state (open flag, messages, two text inputs, unreadMap)
 *   - chat-key resolution (existing summary → chat index → fallback construction)
 *   - sendPopupMessage / sendMessage handlers (push message + patch summaries +
 *     increment receiver unread)
 *   - unread-status fetch effect (populates unreadMap from owner summaries)
 *   - mark-as-seen effect (Firebase RTDB listener that flips seen + clears
 *     unreadMap for the selected student while the popup is open)
 *
 * Page concerns kept out: `selectedStudent`, `students`, admin identity,
 * `dbUrl`, and the Firebase `dbRT` instance are passed in.
 */
export default function useStudentChat({
  selectedStudent,
  students,
  adminUserId,
  adminId,
  dbUrl,
}) {
  const dbRT = getDatabase(app);

  const [studentChatOpen, setStudentChatOpen] = useState(false);
  const [popupMessages, setPopupMessages] = useState([]);
  const [popupInput, setPopupInput] = useState("");
  const [newMessageText, setNewMessageText] = useState("");
  const [unreadMap, setUnreadMap] = useState({});
  const messagesEndRef = useRef(null);

  // ---------------- CHAT KEY RESOLUTION HELPERS ----------------
  const getStudentIdentityCandidates = (studentLike = {}) =>
    uniqueNonEmptyValues([studentLike?.userId, studentLike?.studentId, studentLike?.id]);

  const findStudentSummary = (ownerSummaries, studentLike = {}) => {
    const studentKeys = new Set(
      getStudentIdentityCandidates(studentLike).map((studentKey) => String(studentKey || "").trim().toLowerCase())
    );

    let matchedSummary = null;
    Object.entries(ownerSummaries && typeof ownerSummaries === "object" ? ownerSummaries : {}).forEach(
      ([chatId, summaryValue]) => {
        const summary = normalizeChatSummaryValue(summaryValue, { chatId });
        const otherUserId = String(summary.otherUserId || "").trim().toLowerCase();
        if (!otherUserId || !studentKeys.has(otherUserId)) return;

        if (!matchedSummary || summary.lastMessageTime >= matchedSummary.lastMessageTime) {
          matchedSummary = summary;
        }
      }
    );

    return matchedSummary;
  };

  const findExistingChatKey = (chatKeySet, currentUserCandidates, otherUserCandidates) => {
    if (!(chatKeySet instanceof Set)) return "";

    for (const currentUserCandidate of currentUserCandidates || []) {
      for (const otherUserCandidate of otherUserCandidates || []) {
        const matchedKey = buildChatKeyCandidates(currentUserCandidate, otherUserCandidate).find(
          (candidateKey) => chatKeySet.has(candidateKey)
        );

        if (matchedKey) return matchedKey;
      }
    }

    return "";
  };

  const resolveStudentChatKey = async (studentLike = {}) => {
    const ownerSummaries = await fetchCachedJson(`${dbUrl}/${buildOwnerChatSummariesPath(adminUserId)}.json`, {
      ttlMs: 30 * 1000,
      fallbackValue: {},
    });
    const existingSummary = findStudentSummary(ownerSummaries, studentLike);
    if (existingSummary?.chatId) return existingSummary.chatId;

    const chatIndex = await fetchCachedJson(`${dbUrl}/Chats.json?shallow=true`, {
      ttlMs: CHAT_INDEX_CACHE_TTL_MS,
      fallbackValue: {},
    });
    const chatKeySet = new Set(Object.keys(chatIndex || {}));
    const currentUserCandidates = uniqueNonEmptyValues([adminUserId, adminId]);
    const otherUserCandidates = getStudentIdentityCandidates(studentLike);
    const existingChatKey = findExistingChatKey(chatKeySet, currentUserCandidates, otherUserCandidates);

    if (existingChatKey) return existingChatKey;

    const fallbackCurrentUserId = currentUserCandidates[0] || "";
    const fallbackOtherUserId = otherUserCandidates[0] || "";
    return buildChatKeyCandidates(fallbackCurrentUserId, fallbackOtherUserId)[0] || "";
  };

  // ---------------- SEND MESSAGE (popup input) ----------------
  const sendPopupMessage = async () => {
    if (!popupInput.trim() || !selectedStudent) return;

    const newMessage = {
      senderId: adminUserId,
      receiverId: selectedStudent.userId,
      text: popupInput,
      timeStamp: Date.now(),
      seen: false,
    };

    try {
      const chatKey = await resolveStudentChatKey(selectedStudent);
      if (!chatKey) return;

      const pushRes = await axios.post(`${dbUrl}/Chats/${chatKey}/messages.json`, {
        senderId: newMessage.senderId,
        receiverId: newMessage.receiverId,
        type: newMessage.type || "text",
        text: newMessage.text || "",
        imageUrl: newMessage.imageUrl || null,
        replyTo: newMessage.replyTo || null,
        seen: false,
        edited: false,
        deleted: false,
        timeStamp: newMessage.timeStamp,
      });

      const generatedId = pushRes.data && pushRes.data.name;

      await axios.patch(`${dbUrl}/Chats/${chatKey}.json`, {
        participants: {
          [adminUserId]: true,
          [selectedStudent.userId]: true,
        },
      });

      await Promise.all([
        axios.patch(
          `${dbUrl}/${buildChatSummaryPath(adminUserId, chatKey)}.json`,
          buildChatSummaryUpdate({
            chatId: chatKey,
            otherUserId: selectedStudent.userId,
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
          `${dbUrl}/${buildChatSummaryPath(selectedStudent.userId, chatKey)}.json`,
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

      // Increment unread for receiver summary
      try {
        const summaryRes = await axios.get(
          `${dbUrl}/${buildChatSummaryPath(selectedStudent.userId, chatKey)}.json`
        );
        const summary = normalizeChatSummaryValue(summaryRes.data, {
          chatId: chatKey,
          otherUserId: adminUserId,
        });
        await axios.patch(
          `${dbUrl}/${buildChatSummaryPath(selectedStudent.userId, chatKey)}.json`,
          buildChatSummaryUpdate({
            chatId: chatKey,
            otherUserId: adminUserId,
            unreadCount: Number(summary.unreadCount || 0) + 1,
          })
        );
      } catch {
        await axios.patch(
          `${dbUrl}/${buildChatSummaryPath(selectedStudent.userId, chatKey)}.json`,
          buildChatSummaryUpdate({
            chatId: chatKey,
            otherUserId: adminUserId,
            unreadCount: 1,
          })
        );
      }

      setPopupMessages((prev) => [
        ...prev,
        { messageId: generatedId || `${Date.now()}`, ...newMessage, sender: "admin" },
      ]);
      setPopupInput("");
    } catch (err) {
      console.error(err);
    }
  };

  // ---------------- SEND MESSAGE (inline input) ----------------
  const sendMessage = async () => {
    if (!newMessageText.trim() || !selectedStudent) return;

    const newMessage = {
      senderId: adminUserId,
      receiverId: selectedStudent.userId,
      text: newMessageText,
      timeStamp: Date.now(),
      seen: false,
    };

    try {
      const chatKey = await resolveStudentChatKey(selectedStudent);
      if (!chatKey) return;

      try {
        const pushRes = await axios.post(`${dbUrl}/Chats/${chatKey}/messages.json`, {
          senderId: newMessage.senderId,
          receiverId: newMessage.receiverId,
          type: newMessage.type || "text",
          text: newMessage.text || "",
          imageUrl: null,
          replyTo: null,
          seen: false,
          edited: false,
          deleted: false,
          timeStamp: newMessage.timeStamp,
        });

        const generatedId = pushRes.data && pushRes.data.name;

        await axios.patch(`${dbUrl}/Chats/${chatKey}.json`, {
          participants: { [adminUserId]: true, [selectedStudent.userId]: true },
        });

        await Promise.all([
          axios.patch(
            `${dbUrl}/${buildChatSummaryPath(adminUserId, chatKey)}.json`,
            buildChatSummaryUpdate({
              chatId: chatKey,
              otherUserId: selectedStudent.userId,
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
            `${dbUrl}/${buildChatSummaryPath(selectedStudent.userId, chatKey)}.json`,
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

        try {
          const summaryRes = await axios.get(
            `${dbUrl}/${buildChatSummaryPath(selectedStudent.userId, chatKey)}.json`
          );
          const summary = normalizeChatSummaryValue(summaryRes.data, {
            chatId: chatKey,
            otherUserId: adminUserId,
          });
          await axios.patch(
            `${dbUrl}/${buildChatSummaryPath(selectedStudent.userId, chatKey)}.json`,
            buildChatSummaryUpdate({
              chatId: chatKey,
              otherUserId: adminUserId,
              unreadCount: Number(summary.unreadCount || 0) + 1,
            })
          );
        } catch {
          await axios.patch(
            `${dbUrl}/${buildChatSummaryPath(selectedStudent.userId, chatKey)}.json`,
            buildChatSummaryUpdate({
              chatId: chatKey,
              otherUserId: adminUserId,
              unreadCount: 1,
            })
          );
        }

        setPopupMessages((prev) => [
          ...prev,
          { messageId: generatedId || `${Date.now()}`, ...newMessage, sender: "admin" },
        ]);
        setNewMessageText("");
      } catch (err) {
        console.error("Failed to send message:", err);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  // ---------------- FETCH UNREAD STATUS PER STUDENT ----------------
  useEffect(() => {
    const fetchUnread = async () => {
      const ownerSummaries = await fetchCachedJson(
        `${dbUrl}/${buildOwnerChatSummariesPath(adminUserId)}.json`,
        { ttlMs: 30 * 1000, fallbackValue: {} }
      );
      const unreadEntries = students.map((studentItem) => {
        const studentKeys = getStudentIdentityCandidates(studentItem);
        const summary = findStudentSummary(ownerSummaries, studentItem);
        return {
          studentKeys,
          hasUnread: Number(summary?.unreadCount || 0) > 0,
        };
      });

      const nextMap = unreadEntries.reduce((acc, entry) => {
        (entry?.studentKeys || []).forEach((studentKey) => {
          acc[studentKey] = Boolean(entry?.hasUnread);
        });
        return acc;
      }, {});

      setUnreadMap(nextMap);
    };

    if (students.length > 0 && adminUserId) {
      fetchUnread();
      return;
    }

    setUnreadMap({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUrl, students, adminId, adminUserId]);

  // ---------------- MARK MESSAGES AS SEEN ----------------
  useEffect(() => {
    if (!studentChatOpen || !selectedStudent) return;

    let isActive = true;
    let unsubscribe = () => {};

    const startListening = async () => {
      const chatKey = await resolveStudentChatKey(selectedStudent);
      if (!isActive || !chatKey) return;

      const messagesRef = ref(dbRT, `Chats/${chatKey}/messages`);
      unsubscribe = onValue(messagesRef, async (snapshot) => {
        const data = snapshot.val() || {};
        const list = Object.entries(data)
          .map(([id, msg]) => ({ messageId: id, ...msg }))
          .sort((a, b) => a.timeStamp - b.timeStamp);
        setPopupMessages(list);

        const updates = {};
        const hasUnseenIncomingMessages = Object.values(data).some(
          (msg) => msg && msg.receiverId === adminUserId && !msg.seen
        );
        Object.entries(data).forEach(([msgId, msg]) => {
          if (msg && msg.receiverId === adminUserId && !msg.seen) {
            updates[`Chats/${chatKey}/messages/${msgId}/seen`] = true;
          }
        });

        if (Object.keys(updates).length > 0) {
          try {
            await axios.patch(`${dbUrl}/.json`, updates);
          } catch (err) {
            console.error("Failed to patch seen updates:", err);
          }
        }

        axios
          .patch(
            `${dbUrl}/${buildChatSummaryPath(adminUserId, chatKey)}.json`,
            buildChatSummaryUpdate({
              chatId: chatKey,
              otherUserId: selectedStudent.userId,
              unreadCount: 0,
              ...(hasUnseenIncomingMessages
                ? {
                    lastMessageSeen: true,
                    lastMessageSeenAt: Date.now(),
                  }
                : {}),
            })
          )
          .catch(() => {});

        setUnreadMap((previousMap) => {
          const nextMap = { ...previousMap };
          getStudentIdentityCandidates(selectedStudent).forEach((studentKey) => {
            nextMap[studentKey] = false;
          });
          return nextMap;
        });
      });
    };

    startListening();

    return () => {
      isActive = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUrl, studentChatOpen, selectedStudent?.studentId, selectedStudent?.userId, adminId, adminUserId]);

  return {
    // state
    studentChatOpen,
    setStudentChatOpen,
    popupMessages,
    setPopupMessages,
    popupInput,
    setPopupInput,
    newMessageText,
    setNewMessageText,
    unreadMap,
    messagesEndRef,
    // actions
    sendPopupMessage,
    sendMessage,
    // helpers exposed for the page (e.g. unread badges in list rows)
    getStudentIdentityCandidates,
  };
}
