import React from "react";
import { FaCalendarAlt, FaPlus } from "react-icons/fa";
import { CALENDAR_WEEK_DAYS, ETHIOPIAN_MONTHS } from "../../../hooks/calendar/useCalendar";

// ---- Shared widget styles ----
const RIGHT_RAIL_CARD = {
  background: "var(--surface-panel)",
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08), 0 8px 20px rgba(15, 23, 42, 0.04)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
};

const WIDGET_CARD = { ...RIGHT_RAIL_CARD, padding: "12px" };

const SOFT_PANEL = {
  background: "#F8FAFC",
  border: "1px solid rgba(15, 23, 42, 0.06)",
  borderRadius: 10,
};

const SMALL_STAT = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "#F8FAFC",
  border: "1px solid rgba(15, 23, 42, 0.06)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  minWidth: 84,
};

const RIGHT_RAIL_ICON = {
  width: 34,
  height: 34,
  borderRadius: 10,
  background: "#F8FAFC",
  color: "var(--text-primary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(15, 23, 42, 0.08)",
};

const RIGHT_RAIL_ICON_BTN = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid rgba(15, 23, 42, 0.08)",
  background: "#F8FAFC",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};

const RIGHT_RAIL_PILL = {
  padding: "4px 8px",
  borderRadius: 999,
  background: "#F8FAFC",
  border: "1px solid rgba(15, 23, 42, 0.06)",
  fontSize: 9,
  color: "var(--text-secondary)",
  fontWeight: 800,
};

export default function RightSidebar({
  stats, // [{ label, value }, ...]
  todaysPostsCount,
  messageCount,
  isOverlayModalOpen,
  cal,
  navigate,
  setConfirmDialog,
}) {
  return (
    <div
      className="dashboard-widgets"
      style={{
        width: "clamp(300px, 21vw, 360px)",
        minWidth: 300,
        maxWidth: 360,
        flex: "0 0 clamp(300px, 21vw, 360px)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        position: "sticky",
        top: "calc(var(--topbar-height, 56px) + 4px)",
        alignSelf: "flex-start",
        maxHeight: "calc(100vh - var(--topbar-height, 56px) - 12px)",
        overflowY: "auto",
        overflowX: "visible",
        paddingRight: 2,
        paddingBottom: 10,
        marginLeft: 0,
        opacity: isOverlayModalOpen ? 0.45 : 1,
        filter: isOverlayModalOpen ? "blur(1px)" : "none",
        pointerEvents: isOverlayModalOpen ? "none" : "auto",
        transition: "opacity 180ms ease, filter 180ms ease",
      }}
    >
      {/* Quick Statistics */}
      <div style={WIDGET_CARD}>
        <h4 style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
          Quick Statistics
        </h4>
        <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {stats.map((stat) => (
              <div key={stat.label} style={SMALL_STAT}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>{stat.label}</div>
                <div style={{ marginTop: 3, fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Today + Calendar + Deadlines */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ ...WIDGET_CARD, padding: "10px" }}>
          <h4 style={{ fontSize: 12, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
            Today's Activity
          </h4>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", ...SOFT_PANEL, padding: "7px 8px", fontSize: 10 }}>
              <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>New Posts</span>
              <strong style={{ color: "var(--text-primary)" }}>{todaysPostsCount}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", ...SOFT_PANEL, padding: "7px 8px", fontSize: 10 }}>
              <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Messages</span>
              <strong style={{ color: "var(--text-primary)" }}>{messageCount}</strong>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
              Recent Contacts
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", ...SOFT_PANEL, padding: "7px 8px", lineHeight: 1.45 }}>
                Disabled on this page to reduce Firebase background downloads.
              </div>
              <button
                type="button"
                onClick={() => navigate("/all-chat")}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", width: "100%",
                  textAlign: "center", ...SOFT_PANEL, padding: "8px 10px",
                  cursor: "pointer", color: "var(--text-primary)", fontSize: 10, fontWeight: 800,
                }}
              >
                Open Messages
              </button>
            </div>
          </div>
        </div>

        {/* School Calendar */}
        <div style={{ ...RIGHT_RAIL_CARD, overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", top: -34, right: -24, width: 104, height: 104, borderRadius: "50%", background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 10%, transparent) 0%, transparent 74%)", pointerEvents: "none" }} />
          <div style={{ padding: "14px 14px 12px", background: "var(--surface-panel)", borderBottom: "1px solid rgba(15, 23, 42, 0.08)", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={RIGHT_RAIL_ICON}>
                  <FaCalendarAlt style={{ width: 14, height: 14 }} />
                </div>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 900, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                    School Calendar
                  </h4>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 3, fontWeight: 800 }}>
                    {cal.calendarMonthLabel}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2, fontWeight: 500 }}>
                    {`${cal.calendarMonthStartGregorian.day}/${cal.calendarMonthStartGregorian.month}/${cal.calendarMonthStartGregorian.year} - ${cal.calendarMonthEndGregorian.day}/${cal.calendarMonthEndGregorian.month}/${cal.calendarMonthEndGregorian.year}`}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <button type="button" onClick={() => cal.handleCalendarMonthChange(-1)} style={{ ...RIGHT_RAIL_ICON_BTN, fontSize: 17 }} aria-label="Previous month" title="Previous month">‹</button>
                <button type="button" onClick={() => cal.handleCalendarMonthChange(1)} style={{ ...RIGHT_RAIL_ICON_BTN, fontSize: 17 }} aria-label="Next month" title="Next month">›</button>
              </div>
            </div>
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
              <div style={{ ...RIGHT_RAIL_PILL, color: "var(--text-primary)" }}>
                {cal.monthlyCalendarEvents.length} event{cal.monthlyCalendarEvents.length === 1 ? "" : "s"}
              </div>
              <div style={{ ...RIGHT_RAIL_PILL, color: cal.canManageCalendar ? "var(--text-primary)" : "var(--text-secondary)" }}>
                {cal.canManageCalendar ? "Manage access" : "View only"}
              </div>
            </div>
          </div>

          {/* Calendar grid */}
          <div style={{ background: "var(--surface-muted)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, marginBottom: 6 }}>
              {CALENDAR_WEEK_DAYS.map((day) => (
                <div key={day} style={{ textAlign: "center", fontSize: 9, fontWeight: 800, color: "var(--text-muted)", letterSpacing: "0.03em", textTransform: "uppercase" }}>
                  {day}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
              {cal.calendarDays.map((day, index) => {
                const isToday = day?.ethDay === cal.calendarHighlightedDay;
                const dayOfWeek = index % 7;
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const primaryEvent = day?.events?.[0] || null;
                const isNoClass = primaryEvent?.category === "no-class";
                const isAcademic = primaryEvent?.category === "academic";
                const isSelected = day?.isoDate === cal.selectedCalendarIsoDate;
                const isHovered = day?.isoDate === cal.hoveredCalendarIsoDate;
                const dayBackground = day
                  ? isToday
                    ? "var(--accent-soft)"
                    : isSelected
                      ? "color-mix(in srgb, var(--accent-soft) 72%, white 28%)"
                      : isNoClass
                        ? "color-mix(in srgb, var(--warning-soft) 58%, white 42%)"
                        : isAcademic
                          ? "color-mix(in srgb, var(--accent-soft) 46%, white 54%)"
                          : isWeekend
                            ? "color-mix(in srgb, var(--surface-muted) 82%, white 18%)"
                            : "var(--surface-panel)"
                  : "transparent";

                return (
                  <button
                    type="button"
                    key={`${day?.ethDay || "blank"}-${index}`}
                    onClick={() => day && cal.setSelectedCalendarIsoDate(day.isoDate)}
                    onMouseEnter={() => day && cal.setHoveredCalendarIsoDate(day.isoDate)}
                    onMouseLeave={() => cal.setHoveredCalendarIsoDate("")}
                    onFocus={() => day && cal.setHoveredCalendarIsoDate(day.isoDate)}
                    onBlur={() => cal.setHoveredCalendarIsoDate("")}
                    title={day?.events?.length ? day.events.map((e) => e.title).join(", ") : ""}
                    style={{
                      minHeight: 0,
                      aspectRatio: "1 / 1",
                      borderRadius: 10,
                      border: isToday ? "1px solid var(--accent)"
                        : isSelected ? "1px solid var(--accent-strong)"
                          : isHovered ? "1px solid var(--border-strong)"
                            : isNoClass ? "1px solid var(--warning-border)"
                              : "1px solid var(--border-soft)",
                      background: dayBackground,
                      color: isToday ? "var(--accent-strong)" : day ? "var(--text-secondary)" : "transparent",
                      fontSize: 10,
                      fontWeight: isToday ? 800 : 700,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 1,
                      padding: "5px 2px",
                      boxShadow: day && isSelected ? "0 8px 18px rgba(0, 122, 251, 0.12)" : "none",
                      cursor: day ? "pointer" : "default",
                      outline: "none",
                      transform: day && isSelected ? "translateY(-2px) scale(1.03)" : day && isHovered ? "translateY(-1px)" : "translateY(0)",
                      transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease, color 160ms ease",
                      position: "relative",
                      overflow: "hidden",
                    }}
                    disabled={!day}
                  >
                    {day ? (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 800, color: isToday || isSelected ? "var(--accent-strong)" : "var(--text-primary)", lineHeight: 1 }}>
                          {day.ethDay}
                        </div>
                        <div style={{ fontSize: 8, color: isSelected ? "var(--accent)" : "var(--text-muted)", lineHeight: 1 }}>
                          {day.gregorianDate.day}/{day.gregorianDate.month}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 2, minHeight: 6 }}>
                          {day.events.slice(0, 2).map((ev) => (
                            <span key={ev.id} style={{ width: 5, height: 5, borderRadius: "50%", background: cal.getCalendarEventMeta(ev.category).color }} />
                          ))}
                        </div>
                      </>
                    ) : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend + add */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, marginLeft: 10, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "var(--text-secondary)", fontWeight: 800, background: "var(--surface-panel)", border: "1px solid var(--warning-border)", borderRadius: 999, padding: "5px 8px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warning)" }} /> No class
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "var(--text-secondary)", fontWeight: 800, background: "var(--surface-panel)", border: "1px solid var(--border-strong)", borderRadius: 999, padding: "5px 8px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} /> Academic
            </div>
            {cal.canManageCalendar ? (
              <button
                type="button"
                onClick={cal.handleOpenCalendarEventModal}
                style={{ ...RIGHT_RAIL_ICON_BTN, width: 30, height: 30, borderRadius: 999, color: "var(--text-primary)" }}
                aria-label="Add school calendar event"
                title="Add school calendar event"
              >
                <FaPlus style={{ width: 12, height: 12 }} />
              </button>
            ) : null}
          </div>

          {cal.calendarActionMessage ? (
            <div style={{ marginTop: 10, borderRadius: 12, border: "1px solid var(--border-strong)", background: "var(--accent-soft)", color: "var(--accent-strong)", fontSize: 10, fontWeight: 800, padding: "8px 10px" }}>
              {cal.calendarActionMessage}
            </div>
          ) : null}

          {/* Selected day events */}
          <div style={{ marginTop: 12, background: "var(--surface-panel)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: "var(--text-primary)" }}>
                  {cal.selectedCalendarDay
                    ? `${ETHIOPIAN_MONTHS[cal.calendarViewDate.month - 1]} ${cal.selectedCalendarDay.ethDay}, ${cal.calendarViewDate.year}`
                    : "Select a date"}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                  {cal.selectedCalendarDay
                    ? `Gregorian ${cal.selectedCalendarDay.gregorianDate.day}/${cal.selectedCalendarDay.gregorianDate.month}/${cal.selectedCalendarDay.gregorianDate.year}`
                    : "Choose a day to view or add calendar events."}
                </div>
              </div>
              {cal.calendarEventsLoading && (
                <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 700 }}>Loading...</div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {cal.selectedCalendarEvents.length === 0 ? (
                <div style={{ fontSize: 9, color: "var(--text-muted)", background: "var(--surface-muted)", borderRadius: 10, border: "1px solid var(--border-soft)", padding: "7px 9px" }}>
                  No school events on this day.
                </div>
              ) : (
                cal.selectedCalendarEvents.map((eventItem) => {
                  const eventMeta = cal.getCalendarEventMeta(eventItem.category);
                  return (
                    <div
                      key={eventItem.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 7,
                        background: "var(--surface-panel)",
                        border: `1px solid ${eventMeta.border}`,
                        borderRadius: 10,
                        padding: "7px 8px",
                      }}
                    >
                      <span style={{ width: 8, height: 8, marginTop: 4, borderRadius: "50%", background: eventMeta.color, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-primary)" }}>{eventItem.title}</div>
                          {eventItem.isDefault ? (
                            <span style={{ padding: "2px 6px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent-strong)", fontSize: 9, fontWeight: 800 }}>
                              Default
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{eventMeta.label}</div>
                        {eventItem.notes ? (
                          <div style={{ fontSize: 9, color: "var(--text-secondary)", marginTop: 3 }}>{eventItem.notes}</div>
                        ) : null}
                      </div>
                      {cal.canManageCalendar && !eventItem.isDefault ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => cal.handleEditCalendarEvent(eventItem)}
                            style={{ height: 26, padding: "0 9px", borderRadius: 8, border: "1px solid var(--border-soft)", background: "var(--surface-panel)", color: "var(--text-secondary)", fontSize: 9, fontWeight: 800, cursor: "pointer" }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => cal.handleDeleteCalendarEvent(eventItem, setConfirmDialog)}
                            disabled={cal.calendarEventSaving}
                            style={{ height: 26, padding: "0 9px", borderRadius: 8, border: "1px solid var(--danger-border)", background: "var(--surface-panel)", color: "var(--danger)", fontSize: 9, fontWeight: 800, cursor: cal.calendarEventSaving ? "not-allowed" : "pointer" }}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div style={WIDGET_CARD}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <h4 style={{ fontSize: 13, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Upcoming Deadlines
            </h4>
            {cal.canManageCalendar ? (
              <button
                type="button"
                onClick={cal.handleOpenDeadlineModal}
                style={{ ...RIGHT_RAIL_ICON_BTN, borderRadius: 999, color: "var(--text-primary)" }}
                aria-label="Add upcoming deadline"
                title="Add upcoming deadline"
              >
                <FaPlus style={{ width: 11, height: 11 }} />
              </button>
            ) : null}
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {cal.calendarEventsLoading ? (
              <div style={{ padding: "8px 9px", borderRadius: 10, border: "1px solid rgba(15, 23, 42, 0.06)", background: "#F8FAFC", fontSize: 10, color: "var(--text-muted)", fontWeight: 700 }}>
                Loading deadlines...
              </div>
            ) : cal.upcomingDeadlineEvents.length === 0 ? (
              <div style={{ padding: "8px 9px", borderRadius: 10, border: "1px solid rgba(15, 23, 42, 0.06)", background: "#F8FAFC", fontSize: 10, color: "var(--text-muted)" }}>
                No upcoming deadlines in the next 30 days.
                {cal.canManageCalendar ? (
                  <button
                    type="button"
                    onClick={cal.handleOpenDeadlineModal}
                    style={{ marginTop: 8, height: 28, padding: "0 10px", borderRadius: 999, border: "1px solid rgba(15, 23, 42, 0.08)", background: "var(--surface-panel)", color: "var(--text-primary)", fontSize: 9, fontWeight: 800, cursor: "pointer" }}
                  >
                    Add deadline
                  </button>
                ) : null}
              </div>
            ) : (
              cal.visibleUpcomingDeadlineEvents.map((eventItem) => {
                const eventMeta = cal.getCalendarEventMeta(eventItem.category);
                return (
                  <div
                    key={`deadline-${eventItem.id}`}
                    style={{
                      padding: "8px 9px",
                      borderRadius: 10,
                      border: `1px solid ${eventMeta.border}`,
                      background: "var(--surface-muted)",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: eventMeta.color, flexShrink: 0 }} />
                        <span>{eventItem.title?.trim() || eventItem.notes?.trim() || "Academic deadline"}</span>
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>
                        {eventMeta.label}
                        {eventItem.ethiopianDate?.month && eventItem.ethiopianDate?.day
                          ? ` • ${ETHIOPIAN_MONTHS[eventItem.ethiopianDate.month - 1]} ${eventItem.ethiopianDate.day}`
                          : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {cal.formatCalendarDeadlineDate(eventItem.gregorianDate)}
                    </div>
                  </div>
                );
              })
            )}
            {!cal.calendarEventsLoading && cal.upcomingDeadlineEvents.length > 3 ? (
              <button
                type="button"
                onClick={() => cal.setShowAllUpcomingDeadlines((v) => !v)}
                style={{ alignSelf: "flex-start", height: 28, padding: "0 10px", borderRadius: 999, border: "1px solid var(--border-soft)", background: "var(--surface-panel)", color: "var(--accent-strong)", fontSize: 9, fontWeight: 800, cursor: "pointer" }}
              >
                {cal.showAllUpcomingDeadlines ? "See less" : `See more (${cal.upcomingDeadlineEvents.length - 3})`}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Sponsored Links */}
      <div style={WIDGET_CARD}>
        <h4 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
          Sponsored Links
        </h4>
        <ul style={{ margin: "10px 0 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7, fontSize: 13 }}>
          <li style={{ ...SOFT_PANEL, color: "var(--text-primary)", fontWeight: 700, padding: "8px 10px" }}>Gojo Study App</li>
          <li style={{ ...SOFT_PANEL, color: "var(--text-primary)", fontWeight: 700, padding: "8px 10px" }}>Finance Portal</li>
          <li style={{ ...SOFT_PANEL, color: "var(--text-primary)", fontWeight: 700, padding: "8px 10px" }}>HR Management</li>
        </ul>
      </div>
    </div>
  );
}
