import React, { useState } from "react";
import { FaChevronDown, FaSearch, FaSyncAlt, FaUsers } from "react-icons/fa";

import DashboardLayout from "../components/dashboard/layout/DashboardLayout";
import ConfirmDialog from "../components/dashboard/modals/ConfirmDialog";
import Toast from "../components/Toast";
import ProfileAvatar from "../components/ProfileAvatar";

import { useAdminSession } from "../hooks/auth/useAdminSession";
import { useAcademicYears } from "../hooks/academic/useAcademicYears";
import { useYearHistoryStudents } from "../hooks/academic/useYearHistoryStudents";

// ---- Module-scope styles ----
const PAGE_MAX_WIDTH = 1120;

const PAGE_CARD = {
  background: "var(--surface-panel)",
  border: "1px solid var(--border-soft)",
  borderRadius: 16,
  boxShadow: "var(--shadow-soft)",
};

const HERO_CARD = {
  ...PAGE_CARD,
  padding: 18,
  position: "relative",
  overflow: "hidden",
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--surface-panel) 88%, white) 0%, color-mix(in srgb, var(--surface-panel) 94%, var(--surface-accent)) 100%)",
};

const SKELETON_BASE = {
  background:
    "linear-gradient(90deg, color-mix(in srgb, var(--surface-muted) 92%, white) 0%, color-mix(in srgb, var(--surface-panel) 72%, white) 50%, color-mix(in srgb, var(--surface-muted) 92%, white) 100%)",
  backgroundSize: "200% 100%",
  animation: "academicYearSkeletonPulse 1.2s ease-in-out infinite",
  borderRadius: 10,
};

const chipStyle = (active) => ({
  padding: "6px 12px",
  borderRadius: 999,
  background: active ? "var(--accent-strong)" : "var(--surface-accent)",
  color: active ? "#fff" : "var(--accent-strong)",
  cursor: "pointer",
  border: active ? "1px solid var(--accent-strong)" : "1px solid var(--border-strong)",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
  transition: "all 0.2s ease",
});

const renderSkeletonLine = (width, height = 12, extraStyle = {}) => (
  <div style={{ ...SKELETON_BASE, width, height, ...extraStyle }} />
);

const formatFieldLabel = (key) =>
  String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (segment) => segment.toUpperCase());

const formatFieldValue = (value) => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    const allPrimitive = value.every(
      (item) => item === null || ["string", "number", "boolean"].includes(typeof item)
    );
    return allPrimitive ? value.join(", ") : `${value.length} item(s)`;
  }
  if (typeof value === "object") return "Available";
  const text = String(value).trim();
  return text || "-";
};

export default function AcademicYearPage() {
  const { admin, loadingAdmin } = useAdminSession();
  const schoolCode = admin?.schoolCode || "";

  const [confirmDialog, setConfirmDialog] = useState(null);
  const [toast, setToast] = useState(null);

  const yearsApi = useAcademicYears({
    schoolCode,
    requestConfirm: setConfirmDialog,
    notify: setToast,
  });

  const historyApi = useYearHistoryStudents({
    schoolCode,
    notify: setToast,
  });

  if (loadingAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading...</div>
    );
  }

  const middle = (
    <div style={{ width: "100%", maxWidth: PAGE_MAX_WIDTH, display: "flex", flexDirection: "column", gap: 12, paddingTop: 6, paddingBottom: 24 }}>
      <HeroHeader
        currentYear={yearsApi.currentAcademicYear}
        onRefresh={yearsApi.fetchAcademicYears}
        loading={yearsApi.loading}
        working={yearsApi.working}
      />

      <StatsGrid
        stats={yearsApi.stats}
        historyCount={historyApi.students.length}
        selectedYear={historyApi.selectedYear}
      />

      <YearList
        loading={yearsApi.loading}
        yearRows={yearsApi.yearRows}
        selectedYear={historyApi.selectedYear}
        onToggleYear={historyApi.openYear}
        renderExpandedRow={(yearKey) => (
          <YearHistoryPanel api={historyApi} yearKey={yearKey} />
        )}
      />

      <style>{`
        @keyframes academicYearSkeletonPulse {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .ay-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        @media (max-width: 980px) {
          .ay-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .ay-stats { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );

  const modals = (
    <>
      <StudentDetailModal
        student={historyApi.selectedStudent}
        onClose={() => historyApi.setSelectedStudent(null)}
      />
      <ConfirmDialog
        dialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
        confirmLabel="Confirm"
        confirmColor="var(--accent-strong)"
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );

  return (
    <DashboardLayout
      middle={middle}
      right={null}
      modals={modals}
      isOverlayModalOpen={!!historyApi.selectedStudent}
    />
  );
}

// ============================================================
// Sub-components — page-specific, kept inline for cohesion.
// Extract to /components/academic-year/ if they ever get a 2nd consumer.
// ============================================================

function HeroHeader({ currentYear, onRefresh, loading, working }) {
  return (
    <div style={HERO_CARD}>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: "var(--text-primary)" }}>
            Academic Year Management
          </h1>
          <p style={{ fontSize: 13, marginTop: 4, color: "var(--text-secondary)" }}>
            Create, activate, archive, and rollover academic years for promotion logic.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700 }}>
            {currentYear ? `Current: ${currentYear.replace("_", "/")}` : "No active year"}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || working}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid var(--accent-strong)",
              background: "var(--surface-accent)",
              color: "var(--accent-strong)",
              borderRadius: 9,
              padding: "7px 10px",
              fontSize: 12,
              fontWeight: 800,
              cursor: loading || working ? "not-allowed" : "pointer",
              opacity: loading || working ? 0.6 : 1,
              boxShadow: "var(--shadow-glow)",
            }}
          >
            <FaSyncAlt /> Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

function StatsGrid({ stats, historyCount, selectedYear }) {
  const cards = [
    { title: "Total Years", value: stats.totalYears, hint: "Configured academic years", color: "#2563eb" },
    { title: "Active", value: stats.activeCount, hint: "Live years", color: "#0f766e" },
    { title: "Archived", value: stats.archivedCount, hint: "Closed years", color: "#c2410c" },
    {
      title: "History Students",
      value: historyCount,
      hint: selectedYear ? selectedYear.replace("_", "/") : "Current selection",
      color: "#7c3aed",
    },
  ];

  return (
    <div className="ay-stats">
      {cards.map((item) => (
        <div
          key={item.title}
          style={{
            ...PAGE_CARD,
            padding: 12,
            background: "linear-gradient(180deg, var(--surface-panel) 0%, color-mix(in srgb, var(--surface-panel) 82%, var(--surface-accent)) 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700 }}>{item.title}</span>
            <FaUsers style={{ color: item.color }} />
          </div>
          <div style={{ marginTop: 8, fontSize: 26, fontWeight: 900, color: "var(--text-primary)" }}>{item.value}</div>
          <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-muted)" }}>{item.hint}</div>
        </div>
      ))}
    </div>
  );
}

function YearList({ loading, yearRows, selectedYear, onToggleYear, renderExpandedRow }) {
  return (
    <div style={{ ...PAGE_CARD, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", fontWeight: 800, color: "var(--text-primary)", borderBottom: "1px solid var(--border-soft)" }}>
        Academic Years
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr 0.7fr",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border-soft)",
          fontSize: 12,
          fontWeight: 800,
          color: "var(--text-secondary)",
        }}
      >
        <div>Year</div>
        <div>Status</div>
        <div>Current</div>
      </div>

      {loading ? (
        <div style={{ padding: 14, display: "grid", gap: 10 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`academic-year-skeleton-${index}`}
              style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.7fr", gap: 12, alignItems: "center" }}
            >
              {renderSkeletonLine("72%", 16)}
              {renderSkeletonLine("48%", 16)}
              {renderSkeletonLine("28px", 16)}
            </div>
          ))}
        </div>
      ) : yearRows.length === 0 ? (
        <div style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>No academic years created yet.</div>
      ) : (
        yearRows.map(([yearKey, row]) => {
          const status = String(row?.status || "inactive");
          const isCurrent = !!row?.isCurrent;
          const isExpanded = selectedYear === yearKey;

          return (
            <div key={yearKey} style={{ borderTop: "1px solid var(--border-soft)" }}>
              <div
                onClick={() => onToggleYear(yearKey)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1fr 0.7fr",
                  padding: "10px 14px",
                  alignItems: "center",
                  cursor: "pointer",
                  background: isExpanded ? "var(--surface-muted)" : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      border: "1px solid var(--border-soft)",
                      background: "var(--surface-panel)",
                      color: "var(--success)",
                      transition: "transform .2s ease",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      flexShrink: 0,
                    }}
                  >
                    <FaChevronDown style={{ width: 12, height: 12 }} />
                  </span>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {row?.label || yearKey.replace("_", "/")}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: status === "active" ? "#166534" : status === "archived" ? "#9a3412" : "#475569",
                  }}
                >
                  {status}
                </div>
                <div style={{ fontSize: 13 }}>{isCurrent ? "✅" : "—"}</div>
              </div>

              {isExpanded ? renderExpandedRow(yearKey) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

function YearHistoryPanel({ api, yearKey }) {
  const {
    loading,
    students,
    search,
    setSearch,
    selectedGrade,
    setSelectedGrade,
    selectedSection,
    setSelectedSection,
    gradeOptions,
    sectionOptions,
    visibleStudents,
    setSelectedStudent,
  } = api;

  if (loading) {
    return (
      <div style={{ padding: "0 14px 12px", background: "var(--surface-muted)", borderTop: "1px dashed var(--border-strong)" }}>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "var(--surface-panel)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: "10px 12px", boxShadow: "var(--shadow-soft)" }}>
            {renderSkeletonLine("100%", 16)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`chip-skel-${index}`} style={{ ...SKELETON_BASE, width: 92, height: 30, borderRadius: 999 }} />
            ))}
          </div>
          <div style={{ border: "1px solid var(--border-soft)", borderRadius: 10, overflow: "hidden", background: "var(--surface-panel)" }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`row-skel-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.7fr",
                  padding: "12px",
                  borderTop: index === 0 ? "none" : "1px solid var(--border-soft)",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ ...SKELETON_BASE, width: 30, height: 30, borderRadius: "50%" }} />
                  <div style={{ display: "grid", gap: 6, width: "100%" }}>
                    {renderSkeletonLine("58%")}
                    {renderSkeletonLine("34%", 10)}
                  </div>
                </div>
                {renderSkeletonLine("40%")}
                {renderSkeletonLine("40%")}
                {renderSkeletonLine("64px", 28, { borderRadius: 8 })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div style={{ padding: "10px 14px 12px", background: "var(--surface-muted)", borderTop: "1px dashed var(--border-strong)", fontSize: 13, color: "var(--text-muted)" }}>
        No students found for this year.
      </div>
    );
  }

  return (
    <div style={{ padding: "0 14px 12px", background: "var(--surface-muted)", borderTop: "1px dashed var(--border-strong)" }}>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-panel)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: "10px 12px", boxShadow: "var(--shadow-soft)" }}>
          <FaSearch style={{ color: "var(--text-muted)", fontSize: 14 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student by name or ID"
            style={{ width: "100%", border: "none", outline: "none", fontSize: 13, background: "transparent", color: "var(--text-primary)" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: "100%", overflowX: "auto", paddingBottom: 1 }}>
          {gradeOptions.map((grade) => (
            <button
              key={grade}
              type="button"
              onClick={() => setSelectedGrade(grade)}
              style={chipStyle(selectedGrade === grade)}
            >
              {grade === "All" ? "All Grades" : `Grade ${grade}`}
            </button>
          ))}
        </div>

        {selectedGrade !== "All" && sectionOptions.length > 1 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: "100%", overflowX: "auto", paddingBottom: 1 }}>
            {sectionOptions.map((section) => (
              <button key={section} type="button" onClick={() => setSelectedSection(section)} style={chipStyle(selectedSection === section)}>
                {section === "All" ? "All Sections" : `Section ${section}`}
              </button>
            ))}
          </div>
        ) : null}

        <div style={{ marginTop: 2, fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>
          Showing {visibleStudents.length} of {students.length} students
        </div>

        {visibleStudents.length === 0 ? (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)" }}>
            No students match your search/filter.
          </div>
        ) : (
          <div style={{ border: "1px solid var(--border-soft)", borderRadius: 10, overflow: "hidden", background: "var(--surface-panel)" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.7fr",
                padding: "9px 12px",
                borderBottom: "1px solid var(--border-soft)",
                fontSize: 12,
                fontWeight: 800,
                color: "var(--text-secondary)",
              }}
            >
              <div>Student</div>
              <div>Grade</div>
              <div>Section</div>
              <div>Action</div>
            </div>

            {visibleStudents.map((student) => (
              <div
                key={student.studentId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.7fr",
                  padding: "9px 12px",
                  borderTop: "1px solid var(--border-soft)",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <ProfileAvatar
                      src={student.profileImage}
                      name={student.name || "Student"}
                      alt={student.name || "Student"}
                      loading="lazy"
                      style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border-strong)", flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {student.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{student.studentId}</div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{student.grade || "—"}</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{student.section || "—"}</div>
                <div>
                  <button
                    type="button"
                    onClick={() => setSelectedStudent(student)}
                    style={{
                      border: "1px solid var(--border-strong)",
                      background: "linear-gradient(180deg, var(--surface-accent), var(--accent-soft))",
                      color: "var(--accent-strong)",
                      borderRadius: 8,
                      padding: "5px 10px",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      boxShadow: "var(--shadow-glow)",
                    }}
                  >
                    Show
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StudentDetailModal({ student, onClose }) {
  if (!student) return null;

  const sections = [
    { title: "Basic Information", data: student.basicStudentInformation, keyPrefix: "basic" },
    { title: "Guardian Information", data: student.parentInformation || student.guardianInformation, keyPrefix: "guardian" },
    { title: "Contact Information", data: student.contactInformation, keyPrefix: "contact" },
  ];

  const otherEntries = Object.entries(student).filter(
    ([key, value]) =>
      !["basicStudentInformation", "contactInformation", "parentInformation", "guardianInformation", "profileImage", "name", "studentId"].includes(key) &&
      (typeof value !== "object" || Array.isArray(value))
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "linear-gradient(180deg, var(--page-bg-secondary, #f7fbff) 0%, var(--page-bg) 100%)", overflowY: "auto", padding: "16px 20px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", background: "var(--surface-panel)", border: "1px solid var(--border-soft)", borderRadius: 16, boxShadow: "var(--shadow-panel)", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 16px", color: "#fff", background: "linear-gradient(135deg, var(--accent-strong), var(--accent))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ProfileAvatar
              src={student.profileImage || "/default-profile.png"}
              name={student.name || "Student"}
              alt={student.name || "Student"}
              style={{ width: 56, height: 56, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.8)", objectFit: "cover" }}
            />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{student.name || "Student"}</div>
              <div style={{ fontSize: 12, opacity: 0.95 }}>
                {student.studentId || "No student ID"}
                {student.grade ? ` • Grade ${student.grade}` : ""}
                {student.section ? ` • Section ${student.section}` : ""}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "1px solid rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.14)", color: "#fff", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 700 }}
          >
            Exit Full Screen
          </button>
        </div>

        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {/* Overview */}
          <SectionCard title="Overview">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <FieldTile label="Grade" value={student.grade || "—"} />
              <FieldTile label="Section" value={student.section || "—"} />
              <FieldTile label="Email" value={student.email || "—"} />
              <FieldTile label="User ID" value={student.userId || "—"} />
            </div>
          </SectionCard>

          {sections.map((section) =>
            section.data ? (
              <SectionCard key={section.keyPrefix} title={section.title}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                  {Object.entries(section.data).map(([key, value]) => (
                    <FieldTile
                      key={`${section.keyPrefix}-${key}`}
                      label={formatFieldLabel(key)}
                      value={formatFieldValue(value)}
                    />
                  ))}
                </div>
              </SectionCard>
            ) : null
          )}

          {otherEntries.length > 0 ? (
            <div style={{ background: "var(--surface-panel)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: 12, boxShadow: "var(--shadow-soft)", gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)", marginBottom: 8 }}>Other Information</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                {otherEntries.map(([key, value]) => (
                  <FieldTile key={`other-${key}`} label={formatFieldLabel(key)} value={formatFieldValue(value)} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div style={{ background: "var(--surface-panel)", border: "1px solid var(--border-soft)", borderRadius: 12, padding: 12, boxShadow: "var(--shadow-soft)" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function FieldTile({ label, value }) {
  return (
    <div style={{ background: "var(--surface-muted)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "9px 10px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 12, color: "var(--text-primary)", fontWeight: 700 }}>{value}</div>
    </div>
  );
}
