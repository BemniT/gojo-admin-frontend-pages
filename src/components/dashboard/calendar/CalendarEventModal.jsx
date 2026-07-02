import React from "react";
import { CALENDAR_WEEK_DAYS, ETHIOPIAN_MONTHS } from "../../../hooks/calendar/useCalendar";

export default function CalendarEventModal({ cal, adminUserId }) {
  if (!cal.showCalendarEventModal) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--text-primary) 26%, transparent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 1200,
      }}
      onClick={cal.handleCloseCalendarEventModal}
    >
      <div
        style={{
          width: "min(470px, 100%)",
          background: "var(--surface-panel)",
          borderRadius: 20,
          border: "1px solid var(--border-soft)",
          boxShadow: "var(--shadow-panel)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 16px 12px", background: "linear-gradient(180deg, var(--surface-overlay) 0%, var(--surface-panel) 100%)", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text-primary)" }}>
              {cal.editingCalendarEventId
                ? "Edit school calendar event"
                : cal.calendarModalContext === "deadline"
                  ? "Add upcoming deadline"
                  : "Add school calendar event"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
              {cal.selectedCalendarDay
                ? cal.calendarModalContext === "deadline"
                  ? `Choose the date for this upcoming deadline in ${ETHIOPIAN_MONTHS[cal.calendarViewDate.month - 1]}`
                  : `For Ethiopic day ${cal.selectedCalendarDay.ethDay} in ${ETHIOPIAN_MONTHS[cal.calendarViewDate.month - 1]}`
                : "Select a day in the calendar first."}
            </div>
          </div>
          <button
            type="button"
            onClick={cal.handleCloseCalendarEventModal}
            style={{ width: 34, height: 34, borderRadius: 999, border: "1px solid var(--border-soft)", background: "var(--surface-overlay)", color: "var(--text-secondary)", fontSize: 20, lineHeight: 1, cursor: "pointer" }}
            aria-label="Close calendar event modal"
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {!cal.canManageCalendar ? (
            <div style={{ fontSize: 10, color: "var(--warning)", background: "var(--warning-soft)", border: "1px solid var(--warning-border)", borderRadius: 10, padding: "8px 10px" }}>
              View only. Registrar or admin access is required to add, edit, or delete school calendar events.
            </div>
          ) : null}

          <div style={{ border: "1px solid var(--border-soft)", borderRadius: 16, padding: 10, background: "linear-gradient(180deg, var(--surface-overlay) 0%, var(--surface-panel) 100%)", boxShadow: "var(--shadow-soft)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: "var(--text-primary)" }}>Choose day from calendar</div>
                <div style={{ fontSize: 9, color: "var(--text-secondary)", marginTop: 2, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{cal.calendarMonthLabel}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button type="button" onClick={() => cal.handleCalendarMonthChange(-1)} style={{ width: 28, height: 28, borderRadius: 9, border: "1px solid var(--border-soft)", background: "var(--surface-overlay)", color: "var(--text-primary)", cursor: "pointer", fontSize: 16 }}>‹</button>
                <button type="button" onClick={() => cal.handleCalendarMonthChange(1)} style={{ width: 28, height: 28, borderRadius: 9, border: "1px solid var(--border-soft)", background: "var(--surface-overlay)", color: "var(--text-primary)", cursor: "pointer", fontSize: 16 }}>›</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, marginBottom: 5 }}>
              {CALENDAR_WEEK_DAYS.map((d) => (
                <div key={d} style={{ textAlign: "center", fontSize: 8, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase" }}>{d}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
              {cal.calendarDays.map((day, index) => {
                const isSelected = day?.isoDate === cal.selectedCalendarIsoDate;
                const hasEvents = (day?.events?.length || 0) > 0;
                const isTodayDay = day?.ethDay === cal.calendarHighlightedDay;
                return (
                  <button
                    key={`${day?.isoDate || "blank"}-${index}`}
                    type="button"
                    onClick={() => day && cal.setSelectedCalendarIsoDate(day.isoDate)}
                    disabled={!day || !cal.canManageCalendar}
                    style={{
                      minHeight: 0,
                      aspectRatio: "1 / 1",
                      borderRadius: 10,
                      border: isTodayDay ? "1px solid var(--accent)" : isSelected ? "1px solid var(--accent-strong)" : hasEvents ? "1px solid var(--warning-border)" : "1px solid transparent",
                      background: !day ? "transparent" : isTodayDay ? "var(--accent-soft)" : isSelected ? "var(--surface-overlay)" : hasEvents ? "var(--warning-soft)" : "var(--surface-panel)",
                      color: !day ? "transparent" : "var(--text-primary)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 1,
                      cursor: day && cal.canManageCalendar ? "pointer" : "default",
                      padding: "4px 2px",
                    }}
                  >
                    {day ? (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 800 }}>{day.ethDay}</div>
                        <div style={{ fontSize: 8, color: "var(--text-secondary)" }}>{day.gregorianDate.day}/{day.gregorianDate.month}</div>
                      </>
                    ) : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {cal.calendarModalContext === "deadline" ? (
            <div style={{ height: 42, borderRadius: 12, border: "1px solid var(--success-border)", padding: "0 12px", fontSize: 12, color: "var(--success)", background: "var(--success-soft)", display: "flex", alignItems: "center", fontWeight: 800 }}>
              Academic deadline
            </div>
          ) : (
            <select
              value={cal.calendarEventForm.category}
              onChange={(e) => cal.setCalendarEventForm((prev) => ({ ...prev, category: e.target.value, subType: "general" }))}
              disabled={!cal.canManageCalendar}
              style={{ height: 42, borderRadius: 12, border: "1px solid var(--input-border)", padding: "0 12px", fontSize: 12, color: "var(--text-primary)", background: "var(--input-bg)" }}
            >
              <option value="no-class">No class day</option>
              <option value="academic">Academic day</option>
            </select>
          )}

          {cal.calendarModalContext === "deadline" ? (
            <input
              type="text"
              value={cal.calendarEventForm.title}
              onChange={(e) => cal.setCalendarEventForm((prev) => ({ ...prev, title: e.target.value }))}
              disabled={!cal.canManageCalendar}
              placeholder="Deadline title"
              style={{ height: 42, borderRadius: 12, border: "1px solid var(--input-border)", padding: "0 12px", fontSize: 12, color: "var(--text-primary)", background: "var(--input-bg)" }}
            />
          ) : null}

          <textarea
            value={cal.calendarEventForm.notes}
            onChange={(e) => cal.setCalendarEventForm((prev) => ({ ...prev, notes: e.target.value }))}
            disabled={!cal.canManageCalendar}
            placeholder={cal.calendarModalContext === "deadline" ? "Optional deadline note" : "Optional note"}
            rows={3}
            style={{ borderRadius: 12, border: "1px solid var(--input-border)", padding: 12, fontSize: 12, color: "var(--text-primary)", background: "var(--input-bg)", resize: "vertical" }}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            <button
              type="button"
              onClick={() => cal.handleCreateCalendarEvent({ adminUserId })}
              disabled={cal.calendarEventSaving || !cal.selectedCalendarDay || !cal.canManageCalendar}
              style={{
                flex: "1 1 180px",
                height: 42,
                borderRadius: 12,
                border: "none",
                background: cal.calendarEventSaving || !cal.selectedCalendarDay || !cal.canManageCalendar
                  ? "var(--surface-strong)"
                  : "linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 900,
                cursor: cal.calendarEventSaving || !cal.selectedCalendarDay || !cal.canManageCalendar ? "not-allowed" : "pointer",
              }}
            >
              {cal.calendarEventSaving ? "Saving..." : cal.editingCalendarEventId ? "Update calendar event" : "Save calendar event"}
            </button>
            <button
              type="button"
              onClick={cal.handleCloseCalendarEventModal}
              style={{ height: 42, padding: "0 14px", borderRadius: 12, border: "1px solid var(--border-soft)", background: "var(--surface-overlay)", color: "var(--text-primary)", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
