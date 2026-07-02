import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { useAdminSession } from "../hooks/auth/useAdminSession";
import { usePosts } from "../hooks/posts/usePosts";
import { useConversations } from "../hooks/chat/useConversations";
import { useCalendar } from "../hooks/calendar/useCalendar";

import DashboardLayout from "../components/dashboard/layout/DashboardLayout";
import PostsFeed from "../components/dashboard/posts/PostsFeed";
import RightSidebar from "../components/dashboard/layout/RightSidebar";
import CreatePostModal from "../components/dashboard/posts/CreatePostModal";
import CalendarEventModal from "../components/dashboard/calendar/CalendarEventModal";
import ConfirmDialog from "../components/dashboard/modals/ConfirmDialog";
import EditPostModal from "../components/EditPostModal";
import Toast from "../components/Toast";

function MyPosts() {
  const navigate = useNavigate();
  const location = useLocation();

  const { admin, loadingAdmin } = useAdminSession();

  const postsApi = usePosts({
    adminUserId: admin?.userId || admin?.adminId || "",
    schoolScopeCode: admin?.schoolCode || "",
    schoolCode: admin?.schoolCode || "",
    admin,
  });

  const { posts: allPosts, handleDelete, editPost, resetCreatePostForm, handleSubmitCreatePost, markPostSeen } = postsApi;

  // Filter posts down to ones authored by the current admin.
  const myPosts = useMemo(
    () =>
      allPosts.filter(
        (post) =>
          post.userId === admin?.userId ||
          post.adminId === admin?.adminId
      ),
    [allPosts, admin?.userId, admin?.adminId]
  );

  const { conversations } = useConversations({
    adminUserId: admin?.userId || admin?.adminId || "",
    schoolScopeCode: admin?.schoolCode || "",
    schoolCode: admin?.schoolCode || "",
  });

  const cal = useCalendar({
    schoolScopeCode: admin?.schoolCode || "",
    adminRole: admin?.role || "admin",
  });

  const [editingPost, setEditingPost] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [highlightedPostId, setHighlightedPostId] = useState("");
  const [toast, setToast] = useState(null);

  const postIdToScroll = location.state?.postIdToScroll || location.state?.postId || "";
  useEffect(() => {
    if (!postIdToScroll) return;
    setHighlightedPostId(postIdToScroll);
    markPostSeen(postIdToScroll);
    const el = document.getElementById(`post-${postIdToScroll}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlightedPostId(""), 1800);
    return () => clearTimeout(t);
  }, [postIdToScroll, markPostSeen]);

  const totalUnreadMessages = useMemo(
    () => conversations.reduce((sum, c) => sum + (Number(c.unreadForMe) || 0), 0),
    [conversations]
  );
  const messageCount = totalUnreadMessages;
  const totalNotifications = useMemo(
    () => allPosts.filter((p) => !p?.seenBy || !p.seenBy[admin?.userId]).length + messageCount,
    [allPosts, admin?.userId, messageCount]
  );
  const todaysPostsCount = useMemo(() => {
    const today = new Date().toDateString();
    return myPosts.filter(
      (p) => new Date(p.time || p.createdAt || Date.now()).toDateString() === today
    ).length;
  }, [myPosts]);

  const totalPostLikes = useMemo(
    () => myPosts.reduce((sum, p) => sum + Number(p.likeCount || 0), 0),
    [myPosts]
  );
  const mediaPostCount = useMemo(
    () => myPosts.filter((p) => Boolean(p.postUrl)).length,
    [myPosts]
  );

  // MyPosts-specific stats (different from Dashboard)
  const stats = useMemo(
    () => [
      { label: "My Posts", value: myPosts.length },
      { label: "Likes", value: totalPostLikes },
      { label: "Media", value: mediaPostCount },
    ],
    [myPosts.length, totalPostLikes, mediaPostCount]
  );

  const isOverlayModalOpen = cal.showCalendarEventModal || showCreatePostModal;
  const adminUserId = admin?.userId || admin?.adminId || "";

  const requestDelete = (postId) => {
    setConfirmDialog({
      message: "Delete this post? This cannot be undone.",
      onConfirm: async () => {
        await handleDelete(postId);
        setToast({ message: "Post deleted", tone: "success" });
      },
    });
  };

  const handleEditPost = (post) =>
    setEditingPost({ id: post.postId, text: post.message || "" });

  if (loadingAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading...</div>
    );
  }

  const middle = (
    <PostsFeed
      admin={admin}
      title="My Posts"
      subtitle="Review, edit, and manage your announcements."
      posts={myPosts}
      postsApi={postsApi}
      highlightedPostId={highlightedPostId}
      onComposeClick={() => setShowCreatePostModal(true)}
      onEdit={handleEditPost}
      onDelete={requestDelete}
    />
  );

  const right = (
    <RightSidebar
      stats={stats}
      todaysPostsCount={todaysPostsCount}
      messageCount={messageCount}
      isOverlayModalOpen={isOverlayModalOpen}
      cal={cal}
      navigate={navigate}
      setConfirmDialog={setConfirmDialog}
    />
  );

  const modals = (
    <>
      <CreatePostModal
        isOpen={showCreatePostModal}
        admin={admin}
        postText={postsApi.postText}
        setPostText={postsApi.setPostText}
        postMedia={postsApi.postMedia}
        setPostMedia={postsApi.setPostMedia}
        postMediaMeta={postsApi.postMediaMeta}
        isOptimizingMedia={postsApi.isOptimizingMedia}
        targetRole={postsApi.targetRole}
        setTargetRole={postsApi.setTargetRole}
        targetOptions={postsApi.targetOptions}
        postSubmitting={postsApi.postSubmitting}
        postSubmitError={postsApi.postSubmitError}
        canSubmitPost={postsApi.canSubmitPost}
        fileInputRef={postsApi.fileInputRef}
        handlePostMediaSelection={postsApi.handlePostMediaSelection}
        handleOpenPostMediaPicker={postsApi.handleOpenPostMediaPicker}
        onSubmit={async () => {
          const ok = await handleSubmitCreatePost();
          if (ok) {
            setShowCreatePostModal(false);
            setToast({ message: "Post published successfully", tone: "success" });
          }
        }}
        onClose={() => {
          setShowCreatePostModal(false);
          resetCreatePostForm();
        }}
      />

      <CalendarEventModal cal={cal} adminUserId={adminUserId} />

      <EditPostModal
        isOpen={!!editingPost}
        initialText={editingPost?.text}
        onConfirm={async (newText) => {
          await editPost(editingPost.id, newText);
          setEditingPost(null);
          setToast({ message: "Post updated", tone: "success" });
        }}
        onCancel={() => setEditingPost(null)}
      />

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );

  return (
    <DashboardLayout
      middle={middle}
      right={right}
      modals={modals}
      isOverlayModalOpen={isOverlayModalOpen}
    />
  );
}

export default MyPosts;
