import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { schoolNodeBase } from "../../utils/schoolDbRouting";

const PAGE_SIZE = 50;

// ---------------- MODULE-SCOPE PURE HELPERS (lifted from Parents.jsx) ----------------
const normalizeText = (value) => String(value || "").trim();

const uniqueTextValues = (values = []) => {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).reduce((result, value) => {
    const text = normalizeText(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return result;
    seen.add(key);
    result.push(text);
    return result;
  }, []);
};

const normalizeParentDirectoryChild = (child = {}) => ({
  studentId: normalizeText(child?.studentId),
  userId: normalizeText(child?.userId),
  name: normalizeText(child?.name) || "N/A",
  email: normalizeText(child?.email) || "N/A",
  grade: normalizeText(child?.grade) || "N/A",
  section: normalizeText(child?.section) || "N/A",
  relationship: normalizeText(child?.relationship) || "N/A",
  profileImage: normalizeText(child?.profileImage) || "/default-profile.png",
});

const normalizeParentDirectoryEntry = (parentKey, parentValue = {}) => {
  const children = Array.isArray(parentValue?.children)
    ? parentValue.children.map((child) => normalizeParentDirectoryChild(child)).filter((child) => child.studentId)
    : Object.values(parentValue?.children || {})
        .map((child) => normalizeParentDirectoryChild(child))
        .filter((child) => child.studentId);
  const relationships = uniqueTextValues([
    ...(Array.isArray(parentValue?.relationships) ? parentValue.relationships : []),
    ...children.map((child) => child.relationship),
  ]);
  const firstChild = children[0] || {};
  const isActive = parentValue?.isActive !== false;

  return {
    directoryKey: normalizeText(parentKey),
    userId: normalizeText(parentValue?.userId) || normalizeText(parentKey),
    parentId: normalizeText(parentValue?.parentId) || "N/A",
    name: normalizeText(parentValue?.name) || normalizeText(parentValue?.username) || "No Name",
    username: normalizeText(parentValue?.username) || null,
    email: normalizeText(parentValue?.email) || "N/A",
    childName: normalizeText(parentValue?.childName) || firstChild.name || "N/A",
    childRelationship: normalizeText(parentValue?.childRelationship) || firstChild.relationship || "N/A",
    profileImage: normalizeText(parentValue?.profileImage) || "/default-profile.png",
    phone: normalizeText(parentValue?.phone) || "N/A",
    age: parentValue?.age ?? null,
    city: normalizeText(parentValue?.city) || (parentValue?.address && parentValue.address.city) || null,
    citizenship: normalizeText(parentValue?.citizenship) || null,
    job: normalizeText(parentValue?.job) || null,
    address: parentValue?.address || null,
    isActive,
    status: normalizeText(parentValue?.status) || (isActive ? "Active" : "Inactive"),
    additionalInfo: normalizeText(parentValue?.additionalInfo) || "N/A",
    createdAt: parentValue?.createdAt || parentValue?.updatedAt || null,
    relationships,
    children,
    detailsLoaded: true,
  };
};

const sortParentsByName = (items = []) =>
  [...items].sort((left, right) => String(left?.name || "").localeCompare(String(right?.name || "")));

/**
 * useParentsList
 *
 * Owns the Parents page's list data layer: React Query fetch (with
 * ParentDirectory → Users-fallback path), paginated load-more, and the
 * `filteredParents` derivation.
 *
 * The page passes in `loadParentDatasets` + a few resolvers because those
 * helpers share refs/closures with the Parents page's parent-detail effect
 * — keeping them at page scope avoids double-fetching.
 *
 * Latent-bug fix: original page referenced PARENT_DIRECTORY_URL without
 * declaring it, so `enabled: Boolean(undefined)` kept React Query disabled
 * and the list never loaded. The hook now derives the URL from schoolCode.
 */
export default function useParentsList({
  schoolCode,
  searchTerm,
  setSelectedParent,
  loadParentDatasets,
  getUserByKeyOrUserId,
  findStudentMatchById,
  getResolvedParentChildLinks,
}) {
  const DB_URL = schoolNodeBase(schoolCode);
  const PARENT_DIRECTORY_URL = `${DB_URL}/ParentDirectory.json`;

  const [parents, setParents] = useState([]);
  const [loadingParents, setLoadingParents] = useState(true);
  const [paginationCursor, setPaginationCursor] = useState(null);
  const [hasMoreParents, setHasMoreParents] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // ---------------- FETCH PARENTS ----------------
  const { data: reactQueryParents, isLoading: isParentsQueryLoading } = useQuery({
    queryKey: ["parents", PARENT_DIRECTORY_URL],
    queryFn: async () => {
      setLoadingParents(true);
      try {
        const paginatedUrl = `${PARENT_DIRECTORY_URL}?orderBy="$key"&limitToFirst=${PAGE_SIZE}`;
        const parentDirectoryResponse = await axios.get(paginatedUrl);
        const parentDirectoryData = parentDirectoryResponse.data || {};

        const parentKeys = Object.keys(parentDirectoryData);
        if (parentKeys.length > 0) {
          setPaginationCursor(parentKeys[parentKeys.length - 1]);
        }
        setHasMoreParents(parentKeys.length >= PAGE_SIZE);

        const directoryParentList = sortParentsByName(
          Object.entries(parentDirectoryData || {})
            .map(([parentKey, parentValue]) => normalizeParentDirectoryEntry(parentKey, parentValue))
            .filter((parentValue) => parentValue.userId)
        );

        if (directoryParentList.length > 0) {
          setSelectedParent((previousParent) => {
            if (!previousParent?.userId) return previousParent;
            return (
              directoryParentList.find((parentValue) => String(parentValue.userId) === String(previousParent.userId)) ||
              previousParent
            );
          });
          return directoryParentList;
        }

        // Fallback: ParentDirectory empty → derive from Users + Parents + Students
        const { usersData: users, parentsData, studentsData } = await loadParentDatasets();

        const findParentRecordByUserId = (canonicalUserId) => {
          if (!canonicalUserId) return null;
          return (
            parentsData?.[canonicalUserId] ||
            Object.entries(parentsData || {}).find(
              ([parentKey, p]) =>
                String(parentKey) === String(canonicalUserId) ||
                String(p?.userId) === String(canonicalUserId)
            )?.[1] ||
            null
          );
        };

        const resolveFirstChildPreview = (canonicalUserId) => {
          const parentRecord = findParentRecordByUserId(canonicalUserId);
          const parentRecordEntry = Object.entries(parentsData || {}).find(
            ([parentKey, parentValue]) =>
              String(parentKey) === String(canonicalUserId) ||
              String(parentValue?.userId) === String(canonicalUserId)
          );
          const childLinks = getResolvedParentChildLinks({
            parentRecord,
            parentRecordKey: parentRecordEntry?.[0] || parentRecord?.parentId || canonicalUserId,
            parentUserId: canonicalUserId,
            studentsData,
          });
          if (!childLinks.length) return null;

          const firstLink = childLinks[0] || {};
          const studentMatch = findStudentMatchById(studentsData, firstLink.studentId);
          const studentRecord = studentMatch?.record;
          if (!studentRecord) return null;
          const studentUserId = studentRecord.use || studentRecord.userId || studentRecord.user || null;
          const studentUser = getUserByKeyOrUserId(users, studentUserId);
          const name =
            studentUser?.name ||
            studentUser?.username ||
            studentRecord?.name ||
            studentRecord?.username ||
            null;
          const relationship = firstLink.relationship || null;
          return { name, relationship };
        };

        const parentList = Object.keys(users)
          .filter((uid) => users[uid].role === "parent")
          .map((uid) => {
            const u = users[uid] || {};
            const canonicalUserId = u.userId || uid;
            const parentRecord = findParentRecordByUserId(canonicalUserId);
            const firstChild = resolveFirstChildPreview(canonicalUserId);
            return {
              directoryKey: canonicalUserId,
              userId: canonicalUserId,
              parentId: parentRecord?.parentId || "N/A",
              name: u.name || u.username || "No Name",
              username: u.username || null,
              email: u.email || "N/A",
              childName: firstChild?.name || "N/A",
              childRelationship: firstChild?.relationship || "N/A",
              profileImage: u.profileImage || "/default-profile.png",
              phone: u.phone || u.phoneNumber || "N/A",
              age: u.age || null,
              city: u.city || (u.address && u.address.city) || null,
              citizenship: u.citizenship || null,
              job: u.job || null,
              address: u.address || null,
              isActive: u.isActive ?? parentRecord?.isActive ?? true,
              status: parentRecord?.status || (u.isActive === false ? "Inactive" : "Active"),
              createdAt: parentRecord?.createdAt || u.createdAt || null,
              detailsLoaded: false,
            };
          });

        setHasMoreParents(false); // Fallback path loads all
        return sortParentsByName(parentList);
      } catch (err) {
        console.error("Error fetching parents:", err);
        return [];
      } finally {
        setLoadingParents(false);
      }
    },
    enabled: Boolean(schoolCode),
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (reactQueryParents && Array.isArray(reactQueryParents)) {
      setParents(reactQueryParents);
    }
  }, [reactQueryParents]);

  useEffect(() => {
    setLoadingParents(isParentsQueryLoading);
  }, [isParentsQueryLoading]);

  // ---------------- LOAD MORE ----------------
  const loadMoreParents = async () => {
    if (!hasMoreParents || loadingMore || !paginationCursor) return;

    setLoadingMore(true);
    try {
      const paginatedUrl = `${PARENT_DIRECTORY_URL}?orderBy="$key"&startAfter="${paginationCursor}"&limitToFirst=${PAGE_SIZE}`;
      const response = await axios.get(paginatedUrl);
      const newParentsData = response.data || {};

      if (Object.keys(newParentsData).length === 0) {
        setHasMoreParents(false);
        setLoadingMore(false);
        return;
      }

      const newParentList = Object.entries(newParentsData)
        .map(([parentKey, parentValue]) => normalizeParentDirectoryEntry(parentKey, parentValue))
        .filter((parentValue) => parentValue.userId);

      const parentKeys = Object.keys(newParentsData);
      if (parentKeys.length > 0) {
        setPaginationCursor(parentKeys[parentKeys.length - 1]);
      }
      setHasMoreParents(parentKeys.length >= PAGE_SIZE);

      const updatedParentList = sortParentsByName([...parents, ...newParentList]);
      setParents(updatedParentList);
    } catch (err) {
      console.error("Error loading more parents:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // ---------------- FILTERED PARENTS ----------------
  const filteredParents = useMemo(() => {
    const normalizedSearch = (searchTerm || "").trim().toLowerCase();
    if (!normalizedSearch) return parents;
    return (parents || []).filter((p) => {
      const hay = [p?.name, p?.email, p?.phone, p?.city, p?.job, p?.citizenship]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(normalizedSearch);
    });
  }, [parents, searchTerm]);

  return {
    parents,
    setParents,
    loadingParents,
    paginationCursor,
    hasMoreParents,
    loadingMore,
    loadMoreParents,
    filteredParents,
  };
}
