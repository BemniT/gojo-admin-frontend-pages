import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { mapInBatches } from "../../utils/chatRtdb";

const CHAT_POLL_IDLE_GRACE_MS = 2 * 60 * 1000;
const PRESENCE_POLL_INTERVAL_MS = 2 * 60 * 1000;
const PRESENCE_BATCH_SIZE = 12;

/**
 * useChatPresence
 *
 * Owns the AllChat page's presence map for the visible contact tab + the
 * currently selected chat user:
 *   - presence state ({ [userId]: lastSeenTs })
 *   - lastChatActivityAtRef: bumped by user gestures so polling can pause
 *     when the user is idle (saves Firebase reads)
 *   - global activity-tracker effect (focus/online/pointerdown/keydown/etc.)
 *   - batched polling effect (every 2min, when visible+online+recently active;
 *     reads `Presence/{userId}` for each contact in the active tab)
 *
 * Page wiring: the useChatMessages hook still reports per-message lastSeen
 * updates via its `onPresenceUpdate` callback — the page calls `setPresence`
 * exposed from THIS hook so both sources patch the same map.
 */
export default function useChatPresence({
  selectedTab,
  selectedChatUser,
  teachers,
  students,
  parents,
  managements,
  schoolScopeCode,
  apiBase,
}) {
  const [presence, setPresence] = useState({});
  const lastChatActivityAtRef = useRef(Date.now());

  const readSchoolNodeApi = async (path, fallbackValue = {}) => {
    if (!schoolScopeCode) return fallbackValue;
    try {
      const response = await axios.get(`${apiBase}/school-node-read`, {
        params: { schoolCode: schoolScopeCode, path },
        timeout: 12000,
      });
      const data = response?.data?.data;
      return data === null || data === undefined ? fallbackValue : data;
    } catch {
      return fallbackValue;
    }
  };

  // ---------------- ACTIVITY TRACKER ----------------
  useEffect(() => {
    const markChatActivity = () => {
      lastChatActivityAtRef.current = Date.now();
    };

    const handleVisibilityChange = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      markChatActivity();
    };

    window.addEventListener("focus", markChatActivity);
    window.addEventListener("online", markChatActivity);
    window.addEventListener("pointerdown", markChatActivity, { passive: true });
    window.addEventListener("touchstart", markChatActivity, { passive: true });
    window.addEventListener("keydown", markChatActivity);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", markChatActivity);
      window.removeEventListener("online", markChatActivity);
      window.removeEventListener("pointerdown", markChatActivity);
      window.removeEventListener("touchstart", markChatActivity);
      window.removeEventListener("keydown", markChatActivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // ---------------- BATCH POLLING ----------------
  useEffect(() => {
    let cancelled = false;

    const activeContacts =
      selectedTab === "student"
        ? students
        : selectedTab === "parent"
        ? parents
        : selectedTab === "management"
        ? managements
        : teachers;

    const presenceUserIds = [
      ...new Set(
        [
          ...activeContacts.map((contact) => String(contact?.userId || "").trim()).filter(Boolean),
          String(selectedChatUser?.userId || "").trim(),
        ].filter(Boolean)
      ),
    ];

    if (!presenceUserIds.length) {
      setPresence({});
      return undefined;
    }

    const loadPresence = async ({ force = false } = {}) => {
      const isVisible = typeof document === "undefined" || document.visibilityState === "visible";
      const isOnline = typeof navigator === "undefined" || navigator.onLine !== false;
      const isRecentlyActive = Date.now() - lastChatActivityAtRef.current <= CHAT_POLL_IDLE_GRACE_MS;
      if (!force && (!isVisible || !isOnline || !isRecentlyActive)) return;

      try {
        const entries = await mapInBatches(presenceUserIds, PRESENCE_BATCH_SIZE, async (userId) => {
          const data = await readSchoolNodeApi(`Presence/${userId}`, null);
          return [userId, data];
        });

        const nextPresence = entries.reduce((result, [userId, value]) => {
          result[userId] = value;
          return result;
        }, {});

        if (!cancelled) setPresence(nextPresence);
      } catch (error) {
        console.warn("Presence polling unavailable:", error);
        if (!cancelled) setPresence({});
      }
    };

    const handleFocusedPresenceRefresh = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      lastChatActivityAtRef.current = Date.now();
      void loadPresence({ force: true });
    };

    void loadPresence({ force: true });
    const intervalId = window.setInterval(() => {
      void loadPresence();
    }, PRESENCE_POLL_INTERVAL_MS);
    window.addEventListener("focus", handleFocusedPresenceRefresh);
    window.addEventListener("online", handleFocusedPresenceRefresh);
    document.addEventListener("visibilitychange", handleFocusedPresenceRefresh);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocusedPresenceRefresh);
      window.removeEventListener("online", handleFocusedPresenceRefresh);
      document.removeEventListener("visibilitychange", handleFocusedPresenceRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, selectedChatUser?.userId, schoolScopeCode, teachers, students, parents, managements]);

  return {
    presence,
    setPresence,
  };
}
