import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { BACKEND_BASE } from "../../config.js";

const STORAGE_KEY = "admin";

const safeReadStoredAdmin = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (error) {
    return {};
  }
};

const normalizeAdminRecord = (adminData = {}) => ({
  adminId: adminData.adminId || "",
  userId: adminData.userId || adminData.adminId || "",
  schoolCode: adminData.schoolCode || "",
  name: adminData.name || adminData.username || "Admin",
  username: adminData.username || "",
  role: adminData.role || adminData.userType || "admin",
  profileImage: adminData.profileImage || "/default-profile.png",
  isActive: adminData.isActive || false,
});

export function useAdminSession() {
  const [admin, setAdminState] = useState(() => safeReadStoredAdmin());
  const [loadingAdmin, setLoadingAdmin] = useState(true);

  const setAdmin = useCallback((nextAdmin) => {
    setAdminState((currentAdmin) => {
      const resolvedAdmin = typeof nextAdmin === "function" ? nextAdmin(currentAdmin) : nextAdmin;

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(resolvedAdmin || {}));
      } catch (error) {
        // Ignore localStorage write issues.
      }

      return resolvedAdmin || {};
    });
  }, []);

  const loadAdminFromStorage = useCallback(async () => {
    const storedAdmin = safeReadStoredAdmin();

    if (!storedAdmin || (!storedAdmin.userId && !storedAdmin.adminId)) {
      setAdminState({});
      setLoadingAdmin(false);
      return;
    }

    const normalizedStoredAdmin = normalizeAdminRecord(storedAdmin);
    setAdmin(normalizedStoredAdmin);
    setLoadingAdmin(false);

    const lookupId = storedAdmin.userId || storedAdmin.adminId;
    if (!lookupId) {
      return;
    }

    try {
      const profileRes = await axios.get(`${BACKEND_BASE}/api/admin/${lookupId}`, { timeout: 3500 });
      const profile = profileRes.data?.admin;

      if (!profileRes.data?.success || !profile) {
        return;
      }

      const nextAdmin = {
        adminId: profile.adminId || storedAdmin.adminId,
        userId: profile.userId || storedAdmin.userId,
        schoolCode: profile.schoolCode || storedAdmin.schoolCode || "",
        name: profile.name || "Admin",
        username: profile.username || "",
        role: profile.role || storedAdmin.role || storedAdmin.userType || "admin",
        profileImage: profile.profileImage || "/default-profile.png",
        isActive: profile.isActive ?? storedAdmin.isActive ?? false,
      };

      setAdmin(nextAdmin);
    } catch (error) {
      // Keep the stored admin snapshot if the refresh fails.
    }
  }, [setAdmin]);

  useEffect(() => {
    loadAdminFromStorage();
  }, [loadAdminFromStorage]);

  return {
    admin,
    setAdmin,
    loadingAdmin,
    hasSession: Boolean(admin?.userId || admin?.adminId),
  };
}