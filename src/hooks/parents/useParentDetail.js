import { useEffect, useState } from "react";
import axios from "axios";

/**
 * useParentDetail
 *
 * Owns the Parents page's per-parent detail layer:
 *   - parentInfo + children state (hydrated from selectedParent.detailsLoaded
 *     or fetched fresh from Users/Parents/Students nodes)
 *   - updateParentInState (in-place patch across parents list + selectedParent
 *     + parentInfo)
 *   - toggleParentActive (Users/Parents/ParentDirectory PATCH fan-out)
 *
 * Page concerns kept out: selectedParent, setSelectedParent, setParents,
 * dbUrl, and the 4 parent-data helpers are passed in. Those helpers share
 * refs with useParentsList (parent-detail effect can hit the same in-memory
 * cache instead of refetching).
 */
export default function useParentDetail({
  selectedParent,
  setSelectedParent,
  setParents,
  dbUrl,
  loadParentDatasets,
  getUserByKeyOrUserId,
  getResolvedParentChildLinks,
  findStudentMatchById,
}) {
  const [parentInfo, setParentInfo] = useState(null);
  const [children, setChildren] = useState([]);
  const [togglingParentActive, setTogglingParentActive] = useState(false);

  const selectedParentId = selectedParent?.userId || null;

  // ---------------- IN-PLACE PARENT STATE PATCH ----------------
  const updateParentInState = (parentUserId, updater) => {
    const apply = (prev) =>
      typeof updater === "function" ? updater(prev) : updater;

    setParents((previousParents) =>
      previousParents.map((parentItem) =>
        String(parentItem?.userId || "") === String(parentUserId || "")
          ? { ...parentItem, ...apply(parentItem) }
          : parentItem
      )
    );

    setSelectedParent((previousParent) => {
      if (!previousParent || String(previousParent.userId || "") !== String(parentUserId || "")) {
        return previousParent;
      }
      return { ...previousParent, ...apply(previousParent) };
    });

    setParentInfo((previousParentInfo) => {
      if (!previousParentInfo || String(previousParentInfo.userId || "") !== String(parentUserId || "")) {
        return previousParentInfo;
      }
      return { ...previousParentInfo, ...apply(previousParentInfo) };
    });
  };

  // ---------------- ACTIVATE / DEACTIVATE PARENT ----------------
  const toggleParentActive = async () => {
    if (!selectedParent?.userId || togglingParentActive) return;

    const nextIsActive = selectedParent.isActive === false;
    const payload = {
      isActive: nextIsActive,
      status: nextIsActive ? "Active" : "Inactive",
    };
    const parentUserId = selectedParent.userId;
    const parentId =
      selectedParent.parentId && selectedParent.parentId !== "N/A" ? selectedParent.parentId : "";
    const directoryKey = selectedParent.directoryKey || parentUserId;

    setTogglingParentActive(true);
    try {
      await Promise.all([
        axios.patch(`${dbUrl}/Users/${parentUserId}.json`, payload).catch(() => undefined),
        parentId ? axios.patch(`${dbUrl}/Parents/${parentId}.json`, payload).catch(() => undefined) : Promise.resolve(),
        axios.patch(`${dbUrl}/Parents/${parentUserId}.json`, payload).catch(() => undefined),
        axios.patch(`${dbUrl}/ParentDirectory/${directoryKey}.json`, payload).catch(() => undefined),
        directoryKey !== parentUserId
          ? axios.patch(`${dbUrl}/ParentDirectory/${parentUserId}.json`, payload).catch(() => undefined)
          : Promise.resolve(),
      ]);

      updateParentInState(parentUserId, payload);
    } catch (error) {
      console.error("Parent active toggle error:", error);
      alert(`Could not ${nextIsActive ? "activate" : "deactivate"} parent: ${error.message || error}`);
    } finally {
      setTogglingParentActive(false);
    }
  };

  // ---------------- FETCH PARENT INFO + CHILDREN ----------------
  useEffect(() => {
    if (!selectedParentId) {
      setParentInfo(null);
      setChildren([]);
      return undefined;
    }

    if (selectedParent?.detailsLoaded) {
      setParentInfo(selectedParent);
      setChildren(Array.isArray(selectedParent.children) ? selectedParent.children : []);
      return undefined;
    }

    let cancelled = false;

    const fetchParentInfoAndChildren = async () => {
      try {
        const { parentsData, usersData, studentsData } = await loadParentDatasets();
        const parentRecordEntry =
          Object.entries(parentsData).find(
            ([parentKey, p]) =>
              String(p?.userId) === String(selectedParentId) ||
              String(parentKey) === String(selectedParentId)
          ) || [];
        const parentRecordKey = parentRecordEntry[0] || null;
        const parentRecord = parentRecordEntry[1] || null;
        const userInfo = getUserByKeyOrUserId(usersData, selectedParentId) || {};
        const resolvedChildLinks = getResolvedParentChildLinks({
          parentRecord,
          parentRecordKey,
          parentUserId: selectedParentId,
          studentsData,
        });

        const dobRaw = userInfo?.dob || userInfo?.birthDate || parentRecord?.dob || parentRecord?.birthDate || null;
        const computeAge = (dob) => {
          if (!dob) return null;
          try {
            const d = typeof dob === "number" ? new Date(dob) : new Date(String(dob));
            const now = new Date();
            let age = now.getFullYear() - d.getFullYear();
            const m = now.getMonth() - d.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
            return age;
          } catch {
            return null;
          }
        };

        const age = parentRecord?.age || userInfo?.age || computeAge(dobRaw) || null;
        const rels = resolvedChildLinks.map((childLink) => childLink.relationship).filter(Boolean);

        const info = {
          userId: selectedParentId,
          parentId: parentRecord?.parentId || selectedParent?.parentId || "N/A",
          name: userInfo.name || userInfo.username || "No Name",
          username: userInfo.username || null,
          email: userInfo.email || "N/A",
          phone: userInfo.phone || parentRecord?.phone || "N/A",
          isActive: userInfo.isActive ?? parentRecord?.isActive ?? true,
          job: userInfo.job || parentRecord?.job || null,
          relationships: rels,
          age: age ?? "—",
          city: parentRecord?.city || (parentRecord?.address && parentRecord.address.city) || userInfo.city || "—",
          citizenship: parentRecord?.citizenship || userInfo.citizenship || "—",
          status: parentRecord?.status || (userInfo.isActive ? "Active" : "Inactive") || "N/A",
          address: parentRecord?.address || userInfo.address || null,
          additionalInfo: parentRecord?.additionalInfo || "N/A",
          createdAt: parentRecord?.createdAt || userInfo.createdAt || "N/A",
          profileImage: userInfo.profileImage || "/default-profile.png",
        };

        if (cancelled) return;

        const childrenList = resolvedChildLinks
          .map((childLink) => {
            const studentMatch = findStudentMatchById(studentsData, childLink.studentId);
            const studentRecord = studentMatch?.record;
            if (!studentRecord) return null;
            const studentUserId = studentRecord.use || studentRecord.userId || studentRecord.user || null;
            const studentUser = getUserByKeyOrUserId(usersData, studentUserId) || {};
            return {
              studentId: studentRecord.studentId || studentMatch?.key || childLink.studentId,
              name:
                studentUser.name ||
                studentUser.username ||
                studentRecord.name ||
                studentRecord.username ||
                "N/A",
              email: studentUser.email || "N/A",
              grade: studentRecord.grade || "N/A",
              section: studentRecord.section || "N/A",
              parentPhone: parentRecord.phone || "N/A",
              relationship: childLink.relationship || "N/A",
              profileImage: studentUser.profileImage || studentRecord.profileImage || "/default-profile.png",
            };
          })
          .filter(Boolean);

        const hydratedParent = {
          ...info,
          children: childrenList,
          detailsLoaded: true,
        };

        setParentInfo(hydratedParent);
        setSelectedParent((prev) => {
          if (!prev || String(prev.userId) !== String(selectedParentId)) return prev;
          return { ...prev, ...hydratedParent };
        });

        if (cancelled) return;
        setChildren(childrenList);
      } catch (err) {
        console.error("Error fetching parent info and children:", err);
        if (cancelled) return;
        setParentInfo(null);
        setChildren([]);
      }
    };

    fetchParentInfoAndChildren();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUrl, selectedParent, selectedParentId]);

  return {
    parentInfo,
    setParentInfo,
    children,
    setChildren,
    togglingParentActive,
    toggleParentActive,
    updateParentInState,
  };
}
