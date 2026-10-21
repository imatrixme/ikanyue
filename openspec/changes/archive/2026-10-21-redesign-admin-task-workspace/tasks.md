## 1. Navigation and shell
- [x] 1.1 Replace `navigationGroups`/`viewEyebrows` with `navigationSections` (six sections, ordered tabs, lucide icons) and new `viewPaths`; `viewFromPath` resolves new and legacy paths
- [x] 1.2 Sidebar renders sections; Shell renders the section label in the top bar and section tabs above the page
- [x] 1.3 Routes use new paths, add `/students/:studentId`, and redirect every legacy path preserving `search`
- [x] 1.4 Replace hard-coded in-app links (`/lessons?sessionId=`, `/enrollments?new=1…`, dashboard queue links) with `viewPaths`

## 2. Today
- [x] 2.1 Rewrite the dashboard as a task list grouped by today's lessons, pending bookings, settlement, renewal, roster sync, exceptions and teacher workload, each row opening the exact record
- [x] 2.2 Use the local date for "today" on Today and the lessons page

## 3. Students
- [x] 3.1 Add the administrator student detail page (balance, upcoming lessons, enrollments, classes, points, recent operations, 报课/续课 and 积分 actions)
- [x] 3.2 Student list opens the detail page for administrators; teachers keep the assigned-relations drawer

## 4. Schedule and billing
- [x] 4.1 Lessons page opens the lesson from `?sessionId=` and clears it on close
- [x] 4.2 Lessons page scope filter: upcoming (default) / todo / all
- [x] 4.3 Enrollment dialog auto-selects the price when the package has exactly one active price

## 5. Visual cleanup
- [x] 5.1 `PageHeader` renders title + actions only; remove icon/eyebrow/description/badge from every caller
- [x] 5.2 Remove PNG business icons and `BusinessIcon`; monochrome lucide navigation icons
- [x] 5.3 Empty states without template copy or coloured icon tile
- [x] 5.4 Tooltip only on hover or `:focus-visible`; `IconButton` drops `title`

## 6. Verification
- [x] 6.1 Update unit tests and e2e flows for the new navigation and pages
- [x] 6.2 `npm run lint`, `TZ=Asia/Shanghai npm test`, `npm run build`, `npm run test:e2e`
- [x] 6.3 `openspec validate redesign-admin-task-workspace --strict`
