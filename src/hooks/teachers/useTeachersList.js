import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { schoolNodeBase } from "../../utils/schoolDbRouting";
import { readCachedJson, writeCachedJson } from "../../utils/rtdbCache";

const PAGE_SIZE = 50;

/**
 * useTeachersList
 *
 * Owns the Teachers page's "list" data layer: cache + bootstrap, React Query
 * fetch, paginated load-more, and the derived `filteredTeachers` view.
 *
 * The page still owns UI state (selectedGrade, searchTerm) so the hook can
 * stay decoupled from view concerns — they're passed in. `setSelectedGrade`
 * is also passed so the hook can reset stale grade selections when the
 * available grade options change.
 *
 * Returned setters (`setTeachers`, `setGradeOptions`, `setUsersByUserId`)
 * are exposed so the page's existing handlers (toggle-active, etc.) can
 * keep doing optimistic updates without moving into this hook.
 */
export default function useTeachersList({
  schoolCode,
  apiBase,
  selectedGrade,
  setSelectedGrade,
  searchTerm,
}) {
  const SCHOOL_DB_ROOT = schoolNodeBase(schoolCode);
  const TEACHER_DIRECTORY_URL = `${SCHOOL_DB_ROOT}/TeacherDirectory.json`;
  const TEACHERS_CACHE_KEY = `teachers_page_cache_v2_${schoolCode || "global"}`;

  const isValidGradeKey = (value) => {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 1 && numeric <= 12;
  };

  // ---------------- CACHE HELPERS ----------------
  const readTeachersCache = () => {
    try {
      const rawSession = sessionStorage.getItem(TEACHERS_CACHE_KEY);
      const rawLocal = localStorage.getItem(TEACHERS_CACHE_KEY);
      const parsed = JSON.parse(rawSession || rawLocal || "null");
      if (!parsed || typeof parsed !== "object") return null;
      if (!rawSession && rawLocal) {
        sessionStorage.setItem(TEACHERS_CACHE_KEY, rawLocal);
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const writeTeachersCache = (payload) => {
    try {
      const value = JSON.stringify({ ...payload, fetchedAt: Date.now() });
      sessionStorage.setItem(TEACHERS_CACHE_KEY, value);
      localStorage.setItem(TEACHERS_CACHE_KEY, value);
    } catch {
      // ignore cache write errors
    }
  };

  // ---------------- BOOTSTRAP (lazy init, runs once) ----------------
  const bootstrapCache = useMemo(() => readTeachersCache(), []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [teachers, setTeachers] = useState(
    Array.isArray(bootstrapCache?.teacherList) ? bootstrapCache.teacherList : []
  );
  const [gradeOptions, setGradeOptions] = useState(
    Array.isArray(bootstrapCache?.gradeOptions) ? bootstrapCache.gradeOptions : []
  );
  const [usersByUserId, setUsersByUserId] = useState(
    bootstrapCache?.usersMap && typeof bootstrapCache.usersMap === "object"
      ? bootstrapCache.usersMap
      : {}
  );
  const [loadingTeachers, setLoadingTeachers] = useState(!bootstrapCache);
  const [teachersInitialized, setTeachersInitialized] = useState(Boolean(bootstrapCache));
  const [paginationCursor, setPaginationCursor] = useState(null);
  const [hasMoreTeachers, setHasMoreTeachers] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [teachersRefreshNonce, setTeachersRefreshNonce] = useState(0);

  // persistTeachersCache uses current usersByUserId/gradeOptions by default
  // (matching the original page behavior).
  const persistTeachersCache = (
    teacherList,
    usersMapValue = usersByUserId,
    gradeOptionsValue = gradeOptions
  ) => {
    writeTeachersCache({
      teacherList,
      gradeOptions: Array.isArray(gradeOptionsValue) ? gradeOptionsValue : [],
      usersMap: usersMapValue && typeof usersMapValue === "object" ? usersMapValue : {},
    });
  };

  const writeTeacherDirectoryEntryToCache = (teacherId, updater) => {
    if (!teacherId) return;

    const currentDirectory = readCachedJson(TEACHER_DIRECTORY_URL, {
      ttlMs: 15 * 60 * 1000,
    });
    if (!currentDirectory || typeof currentDirectory !== "object") return;

    const previousEntry = currentDirectory[teacherId] || {};
    writeCachedJson(TEACHER_DIRECTORY_URL, {
      ...currentDirectory,
      [teacherId]:
        typeof updater === "function"
          ? updater(previousEntry)
          : { ...previousEntry, ...(updater || {}) },
    });
  };

  // ---------------- SCHOOL-NODE READER ----------------
  const readSchoolNode = async (nodeName) => {
    try {
      const response = await axios.get(`${apiBase}/school-node-read`, {
        params: { schoolCode, path: nodeName },
        timeout: 7000,
      });
      return response?.data?.data || {};
    } catch {
      return {};
    }
  };

  // ---------------- REFRESH ----------------
  const refreshTeachers = () => {
    try {
      sessionStorage.removeItem(TEACHERS_CACHE_KEY);
      localStorage.removeItem(TEACHERS_CACHE_KEY);
    } catch {
      // ignore
    }
    setLoadingTeachers(true);
    setTeachersRefreshNonce((prev) => prev + 1);
  };

  // ---------------- FETCH (React Query) ----------------
  const { data: reactQueryTeachers, isLoading: isTeachersQueryLoading } = useQuery({
    queryKey: ["teachers", schoolCode, teachersRefreshNonce],
    queryFn: async () => {
      const normalizeProfileImage = (value) => {
        const raw = String(value || "").trim();
        if (!raw) return "";
        if (/^(https?:\/\/|data:|blob:|\/)/i.test(raw)) return raw;
        return "";
      };

      const resolveProfileImage = (...candidates) => {
        for (const candidate of candidates) {
          const normalized = normalizeProfileImage(candidate);
          if (normalized) return normalized;
        }
        return "/default-profile.png";
      };

      const cached = readTeachersCache();
      if (cached) {
        const cachedUsersMap = cached.usersMap && typeof cached.usersMap === "object" ? cached.usersMap : {};
        const cachedTeacherList = (Array.isArray(cached.teacherList) ? cached.teacherList : [])
          .filter((teacherItem) => {
            const userId = String(teacherItem?.userId || "").trim();
            return !!cachedUsersMap[userId];
          })
          .map((teacherItem) => {
            const user = cachedUsersMap[String(teacherItem?.userId || "").trim()] || {};
            const currentName = String(teacherItem?.name || "").trim();
            const currentTeacherId = String(teacherItem?.teacherId || "").trim();
            const shouldReplaceWithUserName = !currentName || currentName === currentTeacherId;
            return {
              ...teacherItem,
              name: shouldReplaceWithUserName
                ? user.name || teacherItem.name || "Unknown Teacher"
                : teacherItem.name,
              profileImage: resolveProfileImage(teacherItem?.profileImage, user.profileImage),
            };
          });
        setTeachers(cachedTeacherList);
        setGradeOptions(Array.isArray(cached.gradeOptions) ? cached.gradeOptions : []);
        setUsersByUserId(cachedUsersMap);
        setSelectedGrade((prev) => {
          if (prev === "All") return prev;
          return (cached.gradeOptions || []).includes(String(prev)) ? prev : "All";
        });
        setLoadingTeachers(false);

        const cachedFetchedAt = Number(cached.fetchedAt || 0);
        if (cachedFetchedAt && Date.now() - cachedFetchedAt < 5 * 60 * 1000) {
          setTeachersInitialized(true);
          return;
        }
      }

      setLoadingTeachers(true);

      try {
        // PAGINATION: Fetch paginated TeacherDirectory
        const paginatedUrl = `${TEACHER_DIRECTORY_URL}?orderBy="$key"&limitToFirst=${PAGE_SIZE}`;
        const teacherDirectoryResponse = await axios.get(paginatedUrl);
        const teacherDirectoryData = teacherDirectoryResponse.data || {};

        const teacherKeys = Object.keys(teacherDirectoryData);
        if (teacherKeys.length > 0) {
          const lastKey = teacherKeys[teacherKeys.length - 1];
          setPaginationCursor(lastKey);
        }

        setHasMoreTeachers(teacherKeys.length >= PAGE_SIZE);

        const teacherSummaryList = Object.entries(teacherDirectoryData || {})
          .map(([teacherId, teacher]) => {
            const userId = String(teacher?.userId || "").trim();
            if (!userId) return null;

            const gradesSubjects = Array.isArray(teacher?.gradesSubjects)
              ? teacher.gradesSubjects
                  .map((entry) => ({
                    courseId: String(entry?.courseId || "").trim(),
                    grade: String(entry?.grade || "").trim(),
                    section: String(entry?.section || "").trim(),
                    subject: String(entry?.subject || "").trim(),
                  }))
                  .filter((entry) => entry.grade && entry.section && entry.subject)
              : [];

            const subjectsUnique = Array.isArray(teacher?.subjectsUnique)
              ? teacher.subjectsUnique.filter(Boolean).map((subject) => String(subject).trim()).filter(Boolean)
              : Array.from(
                  new Set(
                    gradesSubjects
                      .map((entry) => String(entry?.subject || "").trim())
                      .filter(Boolean)
                  )
                );

            return {
              teacherId: String(teacher?.teacherId || teacherId || "").trim(),
              userId,
              name: String(teacher?.name || "").trim() || "Unknown Teacher",
              profileImage: resolveProfileImage(teacher?.profileImage),
              gradesSubjects,
              subjectsUnique,
              email: teacher?.email || null,
              phone: teacher?.phone || null,
              gender: teacher?.gender || null,
              isActive: teacher?.isActive !== false,
            };
          })
          .filter(Boolean)
          .sort((left, right) => String(left?.name || "").localeCompare(String(right?.name || "")));

        if (teacherSummaryList.length > 0) {
          const summaryUsersMap = teacherSummaryList.reduce((accumulator, teacher) => {
            accumulator[teacher.userId] = {
              userId: teacher.userId,
              teacherId: teacher.teacherId,
              role: "teacher",
              name: teacher.name,
              profileImage: teacher.profileImage,
              email: teacher.email,
              phone: teacher.phone,
              gender: teacher.gender,
              isActive: teacher.isActive,
            };
            return accumulator;
          }, {});

          const resolvedGrades = Array.from(
            new Set(
              teacherSummaryList
                .flatMap((teacher) => teacher?.gradesSubjects || [])
                .map((gradeSubjectItem) => String(gradeSubjectItem?.grade || "").trim())
                .filter((gradeValue) => isValidGradeKey(gradeValue))
            )
          ).sort((a, b) => Number(a) - Number(b));

          setTeachers(teacherSummaryList);
          setGradeOptions(resolvedGrades);
          setUsersByUserId(summaryUsersMap);
          setSelectedGrade((prev) => {
            if (prev === "All") return prev;
            return resolvedGrades.includes(String(prev)) ? prev : "All";
          });
          setLoadingTeachers(false);
          setTeachersInitialized(true);
          persistTeachersCache(teacherSummaryList, summaryUsersMap, resolvedGrades);
          return;
        }

        const [teachersData, assignmentsData, coursesData, gradesData, employeesData, usersData] =
          await Promise.all([
            readSchoolNode("Teachers"),
            readSchoolNode("TeacherAssignments"),
            readSchoolNode("Courses"),
            readSchoolNode("GradeManagement/grades"),
            readSchoolNode("Employees"),
            readSchoolNode("Users"),
          ]);

        const buildEmployeeDisplayName = (employee) => {
          const personal = employee?.personal || {};
          const candidates = [
            employee?.name,
            employee?.fullName,
            personal?.fullName,
            [personal?.firstName, personal?.middleName, personal?.lastName].filter(Boolean).join(" "),
            personal?.firstName,
          ];
          return candidates
            .map((value) => String(value || "").trim())
            .find((value) => Boolean(value)) || "";
        };

        const buildEmployeeProfileImage = (employee) => {
          const profileData = employee?.profileData || {};
          return resolveProfileImage(
            employee?.profileImage,
            profileData?.profileImage,
            profileData?.photoUrl,
            profileData?.avatar,
            employee?.photoUrl,
            employee?.avatar
          );
        };

        const normalizeId = (id) => String(id || "").replace(/^[-]+/, "").trim();
        const usersMap = Object.entries(usersData || {}).reduce((acc, [userKey, userRecord]) => {
          const userId = normalizeId(userRecord?.userId || userKey);
          if (!userId) return acc;
          if (String(userRecord?.role || "").toLowerCase() !== "teacher") return acc;
          acc[userId] = { ...(userRecord || {}), userId };
          return acc;
        }, {});

        const teacherSeedMap = { ...(teachersData || {}) };
        const employeeNameByTeacherId = {};
        const employeeProfileImageByTeacherId = {};
        Object.entries(employeesData || {}).forEach(([employeeId, employee]) => {
          const teacherId = String(employee?.teacherId || "").trim();
          if (!teacherId) return;
          const existing = teacherSeedMap[teacherId] || {};
          const employeeUserId = String(employee?.userId || "").trim();
          const employeeDisplayName = buildEmployeeDisplayName(employee);
          if (employeeDisplayName) {
            employeeNameByTeacherId[teacherId] = employeeDisplayName;
          }
          const employeeProfileImage = buildEmployeeProfileImage(employee);
          if (employeeProfileImage && employeeProfileImage !== "/default-profile.png") {
            employeeProfileImageByTeacherId[teacherId] = employeeProfileImage;
          }

          teacherSeedMap[teacherId] = {
            ...existing,
            teacherId,
            employeeId: existing.employeeId || employeeId,
            userId: String(existing.userId || "").trim() || employeeUserId || null,
            status: existing.status || employee?.status || "active",
          };
        });

        const toSubjectKey = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
        const toSectionKey = (value) => String(value || "").trim().toUpperCase();
        const toGradeKey = (value) => String(value || "").trim();

        const courseLookupByTuple = {};
        Object.entries(coursesData || {}).forEach(([courseId, course]) => {
          const grade = toGradeKey(course?.grade);
          const section = toSectionKey(course?.section);
          const subject = toSubjectKey(course?.subject || course?.name);
          if (!grade || !section || !subject) return;
          const tupleKey = `${grade}__${section}__${subject}`;
          if (!courseLookupByTuple[tupleKey]) {
            courseLookupByTuple[tupleKey] = courseId;
          }
        });

        const assignmentsByTeacher = {};
        const pushTeacherAssignment = (teacherIdValue, assignmentValue) => {
          const teacherId = String(teacherIdValue || "").trim();
          if (!teacherId) return;
          if (!assignmentsByTeacher[teacherId]) assignmentsByTeacher[teacherId] = [];
          assignmentsByTeacher[teacherId].push(assignmentValue);
        };

        Object.values(assignmentsData || {}).forEach((assignment) => {
          const teacherId = String(assignment?.teacherId || "").trim();
          const courseId = String(assignment?.courseId || "").trim();
          if (!teacherId || !courseId) return;
          const course = coursesData?.[courseId] || {};
          pushTeacherAssignment(teacherId, {
            courseId,
            grade: course?.grade,
            section: course?.section,
            subject: course?.subject || course?.name,
          });
        });

        Object.entries(gradesData || {}).forEach(([gradeKey, gradeNode]) => {
          const sectionSubjectTeachers = gradeNode?.sectionSubjectTeachers;
          if (!sectionSubjectTeachers || typeof sectionSubjectTeachers !== "object") return;

          Object.entries(sectionSubjectTeachers).forEach(([sectionKey, subjectsNode]) => {
            if (!subjectsNode || typeof subjectsNode !== "object") return;

            Object.entries(subjectsNode).forEach(([subjectKey, assignment]) => {
              if (!assignment || typeof assignment !== "object") return;

              const teacherId = String(
                assignment?.teacherId || assignment?.teacherRecordKey || ""
              ).trim();
              if (!teacherId) return;

              const subjectName = String(assignment?.subject || subjectKey || "").trim();
              const grade = toGradeKey(assignment?.grade || gradeKey);
              const section = toSectionKey(assignment?.section || sectionKey);
              const tupleKey = `${grade}__${section}__${toSubjectKey(subjectName)}`;
              const resolvedCourseId = courseLookupByTuple[tupleKey] || "";

              pushTeacherAssignment(teacherId, {
                courseId: resolvedCourseId,
                grade,
                section,
                subject: subjectName,
              });
            });
          });
        });

        const teacherListRaw = Object.keys(teacherSeedMap)
          .map((teacherId) => {
            const teacher = teacherSeedMap[teacherId] || {};
            const normalizedUserId = normalizeId(teacher?.userId);
            const user = usersMap[normalizedUserId] || {};
            if (!user.userId) return null;
            const teacherDisplayName =
              String(user?.name || "").trim() ||
              String(teacher?.name || "").trim() ||
              String(employeeNameByTeacherId[teacherId] || "").trim() ||
              "Unknown Teacher";
            const teacherProfileImage = resolveProfileImage(
              teacher?.profileImage,
              employeeProfileImageByTeacherId[teacherId],
              user?.profileImage
            );

            const gradesSubjectsRaw = (assignmentsByTeacher[teacherId] || [])
              .map((entry) => {
                const courseId = String(entry?.courseId || "").trim();
                const course = courseId ? coursesData?.[courseId] : null;
                return {
                  courseId,
                  grade: entry?.grade ?? course?.grade,
                  subject: entry?.subject ?? course?.subject ?? course?.name,
                  section: entry?.section ?? course?.section,
                };
              })
              .filter((entry) =>
                Boolean(
                  String(entry?.grade || "").trim() &&
                    String(entry?.section || "").trim() &&
                    String(entry?.subject || "").trim()
                )
              );

            // Deduplicate: show each course only once (prevents repeated subjects)
            const seenCourseKeys = new Set();
            const gradesSubjects = [];
            gradesSubjectsRaw.forEach((gs) => {
              const key = gs.courseId || `${gs.grade}-${gs.section}-${gs.subject}`;
              if (seenCourseKeys.has(key)) return;
              seenCourseKeys.add(key);
              gradesSubjects.push(gs);
            });

            // Deduplicate subjects for display
            const seenSubjects = new Set();
            const subjectsUnique = [];
            gradesSubjects.forEach((gs) => {
              const rawSubject = (gs?.subject ?? "").toString().trim();
              if (!rawSubject) return;
              const normalized = rawSubject.toLowerCase().replace(/\s+/g, " ");
              if (seenSubjects.has(normalized)) return;
              seenSubjects.add(normalized);
              subjectsUnique.push(rawSubject);
            });

            return {
              teacherId,
              name: teacherDisplayName,
              profileImage: teacherProfileImage,
              gradesSubjects,
              subjectsUnique,
              email: user.email || null,
              userId: normalizedUserId,
            };
          })
          .filter(Boolean);

        // Deduplicate by userId: only one entry per userId
        const seenUserIds = new Set();
        const teacherList = teacherListRaw.filter((teacher) => {
          const userId = String(teacher.userId || "").trim();
          if (seenUserIds.has(userId)) return false;
          seenUserIds.add(userId);
          return true;
        });

        setTeachers(teacherList);

        const managedGrades = Object.keys(gradesData || {})
          .filter((gradeKey) => isValidGradeKey(gradeKey))
          .sort((a, b) => Number(a) - Number(b));

        const fallbackFromAssignments = Array.from(
          new Set(
            teacherList
              .flatMap((teacherItem) => teacherItem?.gradesSubjects || [])
              .map((gradeSubjectItem) => String(gradeSubjectItem?.grade || "").trim())
              .filter((gradeValue) => isValidGradeKey(gradeValue))
          )
        ).sort((a, b) => Number(a) - Number(b));

        const resolvedGrades = managedGrades.length ? managedGrades : fallbackFromAssignments;
        setGradeOptions(resolvedGrades);
        setSelectedGrade((prev) => {
          if (prev === "All") return prev;
          return resolvedGrades.includes(String(prev)) ? prev : "All";
        });

        setLoadingTeachers(false);

        setUsersByUserId(usersMap);

        const hydratedTeachers = teacherList.map((teacherItem) => {
          const user = usersMap[String(teacherItem?.userId || "").trim()] || {};
          return {
            ...teacherItem,
            name: user.name || teacherItem.name,
            profileImage: resolveProfileImage(teacherItem?.profileImage, user.profileImage),
            email: user.email || teacherItem.email || null,
          };
        });

        // Fallback: no Teachers node records → use Users entries
        let finalTeachers = hydratedTeachers;
        if ((!Array.isArray(finalTeachers) || finalTeachers.length === 0) && Object.keys(usersMap || {}).length > 0) {
          const fromUsers = Object.values(usersMap).map((u) => ({
            teacherId: u.username || u.teacherId || u.userId || null,
            name: u.name || u.username || u.userId || "Unknown Teacher",
            profileImage: resolveProfileImage(u.profileImage),
            gradesSubjects: [],
            subjectsUnique: [],
            email: u.email || null,
            userId: u.userId,
            _fromUsersFallback: true,
          }));
          finalTeachers = fromUsers;
        }

        setTeachersInitialized(true);
        persistTeachersCache(finalTeachers, usersMap, resolvedGrades);
        return finalTeachers;
      } catch (err) {
        console.error("Error fetching teachers:", err);
        return [];
      } finally {
        setLoadingTeachers(false);
      }
    },
    enabled: Boolean(schoolCode),
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
  });

  // Sync React Query data with local state
  useEffect(() => {
    if (reactQueryTeachers && Array.isArray(reactQueryTeachers)) {
      setTeachers(reactQueryTeachers);
    }
  }, [reactQueryTeachers]);

  useEffect(() => {
    setLoadingTeachers(isTeachersQueryLoading);
  }, [isTeachersQueryLoading]);

  // ---------------- LOAD MORE TEACHERS ----------------
  const loadMoreTeachers = async () => {
    if (!hasMoreTeachers || loadingMore || !paginationCursor) return;

    setLoadingMore(true);
    try {
      const paginatedUrl = `${TEACHER_DIRECTORY_URL}?orderBy="$key"&startAfter="${paginationCursor}"&limitToFirst=${PAGE_SIZE}`;
      const response = await axios.get(paginatedUrl);
      const newTeachersData = response.data || {};

      if (Object.keys(newTeachersData).length === 0) {
        setHasMoreTeachers(false);
        setLoadingMore(false);
        return;
      }

      const resolveProfileImage = (...candidates) => {
        for (const candidate of candidates) {
          const normalized = String(candidate || "").trim();
          if (normalized && /^(https?:\/\/|data:|blob:|\/)/i.test(normalized)) {
            return normalized;
          }
        }
        return "/default-profile.png";
      };

      const newTeacherList = Object.entries(newTeachersData)
        .map(([teacherId, teacher]) => {
          const userId = String(teacher?.userId || "").trim();
          if (!userId) return null;

          const gradesSubjects = Array.isArray(teacher?.gradesSubjects)
            ? teacher.gradesSubjects
                .map((entry) => ({
                  courseId: String(entry?.courseId || "").trim(),
                  grade: String(entry?.grade || "").trim(),
                  section: String(entry?.section || "").trim(),
                  subject: String(entry?.subject || "").trim(),
                }))
                .filter((entry) => entry.grade && entry.section && entry.subject)
            : [];

          const subjectsUnique = Array.isArray(teacher?.subjectsUnique)
            ? teacher.subjectsUnique.filter(Boolean).map((subject) => String(subject).trim()).filter(Boolean)
            : Array.from(
                new Set(
                  gradesSubjects
                    .map((entry) => String(entry?.subject || "").trim())
                    .filter(Boolean)
                )
              );

          return {
            teacherId: String(teacher?.teacherId || teacherId || "").trim(),
            userId,
            name: String(teacher?.name || "").trim() || "Unknown Teacher",
            profileImage: resolveProfileImage(teacher?.profileImage),
            gradesSubjects,
            subjectsUnique,
            email: teacher?.email || null,
            phone: teacher?.phone || null,
            gender: teacher?.gender || null,
            isActive: teacher?.isActive !== false,
          };
        })
        .filter(Boolean);

      const teacherKeys = Object.keys(newTeachersData);
      if (teacherKeys.length > 0) {
        const lastKey = teacherKeys[teacherKeys.length - 1];
        setPaginationCursor(lastKey);
      }

      setHasMoreTeachers(teacherKeys.length >= PAGE_SIZE);

      const updatedTeacherList = [...teachers, ...newTeacherList];
      setTeachers(updatedTeacherList);

      const newGrades = Array.from(
        new Set([
          ...gradeOptions,
          ...newTeacherList
            .flatMap((teacher) => teacher?.gradesSubjects || [])
            .map((gs) => String(gs?.grade || "").trim())
            .filter((g) => /^[1-9]$|^1[0-2]$/.test(g)),
        ])
      ).sort((a, b) => Number(a) - Number(b));

      setGradeOptions(newGrades);

      const newUsersMap = newTeacherList.reduce((acc, teacher) => {
        acc[teacher.userId] = {
          userId: teacher.userId,
          teacherId: teacher.teacherId,
          role: "teacher",
          name: teacher.name,
          profileImage: teacher.profileImage,
          email: teacher.email,
          phone: teacher.phone,
          gender: teacher.gender,
          isActive: teacher.isActive,
        };
        return acc;
      }, {});

      const combinedUsersMap = { ...usersByUserId, ...newUsersMap };
      setUsersByUserId(combinedUsersMap);
      persistTeachersCache(updatedTeacherList, combinedUsersMap, newGrades);
    } catch (err) {
      console.error("Error loading more teachers:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // ---------------- FILTERED TEACHERS ----------------
  const normalizedSearch = (searchTerm || "").trim().toLowerCase();

  const matchesSearch = (teacher) => {
    if (!normalizedSearch) return true;
    const name = (teacher?.name || "").toLowerCase();
    const subjects = (teacher?.subjectsUnique || []).join(" ").toLowerCase();
    const grades = (teacher?.gradesSubjects || [])
      .map((gs) => `${gs.grade ?? ""}${gs.section ?? ""} ${gs.subject ?? ""}`)
      .join(" ")
      .toLowerCase();
    return name.includes(normalizedSearch) || subjects.includes(normalizedSearch) || grades.includes(normalizedSearch);
  };

  const isTeacherInactive = (t) => {
    try {
      const u = (usersByUserId || {})[String(t?.userId || "")] || {};
      const userVal = u?.isActive;
      if (userVal !== undefined && userVal !== null) {
        if (typeof userVal === "string") return userVal === "false" || userVal === "0";
        return userVal === false || userVal === 0;
      }
      const tVal = t?.isActive;
      if (tVal !== undefined && tVal !== null) {
        if (typeof tVal === "string") return tVal === "false" || tVal === "0";
        return tVal === false || tVal === 0;
      }
      return false;
    } catch {
      return false;
    }
  };

  const filteredTeachers =
    selectedGrade === "All"
      ? teachers.filter(matchesSearch)
      : selectedGrade === "Deactive"
      ? teachers.filter((t) => isTeacherInactive(t)).filter(matchesSearch)
      : selectedGrade === "Unassigned"
      ? teachers
          .filter((t) => !(Array.isArray(t.gradesSubjects) && t.gradesSubjects.length))
          .filter(matchesSearch)
      : teachers
          .filter((t) => (t.gradesSubjects || []).some((gs) => String(gs.grade) === String(selectedGrade)))
          .filter(matchesSearch);

  return {
    // data
    teachers,
    setTeachers,
    gradeOptions,
    setGradeOptions,
    usersByUserId,
    setUsersByUserId,
    filteredTeachers,
    // status
    loadingTeachers,
    teachersInitialized,
    paginationCursor,
    hasMoreTeachers,
    loadingMore,
    // actions
    refreshTeachers,
    loadMoreTeachers,
    persistTeachersCache,
    writeTeacherDirectoryEntryToCache,
  };
}
