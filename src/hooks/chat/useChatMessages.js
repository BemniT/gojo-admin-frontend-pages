import { useEffect, useState } from "react";
import { ref, onValue, push, update, get, set, runTransaction } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import {
  buildChatSummaryPath,
  buildChatSummaryUpdate,
} from "../../utils/chatRtdb";

const sortedChatId = (id1, id2) => {
  const a = String(id1 || "").trim();
  const b = String(id2 || "").trim();
  return [a, b].sort().join("_");
};

// ---------------- IMAGE COMPRESSION (lifted from AllChat.jsx) ----------------
const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image file"));
    };
    image.src = objectUrl;
  });

const compressImageToJpeg = async (file, { maxWidth = 1280, maxHeight = 1280, quality = 0.72 } = {}) => {
  const image = await loadImageFromFile(file);

  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;

  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  width = Math.max(1, Math.round(width * ratio));
  height = Math.max(1, Math.round(height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable");

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (output) => {
        if (!output) {
          reject(new Error("Image compression failed"));
          return;
        }
        resolve(output);
      },
      "image/jpeg",
      quality
    );
  });

  return blob;
};

/**
 * useChatMessages
 *
 * Owns the AllChat page's active-conversation data layer:
 *   - messages list + input text + editing/clicked-message UI state
 *   - currentChatKey + legacy chat-key resolution
 *   - realtime message listener (auto-marks unseen incoming messages as seen
 *     and patches owner-summary unreadCount → 0)
 *   - lastSeen presence subscription for the selected user (reported back
 *     via onPresenceUpdate)
 *   - sendMessage / sendImageMessage / handleEditMessage / handleDeleteMessage
 *   - reset-on-filter effect (when summary listener drops a user from
 *     allowedUserIds, clears the selected chat)
 *
 * Page concerns kept out: `selectedChatUser`/`setSelectedChatUser`,
 * `allowedUserIds`, `loadingContacts`, presence map (callback), unread map
 * (callback). All wiring goes through the hook surface.
 */
export default function useChatMessages({
  adminUserId,
  selectedChatUser,
  setSelectedChatUser,
  allowedUserIds,
  loadingContacts,
  schoolNodePrefix,
  onPresenceUpdate,
  onUnreadCleared,
}) {
  const scopedPath = (path) => (schoolNodePrefix ? `${schoolNodePrefix}/${path}` : path);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [currentChatKey, setCurrentChatKey] = useState(null);
  const [clickedMessageId, setClickedMessageId] = useState(null);
  const [editingMessages, setEditingMessages] = useState({});
  const [imageSending, setImageSending] = useState(false);

  // ---------------- LEGACY CHAT-KEY RESOLUTION ----------------
  const resolveLegacyChatKey = async (otherUserId) => {
    if (!otherUserId || !adminUserId) return null;
    const sortedKey = sortedChatId(adminUserId, otherUserId);
    const directKey = `${adminUserId}_${otherUserId}`;
    const reverseKey = `${otherUserId}_${adminUserId}`;
    const candidates = Array.from(new Set([sortedKey, directKey, reverseKey]));

    for (const key of candidates) {
      try {
        const snapshot = await get(ref(db, scopedPath(`Chats/${key}/messages`)));
        if (snapshot.exists()) return key;
      } catch {
        // ignore candidate lookup failures
      }
    }

    return sortedKey;
  };

  const getActiveChatKey = async () => {
    if (!selectedChatUser || !adminUserId) return null;
    if (currentChatKey) return currentChatKey;
    if (selectedChatUser.chatKey) {
      setCurrentChatKey(selectedChatUser.chatKey);
      return selectedChatUser.chatKey;
    }
    const resolved = await resolveLegacyChatKey(selectedChatUser.userId);
    setCurrentChatKey(resolved);
    return resolved;
  };

  // ---------------- RESET WHEN CONTACT NOT IN ALLOWED SET ----------------
  useEffect(() => {
    if (!selectedChatUser?.userId) return;
    if (loadingContacts) return;
    if (!allowedUserIds || allowedUserIds.size === 0) return;
    if (!allowedUserIds.has(String(selectedChatUser.userId || ""))) {
      setSelectedChatUser(null);
      setCurrentChatKey(null);
      setMessages([]);
    }
  }, [allowedUserIds, loadingContacts, selectedChatUser, setSelectedChatUser]);

  // ---------------- MESSAGE + PRESENCE LISTENERS ----------------
  useEffect(() => {
    if (!selectedChatUser || !adminUserId) return undefined;

    let cancelled = false;
    let unsubscribeMessages = null;
    let unsubscribePresence = null;

    const connect = async () => {
      const chatKey =
        currentChatKey || selectedChatUser.chatKey || (await resolveLegacyChatKey(selectedChatUser.userId));
      if (!chatKey || cancelled) return;

      setCurrentChatKey(chatKey);

      const messagesRef = ref(db, scopedPath(`Chats/${chatKey}/messages`));
      const lastSeenRef = ref(db, scopedPath(`Users/${selectedChatUser.userId}/lastSeen`));

      unsubscribeMessages = onValue(messagesRef, async (snapshot) => {
        const data = snapshot.val() || {};
        const list = Object.entries(data)
          .map(([id, message]) => ({
            id,
            ...message,
            isAdmin: String(message.senderId) === String(adminUserId),
          }))
          .sort((a, b) => Number(a.timeStamp || 0) - Number(b.timeStamp || 0));

        setMessages(list);

        const updates = {};
        const hasUnseenIncomingMessages = Object.values(data).some(
          (message) => String(message?.receiverId) === String(adminUserId) && !message?.seen
        );
        const seenAt = Date.now();
        Object.entries(data).forEach(([messageId, message]) => {
          if (String(message?.receiverId) === String(adminUserId) && !message?.seen) {
            updates[`${scopedPath(`Chats/${chatKey}/messages/${messageId}/seen`)}`] = true;
          }
        });

        try {
          if (Object.keys(updates).length) {
            await update(ref(db), updates);
          }
        } catch {
          // ignore read receipt write failures
        }

        update(
          ref(db, scopedPath(buildChatSummaryPath(adminUserId, chatKey))),
          buildChatSummaryUpdate({
            chatId: chatKey,
            otherUserId: selectedChatUser.userId,
            unreadCount: 0,
            ...(hasUnseenIncomingMessages
              ? {
                  lastMessageSeen: true,
                  lastMessageSeenAt: seenAt,
                }
              : {}),
          })
        ).catch(() => {});

        if (typeof onUnreadCleared === "function") {
          onUnreadCleared(selectedChatUser.userId);
        }
      });

      unsubscribePresence = onValue(lastSeenRef, (snapshot) => {
        if (typeof onPresenceUpdate === "function") {
          onPresenceUpdate(selectedChatUser.userId, snapshot.val());
        }
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (typeof unsubscribeMessages === "function") unsubscribeMessages();
      if (typeof unsubscribePresence === "function") unsubscribePresence();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatUser, adminUserId, currentChatKey, schoolNodePrefix]);

  // ---------------- SEND TEXT MESSAGE ----------------
  const sendMessage = async () => {
    if (!input.trim() || !selectedChatUser) return;
    if (!allowedUserIds.has(String(selectedChatUser.userId || ""))) return;

    const editingId = Object.keys(editingMessages).find((id) => editingMessages[id]);
    const chatKey = await getActiveChatKey();
    if (!chatKey) return;

    if (editingId) {
      await update(ref(db, scopedPath(`Chats/${chatKey}/messages/${editingId}`)), {
        text: input,
        edited: true,
      });
      setEditingMessages({});
      setClickedMessageId(null);
      setInput("");
      return;
    }

    const messagesRef = ref(db, scopedPath(`Chats/${chatKey}/messages`));
    const messageData = {
      senderId: adminUserId,
      receiverId: selectedChatUser.userId,
      type: "text",
      text: input,
      seen: false,
      edited: false,
      deleted: false,
      timeStamp: Date.now(),
    };

    await push(messagesRef, messageData);

    await update(ref(db, scopedPath(`Chats/${chatKey}/participants`)), {
      [adminUserId]: true,
      [selectedChatUser.userId]: true,
    });

    await Promise.all([
      update(
        ref(db, scopedPath(buildChatSummaryPath(adminUserId, chatKey))),
        buildChatSummaryUpdate({
          chatId: chatKey,
          otherUserId: selectedChatUser.userId,
          unreadCount: 0,
          lastMessageText: input,
          lastMessageType: "text",
          lastMessageTime: messageData.timeStamp,
          lastSenderId: adminUserId,
          lastMessageSeen: false,
          lastMessageSeenAt: null,
        })
      ),
      update(
        ref(db, scopedPath(buildChatSummaryPath(selectedChatUser.userId, chatKey))),
        buildChatSummaryUpdate({
          chatId: chatKey,
          otherUserId: adminUserId,
          lastMessageText: input,
          lastMessageType: "text",
          lastMessageTime: messageData.timeStamp,
          lastSenderId: adminUserId,
          lastMessageSeen: false,
          lastMessageSeenAt: null,
        })
      ),
    ]);

    try {
      await runTransaction(
        ref(db, scopedPath(`${buildChatSummaryPath(selectedChatUser.userId, chatKey)}/unreadCount`)),
        (current) => Number(current || 0) + 1
      );
      await set(ref(db, scopedPath(`Chats/${chatKey}/typing`)), { userId: null });
    } catch {
      // ignore unread increment failures
    }

    setInput("");
  };

  // ---------------- SEND IMAGE MESSAGE ----------------
  const sendImageMessage = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file || !selectedChatUser || !adminUserId) {
      if (event?.target) event.target.value = "";
      return;
    }
    if (!allowedUserIds.has(String(selectedChatUser.userId || ""))) {
      if (event?.target) event.target.value = "";
      return;
    }

    const chatKey = await getActiveChatKey();
    if (!chatKey) {
      if (event?.target) event.target.value = "";
      return;
    }

    try {
      setImageSending(true);

      const compressedBlob = await compressImageToJpeg(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.72,
      });

      const messagesRef = ref(db, scopedPath(`Chats/${chatKey}/messages`));
      const messageRef = push(messagesRef);
      const messageId = messageRef.key;
      const timeStamp = Date.now();

      const uploadRef = storageRef(storage, `chatImages/${chatKey}/${messageId}.jpg`);
      await uploadBytes(uploadRef, compressedBlob, { contentType: "image/jpeg" });
      const imageUrl = await getDownloadURL(uploadRef);

      const messageData = {
        messageId,
        senderId: adminUserId,
        receiverId: selectedChatUser.userId,
        type: "image",
        text: "",
        imageUrl,
        seen: false,
        edited: false,
        deleted: false,
        timeStamp,
      };

      await update(messageRef, messageData);

      await update(ref(db, scopedPath(`Chats/${chatKey}/participants`)), {
        [adminUserId]: true,
        [selectedChatUser.userId]: true,
      });

      await Promise.all([
        update(
          ref(db, scopedPath(buildChatSummaryPath(adminUserId, chatKey))),
          buildChatSummaryUpdate({
            chatId: chatKey,
            otherUserId: selectedChatUser.userId,
            unreadCount: 0,
            lastMessageText: "",
            lastMessageType: "image",
            lastMessageTime: timeStamp,
            lastSenderId: adminUserId,
            lastMessageSeen: false,
            lastMessageSeenAt: null,
          })
        ),
        update(
          ref(db, scopedPath(buildChatSummaryPath(selectedChatUser.userId, chatKey))),
          buildChatSummaryUpdate({
            chatId: chatKey,
            otherUserId: adminUserId,
            lastMessageText: "",
            lastMessageType: "image",
            lastMessageTime: timeStamp,
            lastSenderId: adminUserId,
            lastMessageSeen: false,
            lastMessageSeenAt: null,
          })
        ),
      ]);

      try {
        await runTransaction(
          ref(db, scopedPath(`${buildChatSummaryPath(selectedChatUser.userId, chatKey)}/unreadCount`)),
          (current) => Number(current || 0) + 1
        );
      } catch {
        // ignore unread increment failures
      }
    } catch (error) {
      console.error("Image send failed:", error);
    } finally {
      setImageSending(false);
      if (event?.target) event.target.value = "";
    }
  };

  // ---------------- EDIT / DELETE ----------------
  const handleEditMessage = (id) => {
    const message = messages.find((item) => item.id === id);
    if (!message) return;
    setEditingMessages({ [id]: true });
    setClickedMessageId(id);
    setInput(String(message.text || ""));
  };

  const handleDeleteMessage = async (id) => {
    const chatKey = await getActiveChatKey();
    if (!chatKey) return;
    await update(ref(db, scopedPath(`Chats/${chatKey}/messages/${id}`)), { deleted: true });
  };

  return {
    messages,
    setMessages,
    input,
    setInput,
    currentChatKey,
    setCurrentChatKey,
    clickedMessageId,
    setClickedMessageId,
    editingMessages,
    setEditingMessages,
    imageSending,
    sendMessage,
    sendImageMessage,
    handleEditMessage,
    handleDeleteMessage,
  };
}
