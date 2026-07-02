import React from "react";
import { AiFillPicture, AiFillVideoCamera } from "react-icons/ai";
import ProfileAvatar from "../../ProfileAvatar";
import PostCard from "./PostCard";

const FEED_MAX_WIDTH = 760;
const FEED_SECTION_STYLE = {
  width: "100%",
  maxWidth: FEED_MAX_WIDTH,
  margin: "0 auto",
  boxSizing: "border-box",
};
const SHELL_CARD_STYLE = {
  background: "var(--surface-panel)",
  color: "var(--text-primary)",
  borderRadius: 16,
  border: "1px solid var(--border-soft)",
  boxShadow: "var(--shadow-soft)",
};

/**
 * PostsFeed
 * Shared middle column: feed header + post composer + posts list.
 *
 * Props:
 *   - admin
 *   - title, subtitle
 *   - posts, postsApi (the usePosts return)
 *   - highlightedPostId
 *   - onComposeClick (opens the create-post modal)
 *   - onEdit(post), onDelete(postId)
 */
export default function PostsFeed({
  admin,
  title,
  subtitle,
  posts,
  postsApi,
  highlightedPostId,
  onComposeClick,
  onEdit,
  onDelete,
}) {
  const {
    handleLike,
    likePendingPostIds,
    expandedPostDescriptions,
    togglePostDescription,
    shouldShowPostsLoadingState,
    currentLikeActorId,
    getSafeMediaUrl,
    formatAudienceLabel,
    likeCountForPost,
    isPostLikedByActor,
    shouldShowPostSeeMore,
    formatPostTimestamp,
    hasMore,
    loadingMore,
    loadMorePosts,
  } = postsApi;

  return (
    <div style={{ width: "100%", maxWidth: FEED_SECTION_STYLE.maxWidth }}>
      {/* Feed header */}
      <div className="section-header-card" style={{ ...FEED_SECTION_STYLE, margin: "0 auto 14px" }}>
        <div className="section-header-card__title" style={{ fontSize: 17 }}>{title}</div>
        {subtitle ? <div className="section-header-card__subtitle">{subtitle}</div> : null}
      </div>

      {/* Post composer */}
      <div
        className="post-box"
        style={{
          ...FEED_SECTION_STYLE,
          ...SHELL_CARD_STYLE,
          margin: "0 auto 14px",
          borderRadius: 12,
          overflow: "hidden",
          padding: "12px 14px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            background: "var(--surface-panel)",
            padding: 0,
          }}
        >
          <ProfileAvatar
            src={admin?.profileImage}
            name={admin?.name || "Admin"}
            alt={admin?.name || "Admin"}
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              objectFit: "cover",
              border: "1px solid var(--border-soft)",
              flexShrink: 0,
            }}
          />
          <button
            type="button"
            onClick={onComposeClick}
            style={{
              flex: 1,
              height: 42,
              border: "1px solid var(--border-soft)",
              background: "#f8fafc",
              borderRadius: 999,
              padding: "0 16px",
              fontSize: 14,
              textAlign: "left",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            What's on your mind?
          </button>
          <button
            type="button"
            onClick={onComposeClick}
            title="Live video"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              border: "1px solid rgba(15, 23, 42, 0.08)",
              borderRadius: 10,
              background: "#f8fafc",
              color: "var(--danger)",
              fontSize: 18,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <AiFillVideoCamera />
          </button>
          <button
            type="button"
            onClick={onComposeClick}
            title="Photo"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              border: "1px solid rgba(15, 23, 42, 0.08)",
              borderRadius: 10,
              background: "#f8fafc",
              color: "var(--success)",
              fontSize: 18,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <AiFillPicture />
          </button>
        </div>
      </div>

      {/* Posts list */}
      <div
        className="posts-container"
        style={{ ...FEED_SECTION_STYLE, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}
      >
        {shouldShowPostsLoadingState ? (
          <div style={{ ...SHELL_CARD_STYLE, borderRadius: 10, padding: 16, fontSize: 14, color: "var(--text-muted)", textAlign: "center" }}>
            Loading posts...
          </div>
        ) : posts.length === 0 ? (
          <div style={{ ...SHELL_CARD_STYLE, borderRadius: 10, padding: 16, fontSize: 14, color: "var(--text-muted)", textAlign: "center" }}>
            No posts to display.
          </div>
        ) : (
          posts.map((post) => {
            const normalizedRole = String(post.targetRole || "").trim().toLowerCase();
            const audienceLabel = formatAudienceLabel(normalizedRole) || "Selected audience";
            const isPublic = !normalizedRole || normalizedRole === "all";
            const targetRoleLabel = isPublic ? "Visible to everyone" : `Visible to ${audienceLabel}`;
            const audienceBadgeLabel = isPublic ? "Public update" : `${audienceLabel} update`;
            const ts = post.time || post.createdAt || "";
            const isMine =
              post.userId === admin?.userId || post.adminId === admin?.adminId;

            return (
              <PostCard
                key={post.postId}
                post={post}
                isHighlighted={highlightedPostId === post.postId}
                isLiked={isPostLikedByActor(post, currentLikeActorId)}
                isLikePending={Boolean(likePendingPostIds[post.postId])}
                isExpanded={Boolean(expandedPostDescriptions[post.postId])}
                isMine={isMine}
                likeCount={likeCountForPost(post)}
                timeLabel={formatPostTimestamp(ts)}
                timestampTitle={ts ? new Date(ts).toLocaleString() : ""}
                targetRoleLabel={targetRoleLabel}
                audienceBadgeLabel={audienceBadgeLabel}
                canExpand={shouldShowPostSeeMore(String(post.message || ""))}
                mediaUrl={getSafeMediaUrl(post.postUrl)}
                onLike={handleLike}
                onToggleExpand={togglePostDescription}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            );
          })
        )}

        {/* Load More button — only shows when there's actually more to fetch */}
        {!shouldShowPostsLoadingState && posts.length > 0 && hasMore ? (
          <button
            type="button"
            onClick={loadMorePosts}
            disabled={loadingMore}
            style={{
              alignSelf: "center",
              marginTop: 6,
              padding: "10px 24px",
              borderRadius: 999,
              border: "1px solid var(--border-soft)",
              background: loadingMore ? "var(--surface-strong)" : "var(--surface-panel)",
              color: loadingMore ? "var(--text-muted)" : "var(--accent-strong)",
              fontSize: 13,
              fontWeight: 800,
              cursor: loadingMore ? "progress" : "pointer",
              boxShadow: "0 4px 12px rgba(0, 122, 251, 0.08)",
              transition: "background 160ms ease, transform 160ms ease",
            }}
          >
            {loadingMore ? "Loading more..." : "Load more posts"}
          </button>
        ) : null}

        {!shouldShowPostsLoadingState && posts.length > 0 && !hasMore ? (
          <div
            style={{
              textAlign: "center",
              marginTop: 6,
              padding: "10px 12px",
              fontSize: 11,
              color: "var(--text-muted)",
              fontWeight: 600,
            }}
          >
            You've reached the end of the feed.
          </div>
        ) : null}
      </div>
    </div>
  );
}
