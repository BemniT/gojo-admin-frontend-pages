import React, { useState } from "react";
import ProfileAvatar from "../components/ProfileAvatar";
import DashboardLayout from "../components/dashboard/layout/DashboardLayout";
import { useAdminSession } from "../hooks/auth/useAdminSession";
import { useOverview } from "../hooks/dashboard/useOverview";
import { useIsNarrow } from "../hooks/ui/useWindowSize";

// ---- Module-scope style constants (no per-render allocation) ----
// Overview is a full-width page (no narrow feed column), so it fills
// the entire middle area instead of capping at 760px like the feed pages.
const FEED_MAX_WIDTH = "100%";

const SHELL_CARD_STYLE = {
  background: "var(--surface-panel)",
  border: "1px solid var(--border-soft)",
  borderRadius: 16,
};

const HEADER_CARD_STYLE = {
  ...SHELL_CARD_STYLE,
  width: "100%",
  maxWidth: FEED_MAX_WIDTH,
  color: "var(--text-primary)",
  padding: "16px 18px",
  position: "relative",
  overflow: "hidden",
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--surface-panel) 88%, white) 0%, color-mix(in srgb, var(--surface-panel) 94%, var(--surface-accent)) 100%)",
};

const STAT_CARD_STYLE = {
  ...SHELL_CARD_STYLE,
  borderRadius: 14,
  padding: "16px 18px",
  minHeight: 108,
  position: "relative",
  overflow: "hidden",
  background:
    "linear-gradient(180deg, var(--surface-panel) 0%, color-mix(in srgb, var(--surface-panel) 82%, var(--surface-accent)) 100%)",
};

const SOFT_ROW_STYLE = {
  display: "grid",
  alignItems: "center",
  gap: 12,
  background:
    "linear-gradient(180deg, var(--surface-muted) 0%, color-mix(in srgb, var(--surface-muted) 84%, white) 100%)",
  border: "1px solid var(--border-soft)",
  borderRadius: 14,
  padding: "10px 12px",
};

const PROGRESS_TRACK_STYLE = {
  height: 9,
  background: "color-mix(in srgb, var(--surface-strong) 88%, white)",
  borderRadius: 999,
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

export default function OverviewPage() {
  const { admin, loadingAdmin } = useAdminSession();
  const schoolCode = admin?.schoolCode || "";

  const { parentsCount, postsCount, summary, loading } = useOverview(schoolCode);

  const isNarrow = useIsNarrow(1100);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [hoveredTrendKey, setHoveredTrendKey] = useState("");

  if (loadingAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        Loading...
      </div>
    );
  }

  // Stat card definitions
  const statCards = [
    { title: "Total Students", value: summary.totalStudents, tone: "var(--accent-strong)", note: "Registered learners" },
    { title: "Active Students", value: summary.activeStudents, tone: "var(--success)", note: "Currently active" },
    { title: "Inactive Students", value: summary.inactiveStudents, tone: "var(--danger)", note: "Need follow-up" },
    { title: "Male Count", value: summary.maleCount, tone: "color-mix(in srgb, var(--success) 82%, var(--text-primary))", note: "Current roster" },
    { title: "Female Count", value: summary.femaleCount, tone: "color-mix(in srgb, var(--accent) 52%, var(--text-primary))", note: "Current roster" },
  ];

  const middle = (
    <div
      style={{
        width: "100%",
        maxWidth: FEED_MAX_WIDTH,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        paddingTop: 6,
        paddingBottom: 24,
      }}
    >
      {/* ---- Header ---- */}
      <div style={HEADER_CARD_STYLE}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: "linear-gradient(90deg, var(--accent), var(--accent-strong), color-mix(in srgb, var(--accent) 68%, white))",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.01em" }}>Overview</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)", maxWidth: 560, lineHeight: 1.5 }}>
              Operational snapshot for students, parents and posts.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 999,
              background: "color-mix(in srgb, var(--surface-muted) 86%, white)",
              border: "1px solid var(--border-soft)",
              fontSize: 11,
              color: "var(--text-muted)",
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: loading ? "#d97706" : "var(--success)",
                boxShadow: loading
                  ? "0 0 0 4px color-mix(in srgb, #d97706 18%, transparent)"
                  : "0 0 0 4px color-mix(in srgb, var(--success) 18%, transparent)",
              }}
            />
            {loading ? "Loading..." : `Updated: ${new Date().toLocaleString()}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, position: "relative", zIndex: 1 }}>
          {[
            `Students: ${loading ? "--" : summary.totalStudents}`,
            `Parents: ${loading ? "--" : parentsCount}`,
            `Posts: ${loading ? "--" : postsCount}`,
          ].map((item) => (
            <div
              key={item}
              style={{
                padding: "7px 12px",
                borderRadius: 999,
                background: "color-mix(in srgb, var(--surface-panel) 72%, white)",
                border: "1px solid var(--border-soft)",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-secondary)",
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* ---- Stat cards ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {statCards.map((card) => (
          <div key={card.title} style={STAT_CARD_STYLE}>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 4,
                background: `linear-gradient(90deg, ${card.tone}, color-mix(in srgb, ${card.tone} 42%, white))`,
              }}
            />
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.02em" }}>{card.title}</div>
            <div style={{ marginTop: 10, fontSize: 32, lineHeight: 1, fontWeight: 800, color: card.tone }}>{loading ? "--" : card.value}</div>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>{card.note}</div>
          </div>
        ))}
      </div>

      {/* ---- Two-column block: Registrations + Grade analytics ---- */}
      <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1.4fr 1fr", gap: 12, alignItems: "start" }}>
        <RegistrationsCard
          loading={loading}
          summary={summary}
          postsCount={postsCount}
          isNarrow={isNarrow}
          showAllRecent={showAllRecent}
          setShowAllRecent={setShowAllRecent}
          hoveredTrendKey={hoveredTrendKey}
          setHoveredTrendKey={setHoveredTrendKey}
        />
        <GradeAnalyticsCard loading={loading} summary={summary} />
      </div>
    </div>
  );

  return (
    <DashboardLayout
      middle={middle}
      right={null}
      modals={null}
      isOverlayModalOpen={false}
      fullWidthMiddle
    />
  );
}

// ============================================================
// Sub-components — kept in this file because they're page-specific
// (not reused elsewhere). Extract to /components/overview if they
// ever get a second consumer.
// ============================================================

function RegistrationsCard({
  loading,
  summary,
  postsCount,
  isNarrow,
  showAllRecent,
  setShowAllRecent,
  hoveredTrendKey,
  setHoveredTrendKey,
}) {
  return (
    <div
      style={{
        ...SHELL_CARD_STYLE,
        borderRadius: 18,
        padding: 16,
        background: "linear-gradient(180deg, #ffffff 0%, color-mix(in srgb, var(--surface-accent) 26%, white) 100%)",
        border: "1px solid color-mix(in srgb, var(--accent) 10%, var(--border-soft))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>New Registrations (This Month)</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-secondary)", maxWidth: 440 }}>
            Latest students added during the current calendar month, paired with a cleaner registration trend snapshot.
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            padding: "7px 11px",
            borderRadius: 999,
            background: "#ffffff",
            border: "1px solid color-mix(in srgb, var(--accent) 10%, var(--border-soft))",
            fontWeight: 700,
          }}
        >
          {loading ? "--" : summary.thisMonthRegistrationCount} registrations • Posts: {loading ? "--" : postsCount}
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading students...</div>
      ) : summary.recentStudents.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "16px 18px", borderRadius: 16, background: "#ffffff", border: "1px solid var(--border-soft)" }}>
          No registrations found for this month yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {(showAllRecent ? summary.recentStudents : summary.recentStudents.slice(0, 5)).map((student, index) => (
            <div
              key={student.studentId}
              style={{
                ...SOFT_ROW_STYLE,
                gridTemplateColumns: isNarrow ? "48px 1fr" : "48px minmax(0, 1fr) auto",
                padding: "12px 14px",
                borderRadius: 16,
                background: "#ffffff",
                boxShadow: "0 12px 24px rgba(15, 23, 42, 0.04)",
              }}
            >
              <div style={{ position: "relative", width: 46, height: 46 }}>
                <ProfileAvatar
                  src={student.profileImage}
                  name={student.name}
                  alt={student.name}
                  loading="lazy"
                  style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border-strong)" }}
                />
                <div
                  style={{
                    position: "absolute",
                    right: -2,
                    bottom: -1,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 999,
                    background: "var(--accent-strong)",
                    color: "#ffffff",
                    fontSize: 10,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "2px solid #ffffff",
                  }}
                >
                  {index + 1}
                </div>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>{student.name}</div>
                  <div
                    style={{
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "color-mix(in srgb, var(--surface-accent) 78%, white)",
                      border: "1px solid color-mix(in srgb, var(--accent) 10%, var(--border-soft))",
                      fontSize: 10,
                      color: "var(--text-secondary)",
                      fontWeight: 700,
                    }}
                  >
                    {student.studentId}
                  </div>
                </div>
                <div style={{ marginTop: 5, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, color: "var(--text-secondary)" }}>
                  <span>Registered: {formatDateTime(student.createdAt)}</span>
                  <span style={{ color: "var(--text-muted)" }}>Status: {student.status || "active"}</span>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  gridColumn: isNarrow ? "2 / 3" : "auto",
                  justifySelf: isNarrow ? "flex-start" : "flex-end",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--accent-strong)",
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "color-mix(in srgb, var(--accent) 10%, white)",
                    border: "1px solid color-mix(in srgb, var(--accent) 18%, var(--border-soft))",
                  }}
                >
                  G{student.grade}{student.section ? ` • ${student.section}` : ""}
                </div>
              </div>
            </div>
          ))}

          {summary.recentStudents.length > 5 ? (
            <button
              type="button"
              onClick={() => setShowAllRecent((prev) => !prev)}
              style={{
                marginTop: 2,
                alignSelf: "flex-start",
                border: "1px solid var(--border-soft)",
                borderRadius: 999,
                background: "#ffffff",
                color: "var(--accent-strong)",
                fontSize: 12,
                fontWeight: 800,
                padding: "7px 12px",
                cursor: "pointer",
              }}
            >
              {showAllRecent ? "See less" : `See more (${summary.recentStudents.length - 5})`}
            </button>
          ) : null}
        </div>
      )}

      <TrendChart summary={summary} hoveredTrendKey={hoveredTrendKey} setHoveredTrendKey={setHoveredTrendKey} />
    </div>
  );
}

function TrendChart({ summary, hoveredTrendKey, setHoveredTrendKey }) {
  const trend = summary.monthlyTrend || [];
  const maxValue = Math.max(summary.monthlyTrendMax || 0, 1);
  const chartScaleMax = Math.max(1, Math.ceil(maxValue * 1.18));
  const chartWidth = 100;
  const chartHeight = 42;
  const step = trend.length > 1 ? chartWidth / (trend.length - 1) : 0;
  const pointCoordinates = trend.map((row, index) => {
    const x = trend.length > 1 ? index * step : chartWidth / 2;
    const y = chartHeight - (Number(row.count || 0) / chartScaleMax) * chartHeight;
    return { ...row, x, y };
  });
  const points = pointCoordinates.map((row) => `${row.x},${row.y}`).join(" ");
  const areaPoints = [
    `0,${chartHeight}`,
    ...pointCoordinates.map((row) => `${row.x},${row.y}`),
    `${chartWidth},${chartHeight}`,
  ].join(" ");
  const latestPoint = pointCoordinates[pointCoordinates.length - 1] || null;
  const activePoint = pointCoordinates.find((row) => row.key === hoveredTrendKey) || latestPoint;
  const gridValues = [0, 0.33, 0.66, 1].map((ratio) => ({
    value: Math.round(chartScaleMax * ratio),
    y: chartHeight - chartHeight * ratio,
  }));

  return (
    <div style={{ borderTop: "1px solid color-mix(in srgb, var(--accent) 10%, var(--border-soft))", paddingTop: 12, marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", marginBottom: 8 }}>Monthly Registration Trend</div>
      <div style={{ background: "#ffffff", padding: "6px 0 0" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <div
            style={{
              padding: "8px 11px",
              borderRadius: 999,
              background: "color-mix(in srgb, var(--surface-accent) 55%, white)",
              border: "1px solid color-mix(in srgb, var(--accent) 10%, var(--border-soft))",
              fontSize: 11,
              color: "var(--text-secondary)",
              fontWeight: 700,
            }}
          >
            {activePoint ? `${activePoint.label}: ${activePoint.count}` : "No trend data"}
          </div>
        </div>
        <svg viewBox={`0 0 ${chartWidth} 52`} style={{ width: "100%", height: 216, display: "block" }}>
          <defs>
            <linearGradient id="overviewTrendArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--accent) 28%, white)" />
              <stop offset="100%" stopColor="rgba(0, 122, 251, 0.02)" />
            </linearGradient>
            <linearGradient id="overviewTrendLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--accent-strong) 88%, white)" />
              <stop offset="100%" stopColor="var(--accent)" />
            </linearGradient>
          </defs>
          {gridValues.map((row) => (
            <g key={`grid-${row.y}`}>
              <line
                x1="0"
                y1={row.y}
                x2={chartWidth}
                y2={row.y}
                stroke="color-mix(in srgb, var(--accent) 10%, var(--border-soft))"
                strokeWidth="0.45"
                strokeDasharray="2 2"
              />
              <text x="0" y={Math.max(3, row.y - 1.4)} fontSize="2.6" fill="var(--text-muted)">{row.value}</text>
            </g>
          ))}
          {activePoint ? (
            <line
              x1={activePoint.x}
              y1="0"
              x2={activePoint.x}
              y2={chartHeight}
              stroke="color-mix(in srgb, var(--accent) 18%, var(--border-soft))"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
          ) : null}
          <polygon fill="url(#overviewTrendArea)" points={areaPoints} />
          <polyline fill="none" stroke="url(#overviewTrendLine)" strokeWidth="1.35" strokeLinejoin="round" strokeLinecap="round" points={points} />
          {pointCoordinates.map((row) => (
            <g
              key={`${row.key}-point`}
              onMouseEnter={() => setHoveredTrendKey(row.key)}
              onMouseLeave={() => setHoveredTrendKey("")}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={row.x}
                cy={row.y}
                r={activePoint?.key === row.key ? "3.1" : "2.05"}
                fill="#ffffff"
                stroke="var(--accent-strong)"
                strokeWidth={activePoint?.key === row.key ? "1.15" : "0.9"}
              />
              <circle cx={row.x} cy={row.y} r={activePoint?.key === row.key ? "1.15" : "0.75"} fill="var(--accent-strong)" />
              {activePoint?.key === row.key ? (
                <g>
                  <rect
                    x={Math.max(0, row.x - 10)}
                    y={Math.max(1, row.y - 9)}
                    width="20"
                    height="6.6"
                    rx="2.2"
                    fill="#ffffff"
                    stroke="color-mix(in srgb, var(--accent) 10%, var(--border-soft))"
                    strokeWidth="0.35"
                  />
                  <text
                    x={row.x}
                    y={Math.max(5.1, row.y - 4.7)}
                    textAnchor="middle"
                    fontSize="2.45"
                    fill="var(--text-primary)"
                    fontWeight="700"
                  >
                    {row.count}
                  </text>
                </g>
              ) : null}
              <text
                x={row.x}
                y="49"
                textAnchor="middle"
                fontSize="2.7"
                fill={activePoint?.key === row.key ? "var(--accent-strong)" : "var(--text-secondary)"}
              >
                {row.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function GradeAnalyticsCard({ loading, summary }) {
  return (
    <div style={{ ...SHELL_CARD_STYLE, borderRadius: 14, padding: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>All Grade Analytics Graph</div>
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-secondary)" }}>Full-grade enrollment graph and gender split.</div>
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading distribution...</div>
      ) : summary.gradeAnalytics.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No distribution data.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <GradeBarChart summary={summary} />
          <GradeProgressList summary={summary} />
          <GenderSplit summary={summary} />
        </div>
      )}
    </div>
  );
}

function GradeBarChart({ summary }) {
  const data = summary.gradeAnalytics;
  const maxValue = Math.max(summary.maxGradeCount || 0, 1);
  const barGap = 6;
  const barWidth = data.length ? (100 - barGap * (data.length - 1)) / data.length : 0;

  return (
    <div style={{ ...SOFT_ROW_STYLE, gridTemplateColumns: "1fr", padding: "10px 10px 12px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>Students by Grade (Bar Graph)</div>
      <svg viewBox="0 0 100 44" style={{ width: "100%", height: 170, display: "block" }}>
        <line x1="0" y1="40" x2="100" y2="40" stroke="var(--border-strong)" strokeWidth="0.5" />
        {data.map((row, index) => {
          const height = Math.max(1.2, (Number(row.count || 0) / maxValue) * 34);
          const x = index * (barWidth + barGap);
          const y = 40 - height;
          return (
            <g key={`${row.grade}-bar`}>
              <rect x={x} y={y} width={barWidth} height={height} rx="0.8" fill="url(#gradeBarGradient)" />
              <text x={x + barWidth / 2} y={y - 1.5} textAnchor="middle" fontSize="2.6" fill="var(--text-primary)">
                {row.count}
              </text>
              <text x={x + barWidth / 2} y="43" textAnchor="middle" fontSize="2.6" fill="var(--text-secondary)">
                {row.grade}
              </text>
            </g>
          );
        })}
        <defs>
          <linearGradient id="gradeBarGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-strong)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function GradeProgressList({ summary }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {summary.gradeAnalytics.map((row) => {
        const pct = summary.totalStudents ? Math.round((row.count / summary.totalStudents) * 100) : 0;
        return (
          <div key={row.grade}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>Grade {row.grade}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.count} ({pct}%)</span>
            </div>
            <div style={PROGRESS_TRACK_STYLE}>
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: "linear-gradient(90deg, var(--accent-strong), var(--accent))",
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GenderSplit({ summary }) {
  const rows = [
    { label: "Male", count: summary.maleCount, tone: "color-mix(in srgb, var(--success) 82%, var(--text-primary))" },
    { label: "Female", count: summary.femaleCount, tone: "color-mix(in srgb, var(--accent) 52%, var(--text-primary))" },
  ];

  return (
    <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", marginBottom: 8 }}>Gender Split</div>
      {rows.map((row) => {
        const pct = summary.totalStudents ? Math.round((row.count / summary.totalStudents) * 100) : 0;
        return (
          <div key={row.label} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>{row.label}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.count} ({pct}%)</span>
            </div>
            <div style={PROGRESS_TRACK_STYLE}>
              <div style={{ height: "100%", width: `${pct}%`, background: row.tone, borderRadius: 999 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
