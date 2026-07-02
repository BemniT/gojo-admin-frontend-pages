# Admin Web — Frontend Architecture

A field guide for anyone touching this codebase, especially backend developers wiring up the new PostgreSQL/WebSocket/Redis stack against it.

---

## The one rule

**Pages own composition. Hooks own data. Components own rendering.**

A page is layout + a few hook calls + a tree of components. If a page is reaching directly into Firebase, that logic belongs in a hook. If a hook is rendering JSX, that JSX belongs in a component.

This separation is what makes the backend swap survivable: when Firebase RTDB → PostgreSQL + WebSocket + Redis, **only the hook internals change**. Page composition and rendering stay frozen.

---

## Folder layout

```
src/
├── pages/                    Layout + composition only. No fetches.
├── hooks/                    Data layer, grouped by domain.
│   ├── auth/                  useAdminSession, useAuth
│   ├── chat/                  useChatContacts, useChatMessages, useChatPresence,
│   │                          useConversations, useTeacherChat, useStudentChat, useParentChat
│   ├── students/              useStudentsList, useStudentPerformance
│   ├── teachers/              useTeachersList, useTeacherSchedule, useTeacherLessonPlans
│   ├── parents/               useParentsList, useParentDetail
│   ├── posts/                 usePosts
│   ├── calendar/              useCalendar
│   ├── academic/              useAcademicYears, useYearHistoryStudents
│   ├── dashboard/             useOverview
│   ├── notifications/         useTopbarNotifications
│   └── ui/                    useClickOutside, useDarkMode, useWindowSize
├── components/
│   ├── dashboard/            Page-section components, grouped by domain.
│   │   ├── chat/              ChatOverlays, TeacherChatPopup
│   │   ├── students/          StudentAttendanceTab, StudentPerformanceTab, StudentPaymentTab
│   │   ├── teachers/          TeacherDetailSidebar, TeacherDetailsTab,
│   │   │                      TeacherPlanTab, TeacherScheduleTab
│   │   ├── parents/           ParentDetailSections
│   │   ├── posts/             PostCard, PostsFeed, CreatePostModal
│   │   ├── calendar/          CalendarEventModal
│   │   ├── layout/            DashboardLayout, RightSidebar
│   │   └── modals/            AdminVerifyModal, ConfirmDialog
│   └── (root-level components are page-agnostic primitives:
│        ProfileAvatar, Toast, EditPostModal, Loader, etc.)
├── utils/                    Pure helpers (no React, no state).
│                              chatRtdb, lessonPlanHelpers, schoolDbRouting, etc.
├── services/                 API client wrappers.
├── context/                  React context providers.
├── routes/                   Route definitions.
├── styles/                   Global CSS.
├── App.jsx
├── main.jsx
└── ARCHITECTURE.md           ← you are here
```

---

## Where to look for what

| If you want to… | Look in |
|---|---|
| Change how the chat fetches messages | `hooks/chat/useChatMessages.js` |
| Change how students get listed/paginated | `hooks/students/useStudentsList.js` |
| Change a chat overlay UI (image preview, action menu) | `components/dashboard/chat/ChatOverlays.jsx` |
| Add a new tab to a teacher's detail panel | `components/dashboard/teachers/TeacherDetailSidebar.jsx` |
| See what RTDB paths are read/written | grep for `Chats/`, `Students/`, etc. across `hooks/` |
| See what API endpoints are called | grep for `API_BASE` across `hooks/` |
| Add a new page | `pages/` — but the page should call hooks + render components, not fetch directly |

---

## The hook contract (backend-swap target)

Each domain hook exposes a stable signature that the page consumes. When the backend swaps stacks, ONLY the hook internals change. Example:

### `useStudentsList`

```js
const {
  students, setStudents,
  filteredStudentsBase,
  currentYearStudents,
  lastYearStudents,
  loadingStudents,
  hasMoreStudents, loadingMore,
  loadMoreStudents,
  persistStudentList,
  writeStudentsCache,
  writeStudentDirectoryEntryToCache,
} = useStudentsList({
  schoolCode,
  apiBase,
  loadingFinance,
  selectedGrade, setSelectedGrade,
  selectedSection,
  searchTerm,
});
```

**Today it reads:** Firebase RTDB `StudentDirectory` → falls back to `Students` + `Users` hydration; localStorage cache; React Query.

**Tomorrow it can read:** `GET /api/students?school=X&limit=50&cursor=Y` → PostgreSQL → Redis cache. **Page code doesn't change.**

### `useChatMessages`

```js
const {
  messages, input, setInput,
  currentChatKey,
  sendMessage, sendImageMessage,
  handleEditMessage, handleDeleteMessage,
  imageSending,
} = useChatMessages({
  adminUserId, selectedChatUser, setSelectedChatUser,
  allowedUserIds, loadingContacts,
  schoolNodePrefix,
  onPresenceUpdate, onUnreadCleared,
});
```

**Today:** Firebase RTDB `onValue(Chats/{key}/messages)` listener + Storage for images.

**Tomorrow:** WebSocket `socket.on("chat:message", ...)` + Cloudflare R2 for images. **Same surface.**

### `useChatPresence`

```js
const { presence, setPresence } = useChatPresence({
  selectedTab, selectedChatUser,
  teachers, students, parents, managements,
  schoolScopeCode, apiBase,
});
```

**Today:** 2-minute REST polling against `Presence/{userId}` RTDB nodes, idle-aware.

**Tomorrow:** Redis-backed `GET /api/presence?ids=...` or WS room-membership event. **Same surface.**

---

## Domain map — pages ↔ hooks ↔ components

| Page | Hooks it composes | Components it renders |
|---|---|---|
| `Dashboard.jsx` | `useAdminSession`, `usePosts`, `useConversations`, `useCalendar` | `DashboardLayout`, `PostsFeed`, `RightSidebar`, `CreatePostModal`, `CalendarEventModal` |
| `MyPosts.jsx` | `useAdminSession`, `usePosts`, `useConversations`, `useCalendar` | (same as Dashboard, posts filtered to authored-by-admin) |
| `Teachers.jsx` | `useTeachersList`, `useTeacherSchedule`, `useTeacherChat`, `useTeacherLessonPlans` | `TeacherDetailSidebar` (composes `TeacherDetailsTab`, `TeacherScheduleTab`, `TeacherPlanTab`), `TeacherChatPopup`, `AdminVerifyModal` |
| `Students.jsx` | `useStudentsList`, `useStudentChat`, `useStudentPerformance` | `StudentAttendanceTab`, `StudentPerformanceTab`, `StudentPaymentTab` |
| `Parents.jsx` | `useParentsList`, `useParentChat`, `useParentDetail`, `useTopbarNotifications` | `ParentDetailSections` (3 named exports: Details/Children/Status) |
| `AllChat.jsx` | `useChatContacts`, `useChatMessages`, `useChatPresence` | `ChatOverlays` (3 named exports: ImagePreview/ImageActionMenu/TextActionMenu) |
| `Overview.jsx` | `useOverview`, `useCalendar` | (renders dashboard widgets) |
| `AcademicYearPage.jsx` | `useAcademicYears`, `useYearHistoryStudents` | (TBD) |

---

## Conventions

- **Imports are relative.** Use `../../` etc. — there's no path alias.
- **Hooks export default** (one hook per file). Older hooks may still use named exports — both work.
- **Components export default OR named** depending on whether the file has one or several. Multi-export files (like `ChatOverlays.jsx`, `ParentDetailSections.jsx`) use named exports.
- **No `prompt`/`alert`/`confirm`.** Use `ConfirmDialog` or a modal component instead.
- **No direct Firebase calls in pages.** All RTDB/Storage access lives in hooks or `utils/`.
- **Big caches live in `utils/rtdbCache.js`** (TTL-based localStorage cache).

---

## Adding a new feature — the dissection pattern

1. **Start with the page.** What's the user-facing flow?
2. **Identify the data layer.** What does it fetch / send / subscribe to? → That's a hook.
3. **Identify the rendered pieces.** Each visually-bounded chunk that takes props → a component.
4. **Wire:** page calls hook(s), passes hook output as props to component(s).
5. **Stop when** the page is mostly `<Component {...slice} />` calls.

If you find yourself writing a `useEffect` inside a page, you're probably about to violate the rule. Push it into a hook.

---

## Backend-swap checklist (when the new stack lands)

For each hook, swap the internal implementation:

- [ ] **Auth** — Firebase ID token verifier replaces localStorage admin trust.
- [ ] **`useStudentsList` / `useTeachersList` / `useParentsList`** — point at REST endpoints backed by PostgreSQL + Redis cache; keep return shape identical.
- [ ] **`useChatMessages` / `useTeacherChat` / `useStudentChat` / `useParentChat`** — replace `onValue` listeners with WebSocket events; replace Firebase Storage upload with Cloudflare R2.
- [ ] **`useChatPresence`** — swap REST polling for Redis presence query OR WS room-membership events.
- [ ] **`usePosts` / `useCalendar`** — REST endpoints.
- [ ] **`utils/rtdbCache.js`** — retire (Redis owns caching now) OR keep as a thin browser-side TTL cache for read-mostly endpoints.

Hook signatures stay the same. Page code stays the same. Components stay the same. **That's the payoff.**
