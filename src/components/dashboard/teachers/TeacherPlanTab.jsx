import React from "react";
import {
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
  FaCheckCircle,
  FaClock,
} from "react-icons/fa";
import LessonPlanInsightsModal from "../../LessonPlanInsightsModal";

const DAY_ORDER = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTH_INDEX_MAP = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/**
 * TeacherPlanTab
 *
 * The "Plan" tab inside the teacher detail sidebar. Renders the lesson-plan
 * overview (weekly stats, course filter), a daily/weekly/monthly switcher,
 * and the Annual Lesson Plan modal trigger. Pure presentational shell — all
 * data fetching, state, and refresh handlers are owned by the parent
 * Teachers page and passed in as props.
 */
export default function TeacherPlanTab({
  selectedTeacher,
  // plan data
  planWeeks,
  planCurrentWeeks,
  planSubmittedKeys,
  planSubmittedEntries,
  teacherDailyPlans,
  planCourseLabelMap,
  planLoading,
  planError,
  // selection + ui state
  planSelectedCourseId,
  setPlanSelectedCourseId,
  planSidebarTab,
  setPlanSidebarTab,
  planSidebarOpen,
  setPlanSidebarOpen,
  planAnnualOpen,
  setPlanAnnualOpen,
  planShowSubmittedTable,
  setPlanShowSubmittedTable,
  isPortrait,
  // actions
  refreshPlans,
}) {
  if (!selectedTeacher) return null;

  const teacherUserId = selectedTeacher?.userId;
  const teacherSubmissionId = String(selectedTeacher?.teacherId || teacherUserId || '').trim();
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const todayIndex = today.getDay();
  const currentMonthName = today.toLocaleDateString('en-US', { month: 'long' });

  const normalizeWeekForKey = (val) => {
    if (val === undefined || val === null) return '';
    const s = String(val).trim();
    if (!s) return '';
    const m = s.match(/\d+/);
    return m ? m[0] : s;
  };

  const normalizeDayForKey = (dayName) => String(dayName || '').trim().toLowerCase();

  const canonicalSubmissionKey = (teacherId, courseId, weekVal, dayName) => {
    const t = String(teacherId || '').trim();
    const c = String(courseId || '').trim();
    return `${t}::${c}::${normalizeWeekForKey(weekVal)}::${normalizeDayForKey(dayName)}`;
  };

  const submittedKeySet = new Set(
    (planSubmittedKeys || []).flatMap((k) => {
      const raw = String(k).trim();
      const parts = raw.split('::');
      if (parts.length >= 4) {
        const [tId, cId, wk, dn] = parts.map((p) => String(p ?? '').trim());
        return [raw, canonicalSubmissionKey(tId, cId, wk, dn)];
      }
      return [raw];
    })
  );

  const allCourseIds = Array.from(new Set([
    ...(Array.isArray(planWeeks) ? planWeeks.map((w) => String(w?.courseId || '')).filter(Boolean) : []),
    ...(Array.isArray(planCurrentWeeks) ? planCurrentWeeks.map((w) => String(w?.courseId || '')).filter(Boolean) : []),
    ...(Array.isArray(teacherDailyPlans) ? teacherDailyPlans.map((p) => String(p?.courseId || '')).filter(Boolean) : []),
  ]));

  const courseOptions = [
    { value: 'all', label: 'All Subjects' },
    ...allCourseIds.map((id) => ({
      value: id,
      label: planCourseLabelMap?.[id] || id,
    })),
  ];

  const selectedCourseLabel = planSelectedCourseId === 'all'
    ? 'All Subjects'
    : (planCourseLabelMap?.[planSelectedCourseId] || planSelectedCourseId);

  const visibleDailyPlans = planSelectedCourseId === 'all'
    ? (teacherDailyPlans || [])
    : (teacherDailyPlans || []).filter((p) => String(p?.courseId || '') === String(planSelectedCourseId));

  const visibleCurrentWeeks = planSelectedCourseId === 'all'
    ? (planCurrentWeeks || [])
    : (planCurrentWeeks || []).filter((w) => String(w?.courseId || '') === String(planSelectedCourseId));

  const visiblePlanWeeks = planSelectedCourseId === 'all'
    ? (planWeeks || [])
    : (planWeeks || []).filter((w) => String(w?.courseId || '') === String(planSelectedCourseId));

  const fetchedPlanRows = (visiblePlanWeeks || [])
    .slice()
    .sort((a, b) => {
      const aw = Number(String(a?.week ?? '').match(/\d+/)?.[0] ?? 0);
      const bw = Number(String(b?.week ?? '').match(/\d+/)?.[0] ?? 0);
      if (aw !== bw) return bw - aw;
      const am = String(a?.month || '').toLowerCase();
      const bm = String(b?.month || '').toLowerCase();
      return am.localeCompare(bm);
    })
    .slice(0, 8);

  const getScheduledIndex = (dayName) => {
    const lname = (dayName || '').toString().toLowerCase();
    return Object.prototype.hasOwnProperty.call(DAY_ORDER, lname) ? DAY_ORDER[lname] : null;
  };

  const buildSubmissionKeyCandidates = (courseId, weekVal, dayName, dayIdx = null) => {
    const teacherToken = teacherSubmissionId || 'anon';
    const courseToken = courseId || 'nocourse';
    const dayToken = String(dayName || dayIdx || '').trim();
    const raw = `${teacherToken}::${courseToken}::${weekVal || ''}::${dayToken}`;
    const canonical = canonicalSubmissionKey(teacherToken, courseToken, weekVal || '', dayToken);
    return Array.from(new Set([raw, canonical].filter(Boolean)));
  };

  const buildSubmissionKey = (courseId, weekVal, dayName, dayIdx = null) => {
    const candidates = buildSubmissionKeyCandidates(courseId, weekVal, dayName, dayIdx);
    return candidates[1] || candidates[0] || '';
  };

  const getDayStatus = (courseId, weekVal, day, dayIdx = null) => {
    const dayName = (day?.dayName || '').toString();
    const iso = (day?.date || '').toString().slice(0, 10);
    const scheduledIndex = getScheduledIndex(dayName);
    const candidateKeys = buildSubmissionKeyCandidates(courseId, weekVal, dayName, dayIdx);
    const matchedKey = candidateKeys.find((k) => submittedKeySet.has(k)) || buildSubmissionKey(courseId, weekVal, dayName, dayIdx);
    const submitted = candidateKeys.some((k) => submittedKeySet.has(k));
    if (submitted) return { status: 'submitted', key: matchedKey };

    if (iso && iso < todayISO) return { status: 'missed', key: matchedKey };
    if (scheduledIndex !== null && scheduledIndex < todayIndex) return { status: 'missed', key: matchedKey };
    return { status: 'pending', key: matchedKey };
  };

  const activeWeekBlock = (visibleCurrentWeeks || [])[0] || null;
  const activeWeekDays = activeWeekBlock?.weekDays || [];

  const weekStats = (() => {
    const stats = { submitted: 0, missed: 0, pending: 0, total: 0 };
    (activeWeekDays || []).forEach((d, di) => {
      const ds = getDayStatus(activeWeekBlock?.courseId, activeWeekBlock?.week, d, di);
      stats[ds.status] = (stats[ds.status] || 0) + 1;
      stats.total += 1;
    });
    return stats;
  })();

  const monthIndexFromLabel = (label) => {
    if (!label) return null;
    const raw = String(label).trim();
    if (!raw) return null;

    const digits = raw.replace(/[^0-9]/g, '');
    if (digits) {
      const m = parseInt(digits, 10);
      if (m >= 1 && m <= 12) return m - 1;
    }

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const idx = monthNames.findIndex((m) => m.toLowerCase() === raw.toLowerCase());
    if (idx !== -1) return idx;

    const tryDt = new Date(`${raw} 1, 2026`);
    if (!Number.isNaN(tryDt.getTime())) return tryDt.getMonth();
    return null;
  };

  const monthlyGroups = (visiblePlanWeeks || []).reduce((acc, row) => {
    const monthKey = String(row?.month || '').trim() || 'Unspecified';
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(row);
    return acc;
  }, {});

  const currentMonthKey = (() => {
    const keys = Object.keys(monthlyGroups || {});
    if (!keys.length) return null;
    const nowIdx = new Date().getMonth();
    const exact = keys.find((k) => k.toLowerCase().trim() === currentMonthName.toLowerCase());
    if (exact) return exact;
    return keys.find((k) => monthIndexFromLabel(k) === nowIdx) || null;
  })();

  const currentMonthWeeks = currentMonthKey ? (monthlyGroups?.[currentMonthKey] || []) : [];

  const monthlyCount = currentMonthWeeks.length;

  const monthStats = (() => {
    const stats = { submitted: 0, missed: 0, pending: 0, total: 0, topics: [] };
    (currentMonthWeeks || []).forEach((w) => {
      if (w?.topic) stats.topics.push(w.topic);
      (w?.weekDays || []).forEach((d, di) => {
        const ds = getDayStatus(w?.courseId, w?.week, d, di);
        stats[ds.status] = (stats[ds.status] || 0) + 1;
        stats.total += 1;
        if (d?.topic) stats.topics.push(d.topic);
      });
    });
    stats.topics = Array.from(new Set(stats.topics.filter(Boolean)));
    return stats;
  })();

  const monthPct = monthStats.total ? Math.round((monthStats.submitted / monthStats.total) * 100) : 0;
  const weekCompletionRate = weekStats.total ? Math.round((weekStats.submitted / weekStats.total) * 100) : 0;

  const planMetaByKey = (() => {
    const out = {};
    (planWeeks || []).forEach((wk) => {
      const courseId = String(wk?.courseId || '').trim();
      (wk?.weekDays || []).forEach((d, di) => {
        const keys = buildSubmissionKeyCandidates(courseId, wk?.week, d?.dayName || '', di);
        keys.forEach((key) => {
          if (out[key]) return;
          out[key] = {
            topic: d?.topic || wk?.topic || '',
            method: d?.method || wk?.method || '',
            aids: d?.aids || wk?.material || wk?.materials || wk?.aids || '',
            assessment: d?.assessment || wk?.assessment || '',
            date: d?.date || '',
            month: wk?.month || '',
          };
        });
      });
    });
    return out;
  })();

  const getMonthIndex = (m) => {
    const key = (m || '').toString().trim().toLowerCase();
    return MONTH_INDEX_MAP[key] || 999;
  };

  const annualWeeks = Array.isArray(visiblePlanWeeks) ? visiblePlanWeeks : [];
  const annualByMonth = annualWeeks.reduce((acc, w) => {
    const monthKey = (w?.month || '').toString().trim() || 'Other';
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(w);
    return acc;
  }, {});

  const annualMonthKeys = Object.keys(annualByMonth).sort((a, b) => {
    const ai = getMonthIndex(a);
    const bi = getMonthIndex(b);
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });

  const getWeekSortValue = (w) => {
    const raw = w?.week;
    if (raw === undefined || raw === null) return 9999;
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
    const m = String(raw).match(/\d+/);
    return m ? Number(m[0]) : 9999;
  };

  const downloadAnnualExcel = () => {
    try {
      const normalizeText = (v) => {
        if (v === undefined || v === null) return '';
        if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean).join('; ');
        return String(v).trim();
      };

      const uniqJoin = (vals) => {
        const out = Array.from(new Set((vals || []).map((x) => normalizeText(x)).filter(Boolean)));
        return out.join('; ');
      };

      const escapeHtml = (s) => {
        return String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      const rows = [];
      annualMonthKeys.forEach((mKey) => {
        const monthWeeks = (annualByMonth[mKey] || []).slice().sort((a, b) => getWeekSortValue(a) - getWeekSortValue(b));
        monthWeeks.forEach((wk) => {
          const weekLabel = wk?.week ? `Week ${wk.week}` : '-';
          const days = Array.isArray(wk?.weekDays) ? wk.weekDays : [];

          const topic = normalizeText(wk?.topic) || uniqJoin(days.map((d) => d?.topic));
          const objective =
            normalizeText(wk?.objective) ||
            normalizeText(wk?.objectives) ||
            uniqJoin(days.map((d) => d?.objective ?? d?.objectives));
          const method = normalizeText(wk?.method) || uniqJoin(days.map((d) => d?.method));
          const material =
            normalizeText(wk?.material) ||
            normalizeText(wk?.materials) ||
            normalizeText(wk?.aids) ||
            uniqJoin(days.map((d) => d?.material ?? d?.materials ?? d?.aids));
          const assessment = normalizeText(wk?.assessment) || uniqJoin(days.map((d) => d?.assessment));

          const agg = (() => {
            const c = { submitted: 0, missed: 0, pending: 0, total: 0 };
            (days || []).forEach((d) => {
              const ds = getDayStatus(wk?.courseId, wk?.week, d);
              c[ds.status] = (c[ds.status] || 0) + 1;
              c.total += 1;
            });
            return c;
          })();

          const status = agg.missed > 0 ? 'missed' : (agg.submitted > 0 ? 'submitted' : 'pending');

          rows.push({
            month: mKey,
            week: weekLabel,
            topic,
            objective,
            method,
            material,
            assessment,
            status,
          });
        });
      });

      if (!rows.length) return;

      const teacherLabel = (selectedTeacher?.fullName || selectedTeacher?.name || selectedTeacher?.userId || 'teacher').toString();
      const safeTeacher = teacherLabel.replace(/[\\/:*?"<>|]/g, '_');
      const safeCourse = (selectedCourseLabel || 'all').toString().replace(/[\\/:*?"<>|]/g, '_');
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = `Annual_Lesson_Plan_${safeTeacher}_${safeCourse}_${dateStamp}.xls`;

      const exportYear = '2025/26';

      const selectedLabel = (selectedCourseLabel || '').toString();
      const parsed = (() => {
        if (!selectedLabel || planSelectedCourseId === 'all') {
          return { subject: 'All Subjects', gradeSection: '' };
        }

        const parts = selectedLabel.split('•').map((s) => s.trim()).filter(Boolean);
        const subject = parts[0] || selectedLabel;
        const meta = parts[1] || '';
        if (!meta) return { subject, gradeSection: '' };

        const m = meta.match(/Grade\s*(\d+)\s*(.*)$/i);
        if (!m) return { subject, gradeSection: meta };
        const grade = m[1] ? `Grade ${m[1]}` : '';
        const section = (m[2] || '').trim();
        const gradeSection = [grade, section].filter(Boolean).join(' ');
        return { subject, gradeSection };
      })();

      const css = `
        table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 12pt; }
        th, td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
        th { background: #f1f5f9; font-weight: 700; }
      `;

      const header = ['Month', 'Week', 'Topic', 'Objective', 'Method', 'Material', 'Assessment'];
      const metaHtml = `
        <div style="font-family: Calibri, Arial, sans-serif; font-size: 12pt;">
          <div><strong>Teacher Name:</strong> ${escapeHtml(teacherLabel)}</div>
          <div><strong>Grade &amp; Section:</strong> ${escapeHtml(parsed.gradeSection || '-')}</div>
          <div><strong>Subject:</strong> ${escapeHtml(parsed.subject || selectedLabel || '-')}</div>
          <div><strong>Year:</strong> ${escapeHtml(exportYear)}</div>
        </div>
        <br />
      `;
      const tableHtml = `
        <table>
          <thead>
            <tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const bg = r.status === 'missed' ? '#FEE2E2' : (r.status === 'submitted' ? '#DCFCE7' : '#FFFFFF');
              return (
              `<tr style="background-color:${bg};">
                <td>${escapeHtml(r.month)}</td>
                <td>${escapeHtml(r.week)}</td>
                <td>${escapeHtml(r.topic || '-') }</td>
                <td>${escapeHtml(r.objective || '-') }</td>
                <td>${escapeHtml(r.method || '-') }</td>
                <td>${escapeHtml(r.material || '-') }</td>
                <td>${escapeHtml(r.assessment || '-') }</td>
              </tr>`
              );
            }).join('')}
          </tbody>
        </table>
      `;

      const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="utf-8" />
            <style>${css}</style>
          </head>
          <body>
            ${metaHtml}
            ${tableHtml}
          </body>
        </html>
      `;

      const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export annual plan', e);
    }
  };

  const renderPlanSidebarContent = () => {
    if (planSidebarTab === 'daily') {
      const submittedDailyPlans = (() => {
        const out = (planSubmittedEntries || [])
          .filter((entry) => {
            if (planSelectedCourseId === 'all') return true;
            return String(entry?.courseId || '') === String(planSelectedCourseId);
          })
          .map((entry) => {
            const key = String(entry?.key || '').trim();
            const meta = planMetaByKey[key] || {};
            const fallbackDayName = String(entry?.dayName || '').trim();
            const displayDay = fallbackDayName
              ? `${fallbackDayName.charAt(0).toUpperCase()}${fallbackDayName.slice(1)}`
              : '';
            return {
              key,
              courseId: entry?.courseId || '',
              week: entry?.week || '',
              month: meta?.month || '',
              dayName: displayDay || 'Submitted',
              date: meta?.date || '',
              topic: meta?.topic || '',
              method: meta?.method || '',
              aids: meta?.aids || '',
              assessment: meta?.assessment || '',
              submittedAt: entry?.submittedAt || '',
              status: 'submitted',
            };
          });

        out.sort((a, b) => {
          const aSubmit = a?.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const bSubmit = b?.submittedAt ? new Date(b.submittedAt).getTime() : 0;
          if (aSubmit !== bSubmit) return bSubmit - aSubmit;
          const aISO = (a?.date || '').toString().slice(0, 10);
          const bISO = (b?.date || '').toString().slice(0, 10);
          if (aISO && bISO && aISO !== bISO) return bISO.localeCompare(aISO);
          const aw = Number(String(a?.week ?? '').match(/\d+/)?.[0] ?? 0);
          const bw = Number(String(b?.week ?? '').match(/\d+/)?.[0] ?? 0);
          return bw - aw;
        });

        return out;
      })();

      return (
        <div className="space-y-3" style={{ width: '100%', minWidth: 0 }}>
          <div style={{ background: 'var(--surface-panel)', borderRadius: 14, padding: 12, border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="font-semibold" style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)' }}>Fetched Plans</h3>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Loaded</div>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{visiblePlanWeeks.length}</div>
              </div>
            </div>

            {fetchedPlanRows.length ? (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fetchedPlanRows.map((w, idx) => {
                  const dayCount = Array.isArray(w?.weekDays) ? w.weekDays.length : 0;
                  const label = planCourseLabelMap?.[String(w?.courseId || '')] || String(w?.courseId || '');
                  return (
                    <div key={`${w?.courseId || 'course'}-${w?.week || idx}-${idx}`} style={{ padding: 10, borderRadius: 12, background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>{label || 'Course'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w?.week ? `Week ${w.week}` : 'Week -'}{w?.month ? ` • ${w.month}` : ''}</div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5 }}>{w?.topic || 'No topic set'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{dayCount} day(s) fetched</div>
                    </div>
                  );
                })}
                {visiblePlanWeeks.length > fetchedPlanRows.length && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Showing latest {fetchedPlanRows.length} fetched plans.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 10px', borderRadius: 12, background: 'var(--surface-soft)', border: '1px dashed var(--border-soft)', marginTop: 10 }}>
                No fetched plans found for this subject.
              </div>
            )}
          </div>

          <div style={{ background: 'var(--surface-panel)', borderRadius: 8, padding: 6, boxShadow: 'var(--shadow-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="font-semibold" style={{ margin: 0, fontSize: 11 }}>Submitted Daily Plans</h3>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Total</div>
                <div style={{ fontWeight: 800, color: 'var(--success)' }}>{submittedDailyPlans.length}</div>
              </div>
            </div>

            {submittedDailyPlans.length ? (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {submittedDailyPlans.map((p, idx) => (
                    <div key={p?.key || idx} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 14, background: 'color-mix(in srgb, var(--success) 12%, var(--surface-panel))', border: '1px solid color-mix(in srgb, var(--success) 35%, var(--border-soft))', alignItems: 'center', boxShadow: 'var(--shadow-soft)' }}>
                      <div style={{ width: 8, height: 48, borderRadius: 6, background: 'var(--success)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.dayName || `Submitted ${idx + 1}`}</div>
                            <div style={{ fontSize: 11, color: 'var(--success)' }}>
                            {p.week ? `Week: ${p.week}` : 'Week: -'}
                            {p?.date ? ` • ${String(p.date).slice(0, 10)}` : ''}
                            {p?.submittedAt ? ` • ${new Date(p.submittedAt).toLocaleString()}` : ''}
                          </div>
                      </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{p.topic || 'No topic provided'}</div>
                        <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 6 }}>
                        {p.method ? `Method: ${p.method}` : p.aids ? `Material: ${p.aids}` : p.assessment ? `Assessment: ${p.assessment}` : 'Quick note: -'}
                      </div>
                    </div>
                      <div style={{ background: 'var(--success)', color: 'var(--on-accent)', padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                      Submitted
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setPlanShowSubmittedTable((prev) => !prev)}
                    style={{
                      border: '1px solid color-mix(in srgb, var(--success) 40%, var(--border-soft))',
                      background: 'var(--surface-panel)',
                      color: 'var(--success)',
                      borderRadius: 8,
                      padding: '4px 8px',
                      fontSize: 9,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {planShowSubmittedTable ? 'Hide Submitted Details' : 'Show Submitted Details'}
                  </button>
                </div>

                {planShowSubmittedTable && (
                  <div style={{ marginTop: 8, border: '1px solid color-mix(in srgb, var(--success) 40%, var(--border-soft))', borderRadius: 14, overflowX: 'auto', background: 'var(--surface-panel)', boxShadow: 'var(--shadow-soft)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                      <thead>
                        <tr style={{ background: 'color-mix(in srgb, var(--success) 12%, var(--surface-panel))' }}>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, color: 'var(--success)', borderBottom: '1px solid color-mix(in srgb, var(--success) 24%, var(--border-soft))' }}>Subject</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, color: 'var(--success)', borderBottom: '1px solid color-mix(in srgb, var(--success) 24%, var(--border-soft))' }}>Week</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, color: 'var(--success)', borderBottom: '1px solid color-mix(in srgb, var(--success) 24%, var(--border-soft))' }}>Day</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, color: 'var(--success)', borderBottom: '1px solid color-mix(in srgb, var(--success) 24%, var(--border-soft))' }}>Plan Date</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, color: 'var(--success)', borderBottom: '1px solid color-mix(in srgb, var(--success) 24%, var(--border-soft))' }}>Submitted At</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, color: 'var(--success)', borderBottom: '1px solid color-mix(in srgb, var(--success) 24%, var(--border-soft))' }}>Topic</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submittedDailyPlans.map((p, idx) => (
                          <tr key={`${p?.key || 'submitted'}-${idx}`} style={{ background: idx % 2 ? 'var(--surface-panel)' : 'color-mix(in srgb, var(--success) 6%, var(--surface-panel))' }}>
                            <td style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-soft)' }}>
                              {planCourseLabelMap?.[String(p?.courseId || '')] || String(p?.courseId || '-')}
                            </td>
                            <td style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-soft)' }}>{p?.week ? `Week ${p.week}` : '-'}</td>
                            <td style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-soft)' }}>{p?.dayName || '-'}</td>
                            <td style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-soft)' }}>{p?.date ? String(p.date).slice(0, 10) : '-'}</td>
                            <td style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-soft)' }}>{p?.submittedAt ? new Date(p.submittedAt).toLocaleString() : '-'}</td>
                            <td style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-soft)' }}>{p?.topic || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '18px 12px', borderRadius: 14, background: 'var(--surface-soft)', border: '1px dashed var(--border-soft)' }}>No submitted daily plans yet.</div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="font-semibold" style={{ fontSize: 11 }}>Today's Plan</h3>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Today</div>
              <div style={{ fontWeight: 700 }}>{(visibleDailyPlans || []).length}</div>
            </div>
          </div>

          {(visibleDailyPlans && visibleDailyPlans.length > 0) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleDailyPlans.map((p, idx) => {
                const status = p?.status || 'pending';
                const color = status === 'submitted' ? 'var(--success)' : status === 'missed' ? 'var(--danger)' : 'var(--text-muted)';
                return (
                  <div key={p?.key || idx} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 14, background: 'var(--surface-panel)', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)', alignItems: 'center' }}>
                    <div style={{ width: 8, height: 48, borderRadius: 6, background: color }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.dayName || `Plan ${idx + 1}`}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.week ? `Week: ${p.week}` : 'Week: -'}</div>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{p.topic || 'No topic provided'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                        {p.method ? `Method: ${p.method}` : p.aids ? `Aids: ${p.aids}` : p.assessment ? `Assessment: ${p.assessment}` : 'Quick note: -'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                      <div style={{ background: color, color: 'var(--on-accent)', padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                        {status === 'submitted' ? 'Submitted' : status === 'missed' ? 'Missed' : 'Pending'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '18px 12px', borderRadius: 14, background: 'var(--surface-soft)', border: '1px dashed var(--border-soft)' }}>No plans for today.</div>
          )}
        </div>
      );
    }

    if (planSidebarTab === 'weekly') {
      const weekDays = Array.isArray(activeWeekDays) ? activeWeekDays : [];
      if (!weekDays.length) return (<div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No weekly plan found.</div>);

      return (
        <div className="sidebar-week-list" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0 }}>
          <div style={{ background: 'var(--surface-panel)', borderRadius: 14, padding: 12, border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="font-semibold" style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)' }}>Fetched Plans</h3>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Loaded</div>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{visiblePlanWeeks.length}</div>
              </div>
            </div>

            {fetchedPlanRows.length ? (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fetchedPlanRows.slice(0, 5).map((w, idx) => {
                  const dayCount = Array.isArray(w?.weekDays) ? w.weekDays.length : 0;
                  const label = planCourseLabelMap?.[String(w?.courseId || '')] || String(w?.courseId || '');
                  return (
                    <div key={`weekly-${w?.courseId || 'course'}-${w?.week || idx}-${idx}`} style={{ padding: 10, borderRadius: 12, background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>{label || 'Course'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w?.week ? `Week ${w.week}` : 'Week -'}{w?.month ? ` • ${w.month}` : ''}</div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5 }}>{w?.topic || 'No topic set'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{dayCount} day(s) fetched</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 10px', borderRadius: 12, background: 'var(--surface-soft)', border: '1px dashed var(--border-soft)', marginTop: 10 }}>
                No fetched plans found for this subject.
              </div>
            )}
          </div>

          <h3 className="font-semibold" style={{ margin: 0, marginBottom: 10, fontSize: 15, color: 'var(--text-primary)' }}>Week Plan</h3>
          {weekDays.map((d, i) => {
            const ds = getDayStatus(activeWeekBlock?.courseId, activeWeekBlock?.week, d, i);
            const status = ds.status;
            const statusColor = status === 'submitted' ? 'var(--success)' : status === 'missed' ? 'var(--danger)' : 'var(--text-muted)';
            const cardBg = status === 'submitted' ? 'color-mix(in srgb, var(--success) 12%, var(--surface-panel))' : status === 'missed' ? 'color-mix(in srgb, var(--danger) 12%, var(--surface-panel))' : 'var(--surface-panel)';
            return (
              <div key={i} className={`sidebar-week-card ${status}`} style={{ display: 'flex', gap: 18, color: 'var(--text-secondary)', padding: 12, borderRadius: 14, background: cardBg, alignItems: 'center', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)' }}>
                <div style={{ width: 10, height: 46, borderRadius: 6, background: status === 'submitted' ? 'linear-gradient(180deg,color-mix(in srgb, var(--success) 45%, var(--surface-panel)),var(--success))' : status === 'missed' ? 'linear-gradient(180deg,color-mix(in srgb, var(--danger) 45%, var(--surface-panel)),var(--danger))' : 'linear-gradient(180deg,var(--border-soft),var(--text-muted))' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{d.dayName || `Day ${i + 1}`}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeWeekBlock?.week ? `Week ${activeWeekBlock.week}` : ''}</div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{d.topic || activeWeekBlock?.topic || 'No topic set'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ background: statusColor, color: 'var(--on-accent)', padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{status === 'submitted' ? 'Submitted' : status === 'missed' ? 'Missed' : 'Pending'}</div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // monthly
    return (
      <div className="space-y-2" style={{ width: '100%', minWidth: 0 }}>
        <div style={{ background: 'var(--surface-panel)', borderRadius: 14, padding: 12, border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="font-semibold" style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)' }}>Fetched Plans</h3>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Loaded</div>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{visiblePlanWeeks.length}</div>
            </div>
          </div>

          {fetchedPlanRows.length ? (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fetchedPlanRows.slice(0, 5).map((w, idx) => {
                const dayCount = Array.isArray(w?.weekDays) ? w.weekDays.length : 0;
                const label = planCourseLabelMap?.[String(w?.courseId || '')] || String(w?.courseId || '');
                return (
                  <div key={`monthly-${w?.courseId || 'course'}-${w?.week || idx}-${idx}`} style={{ padding: 10, borderRadius: 12, background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>{label || 'Course'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w?.week ? `Week ${w.week}` : 'Week -'}{w?.month ? ` • ${w.month}` : ''}</div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5 }}>{w?.topic || 'No topic set'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{dayCount} day(s) fetched</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 10px', borderRadius: 12, background: 'var(--surface-soft)', border: '1px dashed var(--border-soft)', marginTop: 10 }}>
              No fetched plans found for this subject.
            </div>
          )}
        </div>

        <h3 className="font-semibold" style={{ margin: 0, marginBottom: 10, fontSize: 15, color: 'var(--text-primary)' }}>This Month</h3>
        {!currentMonthWeeks.length && <div className="text-xs text-gray-500" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '18px 12px', borderRadius: 14, background: 'var(--surface-soft)', border: '1px dashed var(--border-soft)' }}>No plans for this month.</div>}

        {!!currentMonthWeeks.length && (
          <div style={{ padding: 12, borderRadius: 14, background: 'var(--surface-panel)', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{currentMonthName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{currentMonthWeeks.length} week(s) • {monthStats.total} day(s)</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Completed</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{monthPct}%</div>
              </div>
            </div>

            <div style={{ height: 8, background: 'var(--surface-strong)', borderRadius: 999, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: `${monthPct}%`, height: '100%', background: 'linear-gradient(90deg,var(--accent),var(--accent-strong))' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--success)' }}>Submitted: <strong>{monthStats.submitted}</strong></div>
                <div style={{ fontSize: 12, color: 'var(--danger)' }}>Missed: <strong>{monthStats.missed}</strong></div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pending: <strong>{monthStats.pending}</strong></div>
              </div>
            </div>

            {monthStats.topics && monthStats.topics.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Topics this month</div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {monthStats.topics.slice(0, 3).map((t, i) => (<li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t}</li>))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <LessonPlanInsightsModal
        open={planAnnualOpen}
        onClose={() => setPlanAnnualOpen(false)}
        teacherName={selectedTeacher?.name || 'Teacher'}
        selectedCourseId={planSelectedCourseId}
        onCourseChange={setPlanSelectedCourseId}
        courseOptions={courseOptions}
        selectedCourseLabel={selectedCourseLabel}
        annualWeeks={annualWeeks}
        annualByMonth={annualByMonth}
        annualMonthKeys={annualMonthKeys}
        currentMonthName={currentMonthName}
        currentMonthWeeks={currentMonthWeeks}
        visibleDailyPlans={visibleDailyPlans}
        planLoading={planLoading}
        planError={planError}
        downloadAnnualExcel={downloadAnnualExcel}
        getDayStatus={getDayStatus}
      />

      <div className="right-sidebar" style={{ width: '100%', minWidth: 320, padding: 14, background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', borderRadius: 20, boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0, fontSize: 12 }}>
        {planSidebarOpen ? (
          <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              aria-label="Close plan sidebar"
              onClick={() => setPlanSidebarOpen(false)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                border: '1px solid var(--border-soft)',
                background: 'var(--surface-panel)',
                color: 'var(--text-secondary)',
                boxShadow: 'var(--shadow-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <FaChevronRight />
            </button>
          </div>
          <div style={{ position: 'sticky', top: 8, zIndex: 250, display: 'flex', justifyContent: 'flex-end', paddingBottom: 6 }}>
            <button
              onClick={() => setPlanAnnualOpen(true)}
              style={{
                borderRadius: 999,
                padding: '10px 14px',
                background: 'var(--surface-panel)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-soft)',
                boxShadow: 'var(--shadow-panel)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              Annual Lesson Plan
            </button>
          </div>
          <div style={{ background: 'var(--surface-panel)', padding: 16, borderRadius: 16, border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: 'color-mix(in srgb, var(--accent) 14%, var(--surface-panel))', padding: 9, borderRadius: 10 }}><FaCalendarAlt color="var(--accent-strong)" /></div>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Lesson Overview</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{today.toLocaleDateString()}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>This Week</div>
                  <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--text-primary)' }}>{weekStats.total}</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 800, whiteSpace: 'nowrap' }}>Subject</div>
              <select
                value={planSelectedCourseId}
                onChange={(e) => setPlanSelectedCourseId(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border-soft)',
                  background: 'var(--surface-soft)',
                  outline: 'none',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                }}
              >
                {courseOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              Showing: <strong style={{ color: 'var(--text-primary)' }}>{selectedCourseLabel}</strong>
            </div>

            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 14, background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Weekly progress</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{weekCompletionRate}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-strong)', overflow: 'hidden' }}>
                <div style={{ width: `${weekCompletionRate}%`, height: '100%', background: 'linear-gradient(90deg, var(--text-primary), var(--accent-strong))' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1, padding: 10, borderRadius: 12, textAlign: 'center', border: '1px solid color-mix(in srgb, var(--success) 35%, var(--border-soft))', boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--surface-panel) 20%, transparent)', background: 'color-mix(in srgb, var(--success) 12%, var(--surface-panel))' }}>
                <div style={{ fontSize: 12, color: 'var(--success)' }}><FaCheckCircle /></div>
                <div style={{ fontWeight: 800, color: 'var(--success)' }}>{weekStats.submitted}</div>
                <div style={{ fontSize: 11, color: 'var(--success)' }}>Submitted</div>
              </div>
              <div style={{ flex: 1, padding: 10, borderRadius: 12, textAlign: 'center', border: '1px solid color-mix(in srgb, var(--danger) 35%, var(--border-soft))', boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--surface-panel) 20%, transparent)', background: 'color-mix(in srgb, var(--danger) 10%, var(--surface-panel))' }}>
                <div style={{ fontSize: 12, color: 'var(--danger)' }}><FaClock /></div>
                <div style={{ fontWeight: 800, color: 'var(--danger)' }}>{weekStats.missed}</div>
                <div style={{ fontSize: 11, color: 'var(--danger)' }}>Missed</div>
              </div>
              <div style={{ flex: 1, padding: 10, borderRadius: 12, textAlign: 'center', border: '1px solid var(--border-soft)', boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--surface-panel) 20%, transparent)', background: 'var(--surface-soft)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>•</div>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{weekStats.pending}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pending</div>
              </div>
            </div>

            {planError && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'color-mix(in srgb, var(--danger) 10%, var(--surface-panel))', color: 'var(--danger)', fontSize: 13 }}>
                {planError}
              </div>
            )}

            {planLoading && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'var(--surface-soft)', color: 'var(--text-muted)', fontSize: 13 }}>
                Loading lesson plans...
              </div>
            )}
          </div>

          <div style={{ background: 'var(--surface-panel)', border: '1px solid var(--border-soft)', borderRadius: 16, boxShadow: 'var(--shadow-soft)', display: 'flex', gap: 6, alignItems: 'center', padding: 4, width: '100%', minWidth: 0 }}>
            <button
              onClick={() => setPlanSidebarTab('daily')}
              className={"btn " + (planSidebarTab === 'daily' ? 'btn-primary' : 'btn-ghost')}
              style={{
                flex: 1,
                borderRadius: 999,
                padding: '9px 10px',
                fontSize: 11,
                fontWeight: 700,
                background: planSidebarTab === 'daily' ? 'var(--text-primary)' : 'transparent',
                color: planSidebarTab === 'daily' ? 'var(--on-accent)' : 'var(--text-muted)',
                border: 'none',
                boxShadow: planSidebarTab === 'daily' ? 'var(--shadow-soft)' : 'none',
                minWidth: 0,
                whiteSpace: 'nowrap',
              }}
            >
              Daily
            </button>
            <button
              onClick={() => setPlanSidebarTab('weekly')}
              className={"btn " + (planSidebarTab === 'weekly' ? 'btn-primary' : 'btn-ghost')}
              style={{
                flex: 1,
                borderRadius: 999,
                padding: '9px 10px',
                fontSize: 11,
                fontWeight: 700,
                background: planSidebarTab === 'weekly' ? 'var(--text-primary)' : 'transparent',
                color: planSidebarTab === 'weekly' ? 'var(--on-accent)' : 'var(--text-muted)',
                border: 'none',
                boxShadow: planSidebarTab === 'weekly' ? 'var(--shadow-soft)' : 'none',
                minWidth: 0,
                whiteSpace: 'nowrap',
              }}
            >
              Weekly
            </button>
            <button
              onClick={() => setPlanSidebarTab('monthly')}
              className={"btn " + (planSidebarTab === 'monthly' ? 'btn-primary' : 'btn-ghost')}
              style={{
                flex: 1,
                borderRadius: 999,
                padding: '9px 10px',
                fontSize: 11,
                fontWeight: 700,
                background: planSidebarTab === 'monthly' ? 'var(--text-primary)' : 'transparent',
                color: planSidebarTab === 'monthly' ? 'var(--on-accent)' : 'var(--text-muted)',
                border: 'none',
                boxShadow: planSidebarTab === 'monthly' ? 'var(--shadow-soft)' : 'none',
                minWidth: 0,
                whiteSpace: 'nowrap',
              }}
            >
              Monthly
            </button>
          </div>

          <div style={{ background: 'var(--surface-panel)', border: '1px solid var(--border-soft)', borderRadius: 16, boxShadow: 'var(--shadow-soft)', padding: 12, overflowY: 'auto', overflowX: 'hidden', maxHeight: isPortrait ? '56vh' : '56vh', width: '100%', minWidth: 0 }}>
            {renderPlanSidebarContent()}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Monthly entries: <strong style={{ color: 'var(--text-primary)' }}>{monthlyCount}</strong></div>
            <div>
              <button className="btn btn-ghost" onClick={refreshPlans}>Refresh</button>
            </div>
          </div>
        </>
        ) : (
          <button
            aria-label="Open plan sidebar"
            onClick={() => setPlanSidebarOpen(true)}
            style={{
              minWidth: 92,
              height: 42,
              padding: '0 14px',
              borderRadius: 999,
              border: '1px solid var(--border-soft)',
              background: 'var(--surface-panel)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-panel)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              alignSelf: 'flex-end',
            }}
          >
            <span>Plan</span>
            <FaChevronLeft />
          </button>
        )}
      </div>
    </>
  );
}
