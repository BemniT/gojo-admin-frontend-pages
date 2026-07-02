export const normalizePostLikes = (likes) => {
  if (Array.isArray(likes)) {
    return likes.reduce((accumulator, value) => {
      const normalizedValue = String(value || "").trim();
      if (normalizedValue) {
        accumulator[normalizedValue] = true;
      }
      return accumulator;
    }, {});
  }

  if (likes && typeof likes === "object") {
    return Object.entries(likes).reduce((accumulator, [key, value]) => {
      const normalizedKey = String(key || "").trim();
      if (normalizedKey && value) {
        accumulator[normalizedKey] = true;
      }
      return accumulator;
    }, {});
  }

  return {};
};

export const isPostLikedByActor = (post, actorId) => {
  const normalizedActorId = String(actorId || "").trim();
  if (!normalizedActorId) {
    return false;
  }

  return Boolean(normalizePostLikes(post?.likes)[normalizedActorId]);
};

export const getResolvedLikeCount = (post) => {
  const explicitCount = Number(post?.likeCount);
  if (Number.isFinite(explicitCount) && explicitCount >= 0) {
    return explicitCount;
  }

  return Object.keys(normalizePostLikes(post?.likes)).length;
};

export const formatPostTimestamp = (timestamp) => {
  if (!timestamp) {
    return "Recent update";
  }

  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Recent update";
  }

  const diffInMinutes = Math.max(0, Math.floor((Date.now() - parsedDate.getTime()) / 60000));
  if (diffInMinutes < 1) {
    return "Just now";
  }

  if (diffInMinutes < 60) {
    return `${diffInMinutes}m`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d`;
  }

  const dateOptions = parsedDate.getFullYear() === new Date().getFullYear()
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };

  return parsedDate.toLocaleDateString("en-US", dateOptions);
};

export const shouldShowPostSeeMore = (message = "") => {
  const normalizedMessage = String(message || "").trim();
  if (!normalizedMessage) {
    return false;
  }

  const sentenceCount = normalizedMessage
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .length;
  const lineCount = normalizedMessage.split(/\r?\n/).filter(Boolean).length;

  return normalizedMessage.length > 180 || sentenceCount > 2 || lineCount > 2;
};

export const mergeUniquePosts = (...collections) => {
  const seenPostKeys = new Set();
  const mergedPosts = [];

  collections.flat().forEach((postItem, index) => {
    if (!postItem || typeof postItem !== "object") {
      return;
    }

    const postId = String(postItem.postId || postItem.id || "").trim();
    const fallbackKey = [
      postItem.userId || postItem.adminId || "anonymous",
      postItem.time || postItem.createdAt || `index-${index}`,
      postItem.message || postItem.postUrl || "",
    ].join("|");
    const uniqueKey = postId || fallbackKey;

    if (seenPostKeys.has(uniqueKey)) {
      return;
    }

    seenPostKeys.add(uniqueKey);
    mergedPosts.push({
      ...postItem,
      postId: postId || uniqueKey,
    });
  });

  return mergedPosts;
};