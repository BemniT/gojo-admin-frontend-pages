import React, { memo } from "react";
import { FaHeart, FaRegHeart, FaThumbsUp } from "react-icons/fa";
import ProfileAvatar from "../../ProfileAvatar";

const SHELL_CARD_STYLE = {
  background: "var(--surface-panel)",
  color: "var(--text-primary)",
  borderRadius: 16,
  border: "1px solid var(--border-soft)",
  boxShadow: "var(--shadow-soft)",
};

const MESSAGE_PREVIEW_LIMIT = 220;

function PostCard({
  post,
  isHighlighted,
  isLiked,
  isLikePending,
  isExpanded,
  isMine,
  likeCount,
  timeLabel,
  timestampTitle,
  targetRoleLabel,
  audienceBadgeLabel,
  canExpand,
  mediaUrl,
  onLike,
  onToggleExpand,
  onEdit,
  onDelete,
}) {
  const messageText = String(post.message || "");

  return (
    <div
      className="facebook-post-card"
      id={`post-${post.postId}`}
      style={{
        ...SHELL_CARD_STYLE,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08), 0 8px 20px rgba(15, 23, 42, 0.04)",
        background: isHighlighted ? "#fff9c4" : "var(--surface-panel)",
        transition: "background 0.4s ease",
      }}
    >
      <div className="facebook-post-card__header" style={{ padding: "12px 14px 10px" }}>
        <div className="facebook-post-card__header-main">
          <div className="facebook-post-card__avatar">
            <ProfileAvatar
              src={post.adminProfile}
              name={post.adminName || "Admin"}
              alt={post.adminName || "Admin"}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <div className="facebook-post-card__identity">
            <div className="facebook-post-card__identity-row">
              <h4>{post.adminName || "Admin"}</h4>
              <span className="facebook-post-card__page-badge">School Page</span>
            </div>
            <div className="facebook-post-card__meta" title={timestampTitle || undefined}>
              <span>{timeLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{targetRoleLabel}</span>
            </div>
          </div>
        </div>
        <div className="facebook-post-card__type-chip">Announcement</div>
      </div>

      {messageText ? (
        <div className="facebook-post-card__body" style={{ padding: "0 14px 12px" }}>
          <div className="facebook-post-card__message">
            {canExpand && !isExpanded
              ? `${messageText.slice(0, MESSAGE_PREVIEW_LIMIT).trimEnd()}...`
              : messageText}
          </div>
          {canExpand ? (
            <button
              type="button"
              className="facebook-post-card__read-more"
              onClick={() => onToggleExpand(post.postId)}
            >
              {isExpanded ? "See less" : "Read more"}
            </button>
          ) : null}
        </div>
      ) : null}

      {mediaUrl ? (
        <div className="facebook-post-card__media-shell">
          <img className="facebook-post-card__media" src={mediaUrl} alt="post media" loading="lazy" />
        </div>
      ) : null}

      <div className="facebook-post-card__stats" style={{ padding: "10px 14px 8px" }}>
        <div className="facebook-post-card__stats-left">
          {likeCount > 0 ? (
            <>
              <span className="facebook-post-card__reaction-bubble">
                <FaThumbsUp style={{ width: 10, height: 10 }} />
              </span>
              <span>{`${likeCount} ${likeCount === 1 ? "like" : "likes"}`}</span>
            </>
          ) : (
            <span>Be the first to react</span>
          )}
        </div>
        <div className="facebook-post-card__stats-right" title={targetRoleLabel}>
          <span>{audienceBadgeLabel}</span>
        </div>
      </div>

      <div className="facebook-post-card__actions" style={{ padding: "4px 10px 10px", gap: 6 }}>
        <button
          type="button"
          aria-pressed={isLiked}
          onClick={() => onLike(post.postId)}
          disabled={isLikePending}
          className={`facebook-post-card__action-button${isLiked ? " is-active" : ""}`}
          style={{
            opacity: isLikePending ? 0.78 : 1,
            cursor: isLikePending ? "progress" : "pointer",
            flex: 1,
          }}
        >
          {isLiked ? (
            <FaHeart style={{ width: 14, height: 14 }} />
          ) : (
            <FaRegHeart style={{ width: 14, height: 14 }} />
          )}
          <span>{isLiked ? "Liked" : "Like"}</span>
        </button>
        {isMine && onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(post)}
            className="facebook-post-card__action-button"
            style={{ flex: 1 }}
          >
            Edit
          </button>
        ) : null}
        {isMine && onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(post.postId)}
            className="facebook-post-card__action-button"
            style={{ flex: 1, color: "var(--danger)" }}
          >
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default memo(PostCard);
