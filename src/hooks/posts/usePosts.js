import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { BACKEND_BASE } from "../../config.js";
import { optimizePostMedia } from "../../utils/postMedia.js";

const API_BASE = `${BACKEND_BASE}/api`;
const POSTS_CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_LIMIT = 20;
const CACHE_LIMIT = 60;
const DEFAULT_PROFILE_IMAGE = "/default-profile.png";

function readPostsCache(schoolCode) {
  try {
    const raw = localStorage.getItem(`dashboard_posts_cache_${schoolCode}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const posts = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.posts) ? parsed.posts : [];
    return posts.filter(Boolean);
  } catch {
    return [];
  }
}

function writePostsCache(schoolCode, posts) {
  try {
    localStorage.setItem(
      `dashboard_posts_cache_${schoolCode}`,
      JSON.stringify({ posts: posts.slice(0, CACHE_LIMIT), expiresAt: Date.now() + POSTS_CACHE_TTL_MS })
    );
  } catch {}
}

function normalizePostLikes(likes) {
  if (Array.isArray(likes)) {
    return likes.reduce((acc, v) => { const k = String(v || "").trim(); if (k) acc[k] = true; return acc; }, {});
  }
  if (likes && typeof likes === "object") {
    return Object.entries(likes).reduce((acc, [k, v]) => { if (k && v) acc[k] = true; return acc; }, {});
  }
  return {};
}

export function isPostLikedByActor(post, actorId) {
  const id = String(actorId || "").trim();
  if (!id) return false;
  return Boolean(normalizePostLikes(post?.likes)[id]);
}

export function likeCountForPost(post) {
  const explicit = Number(post?.likeCount);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return Object.keys(normalizePostLikes(post?.likes)).length;
}

export function formatPostTimestamp(timestamp) {
  if (!timestamp) return "Recent";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "Recent";
  const diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (diff < 1) return "Just now";
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatAudienceLabel(value) {
  return String(value || "")
    .split(/[\s,|]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/_/g, " ").split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "))
    .join(", ");
}

export function shouldShowPostSeeMore(message = "") {
  const m = String(message || "").trim();
  if (!m) return false;
  return m.length > 180 || m.split(/[.!?]+/).filter(Boolean).length > 2 || m.split(/\r?\n/).filter(Boolean).length > 2;
}

export function getSafeMediaUrl(value) {
  const v = String(value || "").trim();
  if (!v || v === "null" || v === "undefined" || v.startsWith("file://") || v.startsWith("content://")) return "";
  return v;
}

export const MESSAGE_PREVIEW_LIMIT = 220;
export const DEFAULT_TARGET_ROLE_OPTIONS = [
  "all", "student", "parent", "teacher", "registerer", "finance", "hr", "admin",
];

export function usePosts({ adminUserId, schoolScopeCode, schoolCode, admin }) {
  const effectiveCode = schoolScopeCode || schoolCode || "";
  const initialPosts = readPostsCache(effectiveCode);

  const [posts, setPosts] = useState(initialPosts);
  const [postsLoading, setPostsLoading] = useState(initialPosts.length === 0 && Boolean(effectiveCode));
  const [postsInitialized, setPostsInitialized] = useState(initialPosts.length > 0);
  const [likePendingPostIds, setLikePendingPostIds] = useState({});
  const [expandedPostDescriptions, setExpandedPostDescriptions] = useState({});

  // Post creation state
  const [postText, setPostText] = useState("");
  const [postMedia, setPostMedia] = useState(null);
  const [postMediaMeta, setPostMediaMeta] = useState(null);
  const [isOptimizingMedia, setIsOptimizingMedia] = useState(false);
  const [targetRole, setTargetRole] = useState("all");
  const [targetOptions] = useState(DEFAULT_TARGET_ROLE_OPTIONS);
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [postSubmitError, setPostSubmitError] = useState("");
  const fileInputRef = useRef(null);

  const requestIdRef = useRef(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMorePosts = useCallback(async () => {
    if (loadingMore || !hasMore || !effectiveCode || posts.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = posts[posts.length - 1];
      const beforeTime = oldest?.time || oldest?.createdAt || "";
      const res = await axios.get(`${API_BASE}/get_posts`, {
        params: { schoolCode: effectiveCode, limit: FETCH_LIMIT, before: beforeTime },
        timeout: 4500,
      });
      const raw = Array.isArray(res.data) ? res.data : [];
      if (raw.length < FETCH_LIMIT) setHasMore(false);
      setPosts((prev) => [...prev, ...raw.filter(Boolean)]);
    } catch {} finally {
      setLoadingMore(false);
    }
  }, [posts, hasMore, loadingMore, effectiveCode]);

  const currentLikeActorId = adminUserId || "";

  const fetchPosts = useCallback(async ({ force = false } = {}) => {
    const id = ++requestIdRef.current;
    const code = effectiveCode;
    if (!code) { setPostsLoading(false); return; }
    // Check cache freshness first
    if (!force) {
      try {
        const raw = localStorage.getItem(`dashboard_posts_cache_${code}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const expiresAt = Number(parsed?.expiresAt || 0);
          if (expiresAt > Date.now() && Array.isArray(parsed?.posts) && parsed.posts.length > 0) {
            setPosts(parsed.posts);
            setPostsInitialized(true);
            setPostsLoading(false);
            return;
          }
        }
      } catch {}
    }
    setPostsLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/get_posts`, {
        params: { schoolCode: code, limit: FETCH_LIMIT },
        timeout: 4500,
      });
      if (requestIdRef.current !== id) return;
      const raw = Array.isArray(res.data) ? res.data : [];
      const sorted = raw
        .filter(Boolean)
        .sort((a, b) => new Date(b.time || b.createdAt || 0) - new Date(a.time || a.createdAt || 0));
      setPosts(sorted);
      setPostsInitialized(true);
      writePostsCache(code, sorted);
    } catch {
      if (requestIdRef.current !== id) return;
      const cached = readPostsCache(code);
      if (cached.length > 0) setPosts(cached);
    } finally {
      if (requestIdRef.current === id) setPostsLoading(false);
    }
  }, [effectiveCode]);

  useEffect(() => {
    if (effectiveCode) fetchPosts();
  }, [effectiveCode, fetchPosts]);

  const togglePostDescription = useCallback((postId) => {
    setExpandedPostDescriptions((prev) => ({ ...prev, [postId]: !prev[postId] }));
  }, []);

  /**
   * Mark a post as seen locally. The backend write is handled by
   * useTopbarNotifications.markPostAsSeen when a user clicks a notification.
   * This function only updates local state + cache so derived counts
   * (e.g. dashboard notification badge) reflect the change immediately.
   */
  const markPostSeen = useCallback((postId) => {
    const targetId = String(postId || "");
    if (!targetId || !currentLikeActorId) return;
    setPosts((prev) => {
      const next = prev.map((p) =>
        String(p?.postId) === targetId
          ? { ...p, seenBy: { ...(p.seenBy || {}), [currentLikeActorId]: true } }
          : p
      );
      writePostsCache(effectiveCode, next);
      return next;
    });
  }, [currentLikeActorId, effectiveCode]);

  const handleLike = useCallback(async (postId) => {
    const id = String(postId || "").trim();
    if (!currentLikeActorId || !id || likePendingPostIds[id]) return;

    const current = posts.find((p) => String(p?.postId) === id);
    if (!current) return;

    const prevLikes = normalizePostLikes(current.likes);
    const wasLiked = Boolean(prevLikes[currentLikeActorId]);
    const nextLikes = { ...prevLikes };
    if (wasLiked) delete nextLikes[currentLikeActorId];
    else nextLikes[currentLikeActorId] = true;

    setLikePendingPostIds((s) => ({ ...s, [id]: true }));
    setPosts((prev) => prev.map((p) => String(p?.postId) === id ? { ...p, likeCount: Object.keys(nextLikes).length, likes: nextLikes } : p));

    try {
      const res = await axios.post(`${API_BASE}/like_post`, {
        postId: id,
        adminId: admin?.adminId || admin?.userId || currentLikeActorId,
        userId: admin?.userId || currentLikeActorId,
        schoolCode: effectiveCode,
      });
      if (!res.data?.success) throw new Error();
      const liked = Boolean(res.data.liked);
      const count = Number(res.data.likeCount);
      const synced = { ...nextLikes };
      if (liked) synced[currentLikeActorId] = true;
      else delete synced[currentLikeActorId];
      setPosts((prev) => prev.map((p) => String(p?.postId) === id ? { ...p, likeCount: Number.isFinite(count) && count >= 0 ? count : Object.keys(synced).length, likes: synced } : p));
    } catch {
      setPosts((prev) => prev.map((p) => String(p?.postId) === id ? { ...p, likeCount: Object.keys(prevLikes).length, likes: prevLikes } : p));
    } finally {
      setLikePendingPostIds((s) => { const n = { ...s }; delete n[id]; return n; });
    }
  }, [currentLikeActorId, effectiveCode, likePendingPostIds, posts, admin]);

  const handleDelete = useCallback(async (postId) => {
    const targetId = String(postId);
    setPosts((prev) => {
      const next = prev.filter((p) => String(p?.postId) !== targetId);
      writePostsCache(effectiveCode, next);
      return next;
    });
    try {
      await axios.delete(`${API_BASE}/delete_post/${postId}`, {
        data: { adminId: admin?.adminId || admin?.userId || "" },
      });
    } catch {
      // Server failed - revert by forcing a refresh
      fetchPosts({ force: true });
    }
  }, [fetchPosts, effectiveCode, admin]);

  const editPost = useCallback(async (postId, newText) => {
    if (!newText?.trim()) return;
    setPosts((prev) => {
      const next = prev.map((p) => String(p?.postId) === String(postId) ? { ...p, message: newText } : p);
      writePostsCache(effectiveCode, next);
      return next;
    });
    try {
      await axios.post(`${API_BASE}/edit_post/${postId}`, {
        adminId: admin?.adminId || admin?.userId || "",
        postText: newText,
      });
    } catch {
      fetchPosts({ force: true });
    }
  }, [fetchPosts, effectiveCode, admin]);

  // ---- Create post flow ----
  const handlePostMediaSelection = useCallback(async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      setPostMedia(null);
      setPostMediaMeta(null);
      return;
    }
    setIsOptimizingMedia(true);
    try {
      const result = await optimizePostMedia(file);
      setPostMedia(result.file);
      setPostMediaMeta({
        originalSize: result.originalSize,
        finalSize: result.finalSize,
        wasCompressed: result.wasCompressed,
        wasConvertedToJpeg: result.wasConvertedToJpeg,
      });
    } catch (error) {
      console.error("Failed to optimize media:", error);
      setPostMedia(file);
      setPostMediaMeta({
        originalSize: Number(file.size || 0),
        finalSize: Number(file.size || 0),
        wasCompressed: false,
        wasConvertedToJpeg: false,
      });
    } finally {
      setIsOptimizingMedia(false);
    }
  }, []);

  const handleOpenPostMediaPicker = useCallback(() => {
    if (isOptimizingMedia) return;
    fileInputRef.current?.click();
  }, [isOptimizingMedia]);

  const resetCreatePostForm = useCallback(() => {
    setPostText("");
    setPostMedia(null);
    setPostMediaMeta(null);
    setPostSubmitError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSubmitCreatePost = useCallback(async () => {
    if (!postText.trim() && !postMedia) return false;
    if (isOptimizingMedia || postSubmitting) return false;

    const adminId = admin?.adminId || "";
    const userId = admin?.userId || adminId;
    if (!adminId || !userId) {
      setPostSubmitError("Session expired. Please log in again.");
      return false;
    }

    setPostSubmitting(true);
    setPostSubmitError("");
    try {
      const formData = new FormData();
      formData.append("message", postText);
      formData.append("adminId", adminId);
      formData.append("userId", userId);
      formData.append("adminName", admin?.name || admin?.username || "Admin");
      formData.append("adminProfile", admin?.profileImage || DEFAULT_PROFILE_IMAGE);
      formData.append("schoolCode", effectiveCode || "");
      formData.append("targetRole", targetRole || "all");
      if (postMedia) formData.append("post_media", postMedia);

      const res = await axios.post(`${API_BASE}/create_post`, formData);
      if (res.data?.success === false) {
        throw new Error(res.data.message || "Post could not be published.");
      }
      resetCreatePostForm();
      await fetchPosts({ force: true });
      return true;
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Post could not be published.";
      setPostSubmitError(msg);
      return false;
    } finally {
      setPostSubmitting(false);
    }
  }, [postText, postMedia, isOptimizingMedia, postSubmitting, admin, effectiveCode, targetRole, fetchPosts, resetCreatePostForm]);

  const canSubmitPost = Boolean(postText.trim() || postMedia) && !isOptimizingMedia;

  return {
    posts,
    postsLoading,
    postsInitialized,
    likePendingPostIds,
    expandedPostDescriptions,
    currentLikeActorId,
    fetchPosts,
    togglePostDescription,
    markPostSeen,
    handleLike,
    handleDelete,
    editPost,
    isPostLikedByActor,
    likeCountForPost,
    formatPostTimestamp,
    formatAudienceLabel,
    shouldShowPostSeeMore,
    getSafeMediaUrl,
    MESSAGE_PREVIEW_LIMIT,
    shouldShowPostsLoadingState: (postsLoading || !postsInitialized) && posts.length === 0,
    hasMore,
    loadingMore,
    loadMorePosts,

    // Create post flow
    postText, setPostText,
    postMedia, setPostMedia,
    postMediaMeta,
    isOptimizingMedia,
    targetRole, setTargetRole,
    targetOptions,
    postSubmitting,
    postSubmitError,
    fileInputRef,
    handlePostMediaSelection,
    handleOpenPostMediaPicker,
    handleSubmitCreatePost,
    canSubmitPost,
    resetCreatePostForm,
  };
}