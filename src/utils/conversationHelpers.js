export const getConversationSortTime = (rawValue) => {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === "string") {
    const trimmedValue = rawValue.trim();
    if (!trimmedValue) {
      return 0;
    }

    const numericValue = Number(trimmedValue);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const parsedTime = new Date(trimmedValue).getTime();
    if (!Number.isNaN(parsedTime)) {
      return parsedTime;
    }
  }

  return 0;
};

export const hasConversationUserSentMessage = (chatValue, userId) => {
  const normalizedUserId = String(userId || "").trim();
  if (!chatValue || !normalizedUserId) {
    return false;
  }

  const messages = chatValue?.messages;
  if (!messages || typeof messages !== "object") {
    return false;
  }

  return Object.values(messages).some(
    (messageValue) => String(messageValue?.senderId || "").trim() === normalizedUserId
  );
};

export const resolveConversationOtherUserId = (summary = {}, currentUserId = "") => {
  const explicitOtherUserId = String(summary?.otherUserId || "").trim();
  if (explicitOtherUserId) {
    return explicitOtherUserId;
  }

  const normalizedCurrentUserId = String(currentUserId || "").trim();
  if (!normalizedCurrentUserId) {
    return "";
  }

  return String(summary?.chatId || "")
    .split("_")
    .map((value) => String(value || "").trim())
    .find((participantId) => participantId && participantId !== normalizedCurrentUserId) || "";
};

export const normalizeConversationContactType = (value) => {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (normalizedValue === "teacher" || normalizedValue === "teachers") {
    return "teacher";
  }

  if (normalizedValue === "student" || normalizedValue === "students") {
    return "student";
  }

  if (normalizedValue === "parent" || normalizedValue === "parents") {
    return "parent";
  }

  if (
    normalizedValue === "management" ||
    normalizedValue === "managements" ||
    normalizedValue === "office" ||
    normalizedValue === "offices" ||
    normalizedValue === "hr" ||
    normalizedValue === "finance" ||
    normalizedValue === "registerer" ||
    normalizedValue === "registerers" ||
    normalizedValue === "registrar"
  ) {
    return "management";
  }

  return "";
};

export const formatAudienceLabel = (value) =>
  String(value || "")
    .split(/[\s,|]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/_/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    )
    .join(", ");