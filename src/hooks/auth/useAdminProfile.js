import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { BACKEND_BASE, FIREBASE_DATABASE_URL } from "../../config.js";

/**
 * useAdminProfile
 *
 * Owns the SettingsPage data layer:
 *   - admin profile state (from localStorage; mirrors the live record)
 *   - profile-image file selection + preview URL (with cleanup)
 *   - userRecordRef resolution (finds the admin's Users node key by
 *     direct push-key, then by userId-equalTo query, then by username)
 *   - 3 save handlers: profile image, account info (locked), password
 *   - logout
 *
 * Latent-bug fix: the original page used a hardcoded
 * RTDB_BASE = "https://bale-house-rental-default-rtdb.firebaseio.com",
 * which pointed at a different project. Password updates wrote to the wrong
 * DB. The hook now uses FIREBASE_DATABASE_URL from config.
 */
export default function useAdminProfile() {
  const navigate = useNavigate();

  const [admin, setAdmin] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("admin")) || {};
    } catch {
      return {};
    }
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [profileImage, setProfileImage] = useState(admin.profileImage || "/default-profile.png");
  const [userRecordRef, setUserRecordRef] = useState({ key: "", baseUrl: "" });

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const [name, setName] = useState(admin.name || "");
  const [username, setUsername] = useState(admin.username || "");
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const RTDB_BASE = FIREBASE_DATABASE_URL;
  const schoolCode = String(admin?.schoolCode || "").trim();
  const schoolUsersBaseUrl = schoolCode
    ? `${RTDB_BASE}/Platform1/Schools/${encodeURIComponent(schoolCode)}/Users`
    : `${RTDB_BASE}/Users`;
  const globalUsersBaseUrl = `${RTDB_BASE}/Users`;
  const shellUsersBaseUrl = schoolCode ? schoolUsersBaseUrl : globalUsersBaseUrl;

  // ---------------- IMAGE PREVIEW ----------------
  const profilePreview = useMemo(() => {
    if (!selectedFile) return profileImage;
    return URL.createObjectURL(selectedFile);
  }, [selectedFile, profileImage]);

  useEffect(() => {
    return () => {
      if (selectedFile && profilePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(profilePreview);
      }
    };
  }, [selectedFile, profilePreview]);

  // ---------------- USER RECORD REF RESOLUTION ----------------
  const resolveUserRecordRef = async () => {
    if (!admin?.userId && !admin?.username) return { key: "", baseUrl: shellUsersBaseUrl };
    const bases = schoolCode ? [schoolUsersBaseUrl, globalUsersBaseUrl] : [globalUsersBaseUrl];

    for (const baseUrl of bases) {
      // 1. Direct push-key lookup by userId (O(1), ~1KB)
      if (admin?.userId) {
        const directRes = await axios
          .get(`${baseUrl}/${encodeURIComponent(admin.userId)}.json`)
          .catch(() => ({ data: null }));
        if (directRes.data && typeof directRes.data === "object" && !Array.isArray(directRes.data)) {
          return { key: admin.userId, baseUrl };
        }
      }

      // 2. Query-filter by userId field (avoids downloading all Users)
      if (admin?.userId) {
        const orderBy = encodeURIComponent('"userId"');
        const equalTo = encodeURIComponent(`"${admin.userId}"`);
        const qRes = await axios
          .get(`${baseUrl}.json?orderBy=${orderBy}&equalTo=${equalTo}&limitToFirst=1`)
          .catch(() => ({ data: {} }));
        const firstKey = Object.keys(qRes.data || {})[0];
        if (firstKey) return { key: firstKey, baseUrl };
      }

      // 3. Query-filter by username field as last resort
      if (admin?.username) {
        const orderBy = encodeURIComponent('"username"');
        const equalTo = encodeURIComponent(`"${admin.username}"`);
        const qRes = await axios
          .get(`${baseUrl}.json?orderBy=${orderBy}&equalTo=${equalTo}&limitToFirst=1`)
          .catch(() => ({ data: {} }));
        const firstKey = Object.keys(qRes.data || {})[0];
        if (firstKey) return { key: firstKey, baseUrl };
      }
    }

    return { key: "", baseUrl: shellUsersBaseUrl };
  };

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      try {
        const resolved = await resolveUserRecordRef();
        if (!ignore) setUserRecordRef(resolved);
      } catch {
        if (!ignore) setUserRecordRef({ key: "", baseUrl: shellUsersBaseUrl });
      }
    };
    run();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin?.userId, admin?.username, schoolCode]);

  // ---------------- HANDLERS ----------------
  const handleFileChange = (e) => setSelectedFile(e.target.files[0]);

  const handleProfileSubmit = async () => {
    if (!selectedFile) {
      setStatus({ type: "error", message: "Select an image first." });
      return;
    }
    try {
      setSavingProfile(true);
      setStatus({ type: "", message: "" });

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("userId", admin.userId || "");
      formData.append("schoolCode", schoolCode || "");
      if (admin.profileImage && admin.profileImage.startsWith("http")) {
        formData.append("oldUrl", admin.profileImage);
      }

      const uploadRes = await axios.post(
        `${BACKEND_BASE}/api/upload-profile-image`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      if (!uploadRes.data?.success || !uploadRes.data?.url) {
        throw new Error(uploadRes.data?.message || "Upload failed");
      }

      const imageUrl = uploadRes.data.url;

      const updatedAdmin = { ...admin, profileImage: imageUrl };
      localStorage.setItem("admin", JSON.stringify(updatedAdmin));
      setAdmin(updatedAdmin);
      setProfileImage(imageUrl);
      setSelectedFile(null);
      setStatus({ type: "success", message: "Profile image updated successfully." });
    } catch (err) {
      console.error("Error updating profile image:", err);
      setStatus({ type: "error", message: "Failed to update profile image." });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleInfoUpdate = async () => {
    setStatus({
      type: "error",
      message: "Admin name and username are locked and cannot be edited from settings.",
    });
  };

  const handlePasswordChange = async () => {
    if (!oldPassword || !password || !confirmPassword) {
      setStatus({ type: "error", message: "Fill old password, new password, and confirm password." });
      return;
    }
    if (password.length < 8) {
      setStatus({ type: "error", message: "Password must be at least 8 characters." });
      return;
    }
    if (password !== confirmPassword) {
      setStatus({ type: "error", message: "Passwords do not match." });
      return;
    }
    try {
      setSavingPassword(true);
      setStatus({ type: "", message: "" });
      const resolved = userRecordRef.key ? userRecordRef : await resolveUserRecordRef();
      if (!resolved.key) throw new Error("Unable to find user profile record.");

      const currentUserRes = await axios.get(`${resolved.baseUrl}/${resolved.key}.json`);
      const currentUser = currentUserRes.data || {};
      const currentPassword = String(currentUser?.password || "");
      if (String(oldPassword) !== currentPassword) {
        setStatus({ type: "error", message: "Old password is incorrect." });
        return;
      }

      await axios.patch(
        `${resolved.baseUrl}/${resolved.key}.json`,
        { password }
      );
      setOldPassword("");
      setPassword("");
      setConfirmPassword("");
      setUserRecordRef(resolved);
      setStatus({ type: "success", message: "Password updated successfully." });
    } catch (err) {
      console.error("Error updating password:", err);
      setStatus({ type: "error", message: "Failed to update password." });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin");
    navigate("/");
  };

  return {
    admin,
    profilePreview,
    selectedFile,
    name, setName,
    username, setUsername,
    oldPassword, setOldPassword,
    password, setPassword,
    confirmPassword, setConfirmPassword,
    savingProfile, savingInfo, savingPassword,
    status,
    handleFileChange,
    handleProfileSubmit,
    handleInfoUpdate,
    handlePasswordChange,
    handleLogout,
  };
}
