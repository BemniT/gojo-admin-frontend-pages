import React from "react";
import { Navigate } from "react-router-dom";

export function ProtectedRoute({ children }) {
  let admin = null;
  try {
    admin = JSON.parse(localStorage.getItem("admin"));
  } catch {}
  const hasSession = admin && typeof admin === "object" && !!admin.userId;
  if (!hasSession) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
