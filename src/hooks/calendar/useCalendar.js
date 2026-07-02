import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import EthiopicCalendar from "ethiopic-calendar";
import { BACKEND_BASE } from "../../config.js";
import { buildDefaultCalendarEvents } from "../../config/ethiopianHolidays.js";

export const CALENDAR_EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;
export const CALENDAR_MANAGER_ROLES = new Set([
  "registrar", "registerer", "admin", "admins",
  "school_admin", "school_admins", "finance",
]);

export const CALENDAR_EVENT_META = {
  academic: {
    label: "Academic",
    color: "var(--success)",
    background: "var(--success-soft)",
    border: "var(--success-border)",
    category: "academic",
    subType: "general",
  },
  "no-class": {
    label: "No class",
    color: "var(--warning)",
    background: "var(--warning-soft)",
    border: "var(--warning-border)",
    category: "no-class",
    subType: "general",
  },
};

export const ETHIOPIAN_MONTHS = [
  "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit",
  "Megabit", "Miyazya", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume",
];

export const CALENDAR_WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const getCalendarEventKey = (category) =>
  category === "academic" ? "academic" : "no-class";

export const getCalendarEventMeta = (category) =>
  CALENDAR_EVENT_META[getCalendarEventKey(category)] || CALENDAR_EVENT_META.academic;

const normalizeCalendarEvent = (eventId, eventValue) => {
  const legacyType = eventValue?.type || "academic";
  const category = eventValue?.category || (legacyType === "academic" ? "academic" : "no-class");
  const eventMeta = getCalendarEventMeta(category);

  return {
    id: eventId,
    title: eventValue?.title || eventMeta.label,
    type: getCalendarEventKey(category),
    category,
    subType: "general",
    notes: eventValue?.notes || "",
    gregorianDate: eventValue?.gregorianDate || "",
    ethiopianDate: eventValue?.ethiopianDate || null,
    createdAt: eventValue?.createdAt || "",
    createdBy: eventValue?.createdBy || "",
    showInUpcomingDeadlines: Boolean(eventValue?.showInUpcomingDeadlines),
    isDefault: false,
  };
};

const sortCalendarEvents = (events) =>
  [...events].sort((a, b) => {
    const dateComparison = String(a.gregorianDate || "").localeCompare(String(b.gregorianDate || ""));
    if (dateComparison !== 0) return dateComparison;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });

export const formatCalendarDeadlineDate = (isoDate) => {
  if (!isoDate) return "";
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const getCalendarEventsStorageKey = (schoolScopeCode) =>
  `dashboard_calendar_events_cache_${String(schoolScopeCode || "").trim().toLowerCase()}`;

const readCachedCalendarEvents = (schoolScopeCode) => {
  const code = String(schoolScopeCode || "").trim();
  if (!code) return { events: [], isFresh: false };
  try {
    const raw = localStorage.getItem(getCalendarEventsStorageKey(code));
    if (!raw) return { events: [], isFresh: false };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.events)) return { events: [], isFresh: false };
    return {
      events: parsed.events,
      isFresh: Number(parsed.expiresAt || 0) > Date.now(),
    };
  } catch {
    return { events: [], isFresh: false };
  }
};

const writeCachedCalendarEvents = (schoolScopeCode, events) => {
  const code = String(schoolScopeCode || "").trim();
  if (!code) return;
  try {
    localStorage.setItem(
      getCalendarEventsStorageKey(code),
      JSON.stringify({ events, expiresAt: Date.now() + CALENDAR_EVENTS_CACHE_TTL_MS })
    );
  } catch {
    // Ignore localStorage write issues.
  }
};

const parseInitialCalendarDate = () => {
  const now = new Date();
  const ethDate = EthiopicCalendar.ge(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { year: ethDate.year, month: ethDate.month };
};

export function useCalendar({ schoolScopeCode, adminRole }) {
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarEventsLoading, setCalendarEventsLoading] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(() => parseInitialCalendarDate());
  const [calendarEventForm, setCalendarEventForm] = useState({
    title: "", category: "no-class", subType: "general", notes: "",
  });
  const [calendarEventSaving, setCalendarEventSaving] = useState(false);
  const [selectedCalendarIsoDate, setSelectedCalendarIsoDate] = useState("");
  const [editingCalendarEventId, setEditingCalendarEventId] = useState("");
  const [calendarActionMessage, setCalendarActionMessage] = useState("");
  const [showCalendarEventModal, setShowCalendarEventModal] = useState(false);
  const [hoveredCalendarIsoDate, setHoveredCalendarIsoDate] = useState("");
  const [calendarModalContext, setCalendarModalContext] = useState("calendar");
  const [showAllUpcomingDeadlines, setShowAllUpcomingDeadlines] = useState(false);

  const canManageCalendar = CALENDAR_MANAGER_ROLES.has(
    String(adminRole || "admin").trim().toLowerCase().replace(/-/g, "_")
  );

  // ---- Today reference points
  const calendarNow = useMemo(() => new Date(), []);
  const calendarTodayIsoDate = useMemo(
    () => `${calendarNow.getFullYear()}-${String(calendarNow.getMonth() + 1).padStart(2, "0")}-${String(calendarNow.getDate()).padStart(2, "0")}`,
    [calendarNow]
  );
  const deadlineWindowEndIsoDate = useMemo(() => {
    const end = new Date(calendarNow);
    end.setDate(end.getDate() + 30);
    return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  }, [calendarNow]);

  const currentEthiopicDate = useMemo(
    () => EthiopicCalendar.ge(calendarNow.getFullYear(), calendarNow.getMonth() + 1, calendarNow.getDate()),
    [calendarNow]
  );

  // ---- Month layout
  const calendarMonthLabel = useMemo(
    () => `${ETHIOPIAN_MONTHS[calendarViewDate.month - 1]} ${calendarViewDate.year}`,
    [calendarViewDate.month, calendarViewDate.year]
  );

  const isCurrentCalendarMonth =
    calendarViewDate.year === currentEthiopicDate.year &&
    calendarViewDate.month === currentEthiopicDate.month;

  const calendarHighlightedDay = isCurrentCalendarMonth ? currentEthiopicDate.day : null;

  const calendarDaysInMonth = useMemo(
    () => (calendarViewDate.month === 13 ? (calendarViewDate.year % 4 === 3 ? 6 : 5) : 30),
    [calendarViewDate.month, calendarViewDate.year]
  );

  const calendarMonthStartGregorian = useMemo(
    () => EthiopicCalendar.eg(calendarViewDate.year, calendarViewDate.month, 1),
    [calendarViewDate.month, calendarViewDate.year]
  );

  const calendarMonthEndGregorian = useMemo(
    () => EthiopicCalendar.eg(calendarViewDate.year, calendarViewDate.month, calendarDaysInMonth),
    [calendarViewDate.month, calendarViewDate.year, calendarDaysInMonth]
  );

  const calendarFirstWeekday = useMemo(
    () => new Date(
      calendarMonthStartGregorian.year,
      calendarMonthStartGregorian.month - 1,
      calendarMonthStartGregorian.day
    ).getDay(),
    [calendarMonthStartGregorian]
  );

  // ---- Events
  const defaultCalendarEvents = useMemo(
    () => buildDefaultCalendarEvents(calendarViewDate.year),
    [calendarViewDate.year]
  );

  const mergedCalendarEvents = useMemo(
    () => sortCalendarEvents([...defaultCalendarEvents, ...calendarEvents]),
    [defaultCalendarEvents, calendarEvents]
  );

  const calendarEventsByDate = useMemo(() => {
    return mergedCalendarEvents.reduce((map, ev) => {
      const date = String(ev.gregorianDate || "");
      if (!date) return map;
      if (!map[date]) map[date] = [];
      map[date].push(ev);
      return map;
    }, {});
  }, [mergedCalendarEvents]);

  const calendarDays = useMemo(() => {
    return Array.from({ length: calendarFirstWeekday + calendarDaysInMonth }, (_, index) => {
      const dayNumber = index - calendarFirstWeekday + 1;
      if (dayNumber < 1 || dayNumber > calendarDaysInMonth) return null;
      const greg = EthiopicCalendar.eg(calendarViewDate.year, calendarViewDate.month, dayNumber);
      const iso = `${greg.year}-${String(greg.month).padStart(2, "0")}-${String(greg.day).padStart(2, "0")}`;
      return { ethDay: dayNumber, isoDate: iso, gregorianDate: greg, events: calendarEventsByDate[iso] || [] };
    });
  }, [calendarFirstWeekday, calendarDaysInMonth, calendarViewDate, calendarEventsByDate]);

  const monthlyCalendarEvents = useMemo(
    () => sortCalendarEvents(
      calendarDays.filter(Boolean).flatMap((day) =>
        day.events.map((ev) => ({ ...ev, ethDay: day.ethDay }))
      )
    ),
    [calendarDays]
  );

  const upcomingDeadlineEvents = useMemo(() => sortCalendarEvents(
    calendarEvents.filter(
      (ev) =>
        ev.showInUpcomingDeadlines &&
        ev.category === "academic" &&
        String(ev.gregorianDate || "") >= calendarTodayIsoDate &&
        String(ev.gregorianDate || "") <= deadlineWindowEndIsoDate
    )
  ), [calendarEvents, calendarTodayIsoDate, deadlineWindowEndIsoDate]);

  const visibleUpcomingDeadlineEvents = showAllUpcomingDeadlines
    ? upcomingDeadlineEvents
    : upcomingDeadlineEvents.slice(0, 3);

  const editingCalendarEvent = useMemo(
    () => calendarEvents.find((ev) => ev.id === editingCalendarEventId) || null,
    [calendarEvents, editingCalendarEventId]
  );

  const selectableCalendarDays = useMemo(
    () => calendarDays.filter(Boolean),
    [calendarDays]
  );

  const selectedCalendarDay = useMemo(
    () => calendarDays.find((d) => d?.isoDate === selectedCalendarIsoDate) || null,
    [calendarDays, selectedCalendarIsoDate]
  );

  const selectedCalendarEvents = selectedCalendarDay?.events || [];

  // ---- Handlers
  const handleCalendarMonthChange = useCallback((offset) => {
    setCalendarViewDate((cur) => {
      let m = cur.month + offset;
      let y = cur.year;
      while (m < 1) { m += 13; y -= 1; }
      while (m > 13) { m -= 13; y += 1; }
      return { year: y, month: m };
    });
  }, []);

  const fetchCalendarEvents = useCallback(async ({ forceRefresh = false } = {}) => {
    if (!schoolScopeCode) {
      setCalendarEvents([]);
      return [];
    }

    if (!forceRefresh) {
      const cached = readCachedCalendarEvents(schoolScopeCode);
      if (cached.events.length > 0) {
        setCalendarEvents(sortCalendarEvents(cached.events));
      }
      if (cached.isFresh) {
        setCalendarEventsLoading(false);
        return cached.events;
      }
    }

    setCalendarEventsLoading(true);
    try {
      const res = await axios.get(`${BACKEND_BASE}/api/calendar_events`, {
        params: { schoolCode: schoolScopeCode },
      });
      const source = Array.isArray(res?.data) ? res.data : [];
      const normalized = source
        .map((ev) => normalizeCalendarEvent(ev.id, ev))
        .filter((ev) => ev.gregorianDate);
      const sorted = sortCalendarEvents(normalized);
      setCalendarEvents(sorted);
      writeCachedCalendarEvents(schoolScopeCode, sorted);
      return sorted;
    } catch (error) {
      console.error("Failed to load calendar events:", error);
      const cached = readCachedCalendarEvents(schoolScopeCode);
      const sorted = sortCalendarEvents(cached.events || []);
      setCalendarEvents(sorted);
      return sorted;
    } finally {
      setCalendarEventsLoading(false);
    }
  }, [schoolScopeCode]);

  const handleCreateCalendarEvent = useCallback(async ({ adminUserId = "", showAlert } = {}) => {
    const notify = showAlert || ((m) => setCalendarActionMessage(m));

    if (!canManageCalendar) {
      notify("Only registrar or admin users can manage school calendar events.");
      return false;
    }
    if (!selectedCalendarDay) {
      notify("Select a calendar day first.");
      return false;
    }
    if (calendarModalContext === "deadline" && !calendarEventForm.title.trim()) {
      notify("Enter a deadline title.");
      return false;
    }

    setCalendarEventSaving(true);
    try {
      const normalizedCategory = calendarModalContext === "deadline" ? "academic" : calendarEventForm.category;
      const eventMeta = getCalendarEventMeta(normalizedCategory);
      const payload = {
        title: calendarEventForm.title.trim() || eventMeta.label,
        type: getCalendarEventKey(normalizedCategory),
        category: normalizedCategory,
        subType: "general",
        notes: calendarEventForm.notes.trim(),
        showInUpcomingDeadlines: calendarModalContext === "deadline" || Boolean(editingCalendarEvent?.showInUpcomingDeadlines),
        gregorianDate: selectedCalendarDay.isoDate,
        ethiopianDate: {
          year: calendarViewDate.year,
          month: calendarViewDate.month,
          day: selectedCalendarDay.ethDay,
        },
        createdAt: new Date().toISOString(),
        createdBy: String(adminUserId || "").trim(),
      };

      if (editingCalendarEventId) {
        await axios.patch(`${BACKEND_BASE}/api/calendar_events/${editingCalendarEventId}`, {
          ...payload, schoolCode: schoolScopeCode,
        });
        setCalendarActionMessage("Calendar event updated successfully.");
      } else {
        await axios.post(`${BACKEND_BASE}/api/calendar_events`, {
          ...payload, schoolCode: schoolScopeCode,
        });
        setCalendarActionMessage("Calendar event saved successfully.");
      }

      setCalendarEventForm({ title: "", category: "no-class", subType: "general", notes: "" });
      setEditingCalendarEventId("");
      setShowCalendarEventModal(false);
      setCalendarModalContext("calendar");
      await fetchCalendarEvents({ forceRefresh: true });
      return true;
    } catch (error) {
      console.error("Failed to save calendar event:", error);
      notify("Failed to save calendar event.");
      return false;
    } finally {
      setCalendarEventSaving(false);
    }
  }, [
    canManageCalendar, calendarModalContext, calendarEventForm, editingCalendarEvent,
    editingCalendarEventId, selectedCalendarDay, calendarViewDate, schoolScopeCode, fetchCalendarEvents,
  ]);

  const handleEditCalendarEvent = useCallback((eventItem) => {
    if (!canManageCalendar || eventItem.isDefault) return;
    setCalendarModalContext(eventItem.showInUpcomingDeadlines ? "deadline" : "calendar");
    setShowCalendarEventModal(true);

    const ethDate = eventItem.ethiopianDate || (() => {
      const [year, month, day] = String(eventItem.gregorianDate || "").split("-").map(Number);
      if (!year || !month || !day) return null;
      return EthiopicCalendar.ge(year, month, day);
    })();

    if (ethDate?.year && ethDate?.month) {
      setCalendarViewDate({ year: ethDate.year, month: ethDate.month });
    }
    setSelectedCalendarIsoDate(eventItem.gregorianDate);
    setCalendarEventForm({
      title: eventItem.title || "",
      category: eventItem.category || (eventItem.type === "academic" ? "academic" : "no-class"),
      subType: "general",
      notes: eventItem.notes || "",
    });
    setEditingCalendarEventId(eventItem.id);
  }, [canManageCalendar]);

  const handleDeleteCalendarEvent = useCallback(async (eventItem, requestConfirm) => {
    if (!canManageCalendar) {
      setCalendarActionMessage("Only registrar or admin users can manage school calendar events.");
      return false;
    }
    if (eventItem.isDefault) {
      setCalendarActionMessage("Default Ethiopian special days cannot be deleted.");
      return false;
    }

    const eventMeta = getCalendarEventMeta(eventItem.category);
    const proceed = async () => {
      setCalendarEventSaving(true);
      try {
        await axios.delete(`${BACKEND_BASE}/api/calendar_events/${eventItem.id}`, {
          params: { schoolCode: schoolScopeCode },
        });
        if (editingCalendarEventId === eventItem.id) {
          setEditingCalendarEventId("");
          setCalendarEventForm({ title: "", category: "no-class", subType: "general", notes: "" });
        }
        setCalendarActionMessage("Calendar event deleted successfully.");
        await fetchCalendarEvents({ forceRefresh: true });
        return true;
      } catch (error) {
        console.error("Failed to delete calendar event:", error);
        setCalendarActionMessage("Failed to delete calendar event.");
        return false;
      } finally {
        setCalendarEventSaving(false);
      }
    };

    if (typeof requestConfirm === "function") {
      requestConfirm({
        message: `Delete ${eventMeta.label} on ${eventItem.gregorianDate}?`,
        onConfirm: proceed,
      });
      return true;
    }
    return proceed();
  }, [canManageCalendar, schoolScopeCode, editingCalendarEventId, fetchCalendarEvents]);

  const handleOpenCalendarEventModal = useCallback(() => {
    if (!selectedCalendarIsoDate && selectableCalendarDays.length > 0) {
      setSelectedCalendarIsoDate(selectableCalendarDays[0].isoDate);
    }
    setEditingCalendarEventId("");
    setCalendarEventForm({ title: "", category: "no-class", subType: "general", notes: "" });
    setCalendarModalContext("calendar");
    setShowCalendarEventModal(true);
  }, [selectedCalendarIsoDate, selectableCalendarDays]);

  const handleOpenDeadlineModal = useCallback(() => {
    if (!selectedCalendarIsoDate && selectableCalendarDays.length > 0) {
      setSelectedCalendarIsoDate(selectableCalendarDays[0].isoDate);
    }
    setEditingCalendarEventId("");
    setCalendarEventForm({ title: "", category: "academic", subType: "general", notes: "" });
    setCalendarModalContext("deadline");
    setShowCalendarEventModal(true);
  }, [selectedCalendarIsoDate, selectableCalendarDays]);

  const handleCloseCalendarEventModal = useCallback(() => {
    setEditingCalendarEventId("");
    setCalendarEventForm({ title: "", category: "no-class", subType: "general", notes: "" });
    setCalendarModalContext("calendar");
    setShowCalendarEventModal(false);
  }, []);

  // ---- Effects
  useEffect(() => {
    if (!calendarActionMessage) return undefined;
    const t = window.setTimeout(() => setCalendarActionMessage(""), 2600);
    return () => window.clearTimeout(t);
  }, [calendarActionMessage]);

  useEffect(() => {
    setShowAllUpcomingDeadlines(false);
  }, [schoolScopeCode]);

  useEffect(() => {
    fetchCalendarEvents();
  }, [fetchCalendarEvents]);

  useEffect(() => {
    const preferred =
      calendarDays.find((d) => d?.ethDay === calendarHighlightedDay) ||
      calendarDays.find(Boolean) ||
      null;

    if (!preferred) {
      setSelectedCalendarIsoDate("");
      return;
    }

    const stillVisible = calendarDays.some((d) => d?.isoDate === selectedCalendarIsoDate);
    if (!stillVisible) {
      setSelectedCalendarIsoDate(preferred.isoDate);
    }
  }, [calendarViewDate.year, calendarViewDate.month, calendarHighlightedDay, calendarDays, selectedCalendarIsoDate]);

  return {
    // raw state
    calendarEvents, calendarEventsLoading,
    calendarViewDate, setCalendarViewDate,
    calendarEventForm, setCalendarEventForm,
    calendarEventSaving,
    selectedCalendarIsoDate, setSelectedCalendarIsoDate,
    editingCalendarEventId, setEditingCalendarEventId,
    calendarActionMessage, setCalendarActionMessage,
    showCalendarEventModal, setShowCalendarEventModal,
    hoveredCalendarIsoDate, setHoveredCalendarIsoDate,
    calendarModalContext, setCalendarModalContext,
    showAllUpcomingDeadlines, setShowAllUpcomingDeadlines,
    canManageCalendar,

    // derived layout values
    calendarMonthLabel,
    calendarMonthStartGregorian,
    calendarMonthEndGregorian,
    calendarHighlightedDay,
    calendarDays,
    selectableCalendarDays,
    selectedCalendarDay,
    selectedCalendarEvents,
    monthlyCalendarEvents,
    upcomingDeadlineEvents,
    visibleUpcomingDeadlineEvents,
    editingCalendarEvent,

    // handlers
    fetchCalendarEvents,
    handleCalendarMonthChange,
    handleCreateCalendarEvent,
    handleEditCalendarEvent,
    handleDeleteCalendarEvent,
    handleOpenCalendarEventModal,
    handleOpenDeadlineModal,
    handleCloseCalendarEventModal,

    // helpers
    getCalendarEventMeta,
    getCalendarEventKey,
    formatCalendarDeadlineDate,

    // constants
    ETHIOPIAN_MONTHS,
    CALENDAR_WEEK_DAYS,
  };
}
