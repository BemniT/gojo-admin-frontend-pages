import React from "react";

// Design tokens for the dashboard family of pages.
// Setting these on a single root container instead of repeating them in every page.
const DESIGN_TOKENS = {
  background: "#FFFFFF",
  minHeight: "100vh",
  height: "auto",
  // NOTE: don't add overflow here — any overflow value breaks `position: sticky` on child columns.
  color: "var(--text-primary)",
  "--surface-panel": "#FFFFFF",
  "--surface-accent": "#F1F8FF",
  "--surface-muted": "#F7FBFF",
  "--surface-strong": "#DCEBFF",
  "--page-bg": "#FFFFFF",
  "--border-soft": "#D7E7FB",
  "--border-strong": "#B5D2F8",
  "--text-primary": "#0f172a",
  "--text-secondary": "#334155",
  "--text-muted": "#64748b",
  "--accent": "#007AFB",
  "--accent-soft": "#E7F2FF",
  "--accent-strong": "#007afb",
  "--success": "#00B6A9",
  "--success-soft": "#E9FBF9",
  "--success-border": "#AAEDE7",
  "--warning": "#DC2626",
  "--warning-soft": "#FEE2E2",
  "--warning-border": "#FCA5A5",
  "--danger": "#b91c1c",
  "--danger-border": "#fca5a5",
  "--sidebar-width": "clamp(230px, 16vw, 290px)",
  "--surface-overlay": "#F1F8FF",
  "--input-bg": "#FFFFFF",
  "--input-border": "#B5D2F8",
  "--shadow-soft": "0 10px 24px rgba(0, 122, 251, 0.10)",
  "--shadow-panel": "0 14px 30px rgba(0, 122, 251, 0.14)",
  "--shadow-glow": "0 0 0 2px rgba(0, 122, 251, 0.18)",
};

/**
 * DashboardLayout
 * Provides the design tokens and the three-column flex shell.
 *
 * Static styles (scrollbars, .facebook-post-card classes, .section-header-card,
 * responsive breakpoint) live in `src/styles/dashboard-shared.css` so they
 * stay mounted across page navigation — putting them in an inline <style>
 * tag here would cause a flicker on every route change because the tag
 * unmounts and remounts with this component.
 *
 * Pages compose:
 *   <DashboardLayout middle={...} right={...} modals={...} />
 */
export default function DashboardLayout({ middle, right, modals, isOverlayModalOpen, fullWidthMiddle = false }) {
  return (
    <div className="dashboard-page" style={DESIGN_TOKENS}>
      <div
        className="dashboard-shell"
        style={{
          display: "flex",
          gap: 6,
          // The fixed Sidebar in AdminTopbarLayout sits at `left: 14`. We need to
          // start our sidebar-spacer at the same offset so the middle column
          // doesn't overlap the sidebar's right edge.
          // The fixed Navbar is 56px tall; pad the top so content clears it.
          padding: "calc(var(--topbar-height, 56px) + 4px) 6px 0 14px",
          minHeight: "100vh",
          background: "var(--page-bg)",
          width: "100%",
          boxSizing: "border-box",
          alignItems: "flex-start",
        }}
      >
        <div
          className="admin-sidebar-spacer"
          style={{
            width: "var(--sidebar-width)",
            minWidth: "var(--sidebar-width)",
            flex: "0 0 var(--sidebar-width)",
            pointerEvents: "none",
          }}
        />

        <div
          className="dashboard-middle"
          style={{
            flex: "1 1 0",
            minWidth: 0,
            alignSelf: "flex-start",
            minHeight: "100vh",
            position: "relative",
            padding: "0 4px 0 0",
            // Narrow feeds (Dashboard/MyPosts) center their inner 760px column.
            // Full-width pages (Overview) opt out by passing `fullWidthMiddle`.
            display: "flex",
            justifyContent: fullWidthMiddle ? "flex-start" : "center",
            opacity: isOverlayModalOpen ? 0.45 : 1,
            filter: isOverlayModalOpen ? "blur(1px)" : "none",
            pointerEvents: isOverlayModalOpen ? "none" : "auto",
            transition: "opacity 180ms ease, filter 180ms ease",
          }}
        >
          {middle}
        </div>

        {right}
      </div>

      {modals}
    </div>
  );
}
