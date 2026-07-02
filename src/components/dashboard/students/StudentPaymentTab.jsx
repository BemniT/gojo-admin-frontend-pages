import React from "react";

const SIDEBAR_SECTION_CARD = {
  background: "var(--surface-panel)",
  border: "1px solid var(--border-soft)",
  borderRadius: 16,
  boxShadow: "var(--shadow-soft)",
};

/**
 * StudentPaymentTab
 *
 * Read-only monthly payment history for the selected student.
 * Renders a green/red row per month based on `paymentHistory[monthKey]`.
 */
export default function StudentPaymentTab({ selectedStudent, paymentHistory }) {
  return (
    <div style={{ ...SIDEBAR_SECTION_CARD, position: "relative", padding: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.45px" }}>
          Payments
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
          Monthly payment status in a simpler list.
        </div>
      </div>

      {!selectedStudent ? (
        <p style={{ textAlign: "center", color: "var(--text-muted)" }}>Select a student to view payment history.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.keys(paymentHistory).length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-muted)" }}>Loading payment history...</p>
          ) : (
            Object.entries(paymentHistory).map(([monthKey, paid]) => {
              const [year, monthShort] = monthKey.split("-");
              return (
                <div
                  key={monthKey}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: paid ? "var(--success-soft)" : "var(--danger-soft)",
                    border: paid ? "1px solid var(--success)" : "1px solid var(--danger)",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 999, background: paid ? "var(--success)" : "var(--danger)" }} />
                    <div style={{ fontWeight: 700 }}>{monthShort} {year}</div>
                  </div>
                  <div style={{ fontWeight: 800, color: paid ? "var(--success)" : "var(--danger)" }}>
                    {paid ? "Paid" : "Unpaid"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
