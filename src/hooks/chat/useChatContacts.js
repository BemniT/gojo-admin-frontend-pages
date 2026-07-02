import { useEffect, useState } from "react";
import axios from "axios";
import { ref, onValue } from "firebase/database";
import { db } from "../../firebase";
import {
  buildOwnerChatSummariesPath,
  getConversationSortTime,
  mapInBatches,
  normalizeChatSummaryValue,
} from "../../utils/chatRtdb";

const DEFAULT_PROFILE_IMAGE = "/default-profile.png";

const sortedChatId = (id1, id2) => {
  const a = String(id1 || "").trim();
  const b = String(id2 || "").trim();
  return [a, b].sort().join("_");
};

const sanitizeProfileImage = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_PROFILE_IMAGE;
  const lower = raw.toLowerCase();
  if (lower.startsWith("file://") || lower.startsWith("content://")) {
    return DEFAULT_PROFILE_IMAGE;
  }
  return raw;
};

const resolveAvatarSrc = (rawValue) => {
  const sanitized = sanitizeProfileImage(rawValue);
  if (!sanitized || sanitized === DEFAULT_PROFILE_IMAGE) return DEFAULT_PROFILE_IMAGE;
  return sanitized;
};

const isActiveRecord = (record = {}) => {
  const raw = record?.status ?? record?.isActive;
  if (typeof raw === "boolean") return raw;
  const normalized = String(raw || "active").toLowerCase();
  return normalized === "active" || normalized === "true" || normalized === "1";
};

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
};

const officeRoleLabel = (role) => {
  if (role === "hr") return "HR";
  if (role === "finance") return "Finance";
  if (role === "registerer") return "Registerer";
  return "Management";
};

const sortContactsBySummary = (left, right) =>
  String(left?.name || "").localeCompare(String(right?.name || ""), undefined, { sensitivity: "base" });

/**
 * useChatContacts
 *
 * Owns the AllChat page's left-rail contact data layer:
 *   - 4 contact arrays (teachers/students/parents/managements) hydrated from
 *     RTDB directory nodes with a Users-fallback path
 *   - unreadCounts map keyed by userId
 *   - loadingContacts flag
 *   - Bootstrap fetch effect (parallel reads of all directories + Users +
 *     owner-chat-summaries)
 *   - Realtime listener on owner-chat-summaries that re-merges last-message
 *     metadata into each contact list whenever a chat updates
 *
 * The page passes `adminUserId`, `apiBase`, and `schoolScopeCode`; everything
 * else (helpers, scoping, fallback logic) is internal to the hook.
 */
export default function useChatContacts({
  adminUserId,
  apiBase,
  schoolScopeCode,
}) {
  const schoolNodePrefix = schoolScopeCode ? `Platform1/Schools/${schoolScopeCode}` : "";
  const scopedPath = (path) => (schoolNodePrefix ? `${schoolNodePrefix}/${path}` : path);

  const readSchoolNodeApi = async (path, fallbackValue = {}) => {
    if (!schoolScopeCode) return fallbackValue;
    try {
      const response = await axios.get(`${apiBase}/school-node-read`, {
        params: { schoolCode: schoolScopeCode, path },
        timeout: 12000,
      });
      const data = response?.data?.data;
      return data === null || data === undefined ? fallbackValue : data;
    } catch {
      return fallbackValue;
    }
  };

  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [parents, setParents] = useState([]);
  const [managements, setManagements] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [loadingContacts, setLoadingContacts] = useState(false);

  // ---------------- BOOTSTRAP FETCH ----------------
  useEffect(() => {
    if (!adminUserId) return;

    const fetchUsers = async () => {
      setLoadingContacts(true);
      try {
        const [
          teachersRes,
          studentsRes,
          parentsRes,
          hrRes,
          financeRes,
          registerersRes,
          ownersRaw,
          teachersRaw,
          studentsRaw,
          parentsRaw,
          ownerSummariesRes,
        ] = await Promise.all([
          readSchoolNodeApi("TeacherDirectory", {}),
          readSchoolNodeApi("StudentDirectory", {}),
          readSchoolNodeApi("ParentDirectory", {}),
          readSchoolNodeApi("HR", {}),
          readSchoolNodeApi("Finance", {}),
          readSchoolNodeApi("Registerers", {}),
          readSchoolNodeApi("Users", {}),
          readSchoolNodeApi("Teachers", {}),
          readSchoolNodeApi("Students", {}),
          readSchoolNodeApi("Parents", {}),
          readSchoolNodeApi(buildOwnerChatSummariesPath(adminUserId), {}),
        ]);

        const usersById = Object.values(ownersRaw || {}).reduce((result, userRecord) => {
          const userId = String(userRecord?.userId || "").trim();
          if (userId) result[userId] = userRecord;
          return result;
        }, {});
        const ownerSummaries =
          ownerSummariesRes && typeof ownerSummariesRes === "object" ? ownerSummariesRes : {};
        const summaryByOtherUserId = Object.entries(ownerSummaries).reduce(
          (result, [chatId, summaryValue]) => {
            const summary = normalizeChatSummaryValue(summaryValue, { chatId });
            if (!summary.otherUserId) return result;
            const currentSummary = result[summary.otherUserId];
            if (!currentSummary || summary.lastMessageTime >= currentSummary.lastMessageTime) {
              result[summary.otherUserId] = summary;
            }
            return result;
          },
          {}
        );

        const buildLastMessageMeta = (otherUserId) => {
          const summary = summaryByOtherUserId[String(otherUserId || "").trim()] || null;
          const resolvedChatKey = String(
            summary?.chatId || sortedChatId(adminUserId, otherUserId)
          ).trim();
          return {
            chatKey: resolvedChatKey,
            lastMsgTime: getConversationSortTime(summary?.lastMessageTime),
            lastMsgText: String(summary?.lastMessageText || "").trim(),
            unread: Math.max(0, Number(summary?.unreadCount || 0) || 0),
          };
        };

        const hydrateChatPreviewMeta = async (records) =>
          mapInBatches(records, 24, async (record) => ({
            ...record,
            ...buildLastMessageMeta(record.userId),
          }));

        // TeacherDirectory
        const teacherDirectoryRecords = Object.entries(teachersRes || {})
          .map(([teacherId, teacherNode]) => {
            const userId = String(teacherNode?.userId || "").trim();
            if (!userId) return null;
            const name = pickFirstNonEmpty(teacherNode?.name, teacherId, "Teacher");
            return {
              id: teacherId,
              teacherId,
              userId,
              type: "teacher",
              name,
              profileImage: resolveAvatarSrc(teacherNode?.profileImage),
              lastSeen: null,
              isActive: teacherNode?.isActive !== false,
            };
          })
          .filter(Boolean)
          .filter((record) => record.isActive);

        const teacherFallbackRecords = Object.entries(teachersRaw || {})
          .map(([teacherId, teacherNode]) => {
            const userId = String(teacherNode?.userId || "").trim();
            if (!userId) return null;
            const userNode = usersById[userId] || {};
            const name = pickFirstNonEmpty(
              userNode?.name,
              userNode?.username,
              teacherNode?.name,
              teacherId,
              "Teacher"
            );
            return {
              id: teacherId,
              teacherId,
              userId,
              type: "teacher",
              name,
              profileImage: resolveAvatarSrc(userNode?.profileImage || teacherNode?.profileImage),
              lastSeen: null,
              isActive: teacherNode?.status !== "inactive" && userNode?.isActive !== false,
            };
          })
          .filter(Boolean)
          .filter((record) => record.isActive);

        const teacherRecords = teacherDirectoryRecords.length
          ? teacherDirectoryRecords
          : teacherFallbackRecords;
        const mappedTeachers = (await hydrateChatPreviewMeta(teacherRecords)).sort(
          sortContactsBySummary
        );

        // StudentDirectory
        const studentDirectoryRecords = Object.entries(studentsRes || {})
          .map(([studentId, studentNode]) => {
            const userId = String(studentNode?.userId || "").trim();
            if (!userId) return null;
            const name = pickFirstNonEmpty(studentNode?.name, studentId, "Student");
            return {
              id: studentId,
              studentId,
              userId,
              type: "student",
              name,
              grade: String(studentNode?.grade || "").trim(),
              section: String(studentNode?.section || "").trim().toUpperCase(),
              profileImage: resolveAvatarSrc(studentNode?.profileImage),
              lastSeen: null,
              isActive: studentNode?.isActive !== false,
            };
          })
          .filter(Boolean)
          .filter((record) => record.isActive);

        const studentFallbackRecords = Object.entries(studentsRaw || {})
          .map(([studentId, studentNode]) => {
            const userId = String(
              studentNode?.userId || studentNode?.use || studentNode?.user || ""
            ).trim();
            if (!userId) return null;
            const userNode = usersById[userId] || {};
            const basicInfo = studentNode?.basicStudentInformation || {};
            const name = pickFirstNonEmpty(
              userNode?.name,
              userNode?.username,
              studentNode?.name,
              studentNode?.studentName,
              basicInfo?.name,
              studentId,
              "Student"
            );
            return {
              id: studentId,
              studentId,
              userId,
              type: "student",
              name,
              grade: String(studentNode?.grade || basicInfo?.grade || "").trim(),
              section: String(studentNode?.section || basicInfo?.section || "").trim().toUpperCase(),
              profileImage: resolveAvatarSrc(
                userNode?.profileImage || studentNode?.profileImage || basicInfo?.studentPhoto
              ),
              lastSeen: null,
              isActive: studentNode?.isActive !== false && userNode?.isActive !== false,
            };
          })
          .filter(Boolean)
          .filter((record) => record.isActive);

        const studentRecords = studentDirectoryRecords.length
          ? studentDirectoryRecords
          : studentFallbackRecords;
        const mappedStudents = (await hydrateChatPreviewMeta(studentRecords)).sort(
          sortContactsBySummary
        );

        // ParentDirectory
        const parentDirectoryRecords = Object.entries(parentsRes || {})
          .map(([parentId, parentNode]) => {
            const userId = String(parentNode?.userId || "").trim();
            if (!userId) return null;
            const name = pickFirstNonEmpty(parentNode?.name, parentId, "Parent");
            return {
              id: parentId,
              parentId,
              userId,
              type: "parent",
              name,
              profileImage: resolveAvatarSrc(parentNode?.profileImage),
              lastSeen: null,
              isActive: parentNode?.isActive !== false,
            };
          })
          .filter(Boolean)
          .filter((record) => record.isActive);

        const parentFallbackRecords = Object.entries(parentsRaw || {})
          .map(([parentId, parentNode]) => {
            const userId = String(parentNode?.userId || "").trim();
            if (!userId) return null;
            const userNode = usersById[userId] || {};
            const name = pickFirstNonEmpty(
              userNode?.name,
              userNode?.username,
              parentNode?.name,
              parentId,
              "Parent"
            );
            return {
              id: parentId,
              parentId,
              userId,
              type: "parent",
              name,
              profileImage: resolveAvatarSrc(userNode?.profileImage || parentNode?.profileImage),
              lastSeen: null,
              isActive: parentNode?.isActive !== false && userNode?.isActive !== false,
            };
          })
          .filter(Boolean)
          .filter((record) => record.isActive);

        const parentRecords = parentDirectoryRecords.length
          ? parentDirectoryRecords
          : parentFallbackRecords;
        const mappedParents = (await hydrateChatPreviewMeta(parentRecords)).sort(
          sortContactsBySummary
        );

        // Management (HR + Finance + Registerers)
        const mapOfficeRecords = (source, officeRole) =>
          Object.entries(source || {})
            .map(([roleNodeId, roleNode]) => {
              const userId = String(roleNode?.userId || "").trim();
              if (!userId) return null;
              const name = pickFirstNonEmpty(roleNode?.name, roleNodeId, officeRoleLabel(officeRole));
              return {
                id: roleNodeId,
                roleNodeId,
                userId,
                type: "management",
                officeRole,
                name,
                profileImage: resolveAvatarSrc(roleNode?.profileImage),
                lastSeen: null,
                isActive: isActiveRecord(roleNode),
              };
            })
            .filter(Boolean)
            .filter((record) => record.isActive);

        const managementRecords = [
          ...mapOfficeRecords(hrRes, "hr"),
          ...mapOfficeRecords(financeRes, "finance"),
          ...mapOfficeRecords(registerersRes, "registerer"),
        ];

        const mappedManagements = (await hydrateChatPreviewMeta(managementRecords)).sort(
          sortContactsBySummary
        );

        setTeachers(mappedTeachers);
        setStudents(mappedStudents);
        setParents(mappedParents);
        setManagements(mappedManagements);
        setUnreadCounts(
          [...mappedTeachers, ...mappedStudents, ...mappedParents, ...mappedManagements].reduce(
            (acc, item) => {
              acc[item.userId] = Number(item.unread || 0);
              return acc;
            },
            {}
          )
        );
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoadingContacts(false);
      }
    };

    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUserId, schoolScopeCode]);

  // ---------------- SUMMARY LISTENER ----------------
  useEffect(() => {
    if (!adminUserId) return undefined;

    const summaryRef = ref(db, scopedPath(buildOwnerChatSummariesPath(adminUserId)));
    const unsubscribe = onValue(summaryRef, (snapshot) => {
      const ownerSummaries = snapshot.val() || {};
      const summaryByOtherUserId = Object.entries(
        ownerSummaries && typeof ownerSummaries === "object" ? ownerSummaries : {}
      ).reduce((result, [chatId, summaryValue]) => {
        const summary = normalizeChatSummaryValue(summaryValue, { chatId });
        if (!summary.otherUserId) return result;
        const currentSummary = result[summary.otherUserId];
        if (!currentSummary || summary.lastMessageTime >= currentSummary.lastMessageTime) {
          result[summary.otherUserId] = summary;
        }
        return result;
      }, {});

      const nextUnreadCounts = {};
      const mergeSummary = (record) => {
        const summary = summaryByOtherUserId[String(record?.userId || "").trim()] || null;
        const unreadCount = Math.max(0, Number(summary?.unreadCount || 0) || 0);
        nextUnreadCounts[String(record?.userId || "").trim()] = unreadCount;

        if (!summary) return { ...record, unread: unreadCount };

        return {
          ...record,
          chatKey: String(summary.chatId || record?.chatKey || "").trim(),
          lastMsgTime: getConversationSortTime(summary.lastMessageTime),
          lastMsgText: String(summary.lastMessageText || "").trim(),
          unread: unreadCount,
        };
      };

      setTeachers((previousTeachers) => previousTeachers.map(mergeSummary).sort(sortContactsBySummary));
      setStudents((previousStudents) => previousStudents.map(mergeSummary).sort(sortContactsBySummary));
      setParents((previousParents) => previousParents.map(mergeSummary).sort(sortContactsBySummary));
      setManagements((previousManagements) =>
        previousManagements.map(mergeSummary).sort(sortContactsBySummary)
      );
      setUnreadCounts(nextUnreadCounts);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUserId, schoolNodePrefix]);

  return {
    teachers,
    setTeachers,
    students,
    setStudents,
    parents,
    setParents,
    managements,
    setManagements,
    unreadCounts,
    setUnreadCounts,
    loadingContacts,
  };
}
