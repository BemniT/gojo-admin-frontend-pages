import { useEffect, useState } from "react";
import axios from "axios";
import { schoolNodeBase } from "../../utils/schoolDbRouting";

/**
 * useTeacherSchedule
 *
 * Loads the weekly schedule for a single teacher, filtered down from the
 * school-wide `/Schedules` node. Returns a nested map:
 *   { [day]: { [periodKey]: [{ subject, class }, ...] } }
 *
 * Re-fetches whenever the selected teacher changes AND the Schedule tab
 * is actually visible (we don't want to fetch when the user never
 * opens the Schedule tab).
 *
 * Note: the original code had a fallback to a (broken) root path
 * via undefined `getRootNodeUrl`. That fallback has been dropped —
 * if the school-scoped read fails we return an empty schedule, which
 * is what the UI was effectively doing anyway via the catch handler.
 */
export function useTeacherSchedule({ teacher, isActiveTab, schoolCode }) {
  const [schedule, setSchedule] = useState({});

  useEffect(() => {
    if (!teacher || !isActiveTab) return undefined;

    let cancelled = false;
    const teacherId = teacher.teacherId;
    const dbRoot = schoolNodeBase(schoolCode);

    (async () => {
      try {
        const res = await axios.get(`${dbRoot}/Schedules.json`);
        if (cancelled) return;

        const allSchedules = res.data || {};
        const result = {};

        Object.entries(allSchedules).forEach(([day, dayData]) => {
          Object.entries(dayData || {}).forEach(([classKey, periods]) => {
            Object.entries(periods || {}).forEach(([periodKey, entry]) => {
              if (entry && entry.teacherId === teacherId && !entry.break) {
                if (!result[day]) result[day] = {};
                if (!result[day][periodKey]) result[day][periodKey] = [];
                result[day][periodKey].push({
                  subject: entry.subject,
                  class: classKey,
                });
              }
            });
          });
        });

        if (!cancelled) setSchedule(result);
      } catch (err) {
        if (!cancelled) {
          console.error("Teacher schedule fetch failed:", err);
          setSchedule({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teacher, isActiveTab, schoolCode]);

  return { schedule };
}
