import React from "react";
import ProfileAvatar from "../../ProfileAvatar";

/**
 * Three thin presentational sections used by the Parents page right-side
 * profile panel (and by its fullscreen variant). They take only what they
 * render — no fetching, no state. The parent panel composes them and passes
 * the shared style + helper props.
 */

export function ParentDetailsSection({
  activeParent,
  parentIsActive,
  togglingParentActive,
  toggleParentActive,
  children,
  formattedRelationships,
  profileItems,
  detailsCardStyle,
  infoTileStyle,
  statusValueColor,
}) {
  return (
    <div style={detailsCardStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Parent profile
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>Cleaner guardian and contact snapshot.</div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: parentIsActive ? "var(--success)" : "var(--danger)", fontSize: 11, fontWeight: 900 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: parentIsActive ? "var(--success)" : "var(--danger)" }} />
          {parentIsActive ? "Active" : "Inactive"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          type="button"
          onClick={toggleParentActive}
          disabled={togglingParentActive}
          style={{
            border: "none",
            borderRadius: 10,
            padding: "8px 12px",
            background: parentIsActive ? "#ff4d4f" : "var(--accent-strong)",
            color: "#fff",
            cursor: togglingParentActive ? "not-allowed" : "pointer",
            fontSize: 11,
            fontWeight: 800,
            opacity: togglingParentActive ? 0.75 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {togglingParentActive ? "Saving..." : parentIsActive ? "Deactivate" : "Activate"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
        {[
          { label: "Children", value: children.length || 0 },
          { label: "Status", value: parentIsActive ? "Active" : "Inactive" },
          { label: "Relation", value: formattedRelationships === "—" ? "N/A" : formattedRelationships.split(",")[0] },
        ].map((item) => (
          <div key={item.label} style={{ background: "var(--surface-soft)", border: "1px solid var(--border-soft)", borderRadius: 14, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{item.label}</div>
            <div style={{ fontSize: item.label === "Relation" ? 12 : 20, fontWeight: 900, color: statusValueColor(item.label === "Status" ? "Status" : item.label, item.value), marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 14px", borderRadius: 14, background: "var(--surface-soft)", border: "1px solid var(--border-soft)", marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.45px" }}>Parent ID</div>
        <div style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 900, marginTop: 4 }}>{activeParent.parentId || "N/A"}</div>
      </div>

      <div style={{ ...detailsCardStyle, padding: 14, boxShadow: "none", margin: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.45px", marginBottom: 10 }}>Profile details</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {profileItems.map((item) => (
            <div key={item.label} style={{ ...infoTileStyle, gridColumn: item.fullWidth ? "1 / -1" : "auto" }}>
              <div>
                <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.4px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: statusValueColor(item.label, item.value), marginTop: 2, wordBreak: "break-word" }}>
                  {item.value || <span style={{ color: "var(--text-muted)" }}>N/A</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ParentChildrenSection({ children, elevatedPanelStyle }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {children.length === 0 ? (
        <div style={{ padding: 10, borderRadius: 12, border: "1px solid var(--border-soft)", background: "var(--surface-panel)", color: "var(--text-muted)" }}>
          No children found.
        </div>
      ) : (
        children.map((c) => (
          <div
            key={c.studentId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px",
              borderRadius: 12,
              ...elevatedPanelStyle,
            }}
          >
            <ProfileAvatar src={c.profileImage} name={c.name} alt={c.name} loading="lazy" style={{ width: 44, height: 44, borderRadius: 22, objectFit: "cover", border: "2px solid var(--accent-strong)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-primary)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.name}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                Grade {c.grade}{c.section ? ` • ${c.section}` : ""}
                {` • Relation: ${c.relationship || "N/A"}`}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function ParentStatusSection({ selectedParent }) {
  return (
    <div style={{ padding: "12px", borderRadius: 12, border: "1px solid var(--border-soft)", background: "var(--surface-panel)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { label: "Status", value: selectedParent.status || "Active" },
          { label: "Created", value: selectedParent.createdAt ? new Date(selectedParent.createdAt).toLocaleString() : "—" },
        ].map((item) => (
          <div key={item.label} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--border-soft)", background: "var(--surface-muted)" }}>
            <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.4px", color: "var(--text-muted)", textTransform: "uppercase" }}>{item.label}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-primary)", marginTop: 2, wordBreak: "break-word" }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
