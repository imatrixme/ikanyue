## ADDED Requirements

### Requirement: Student Overview In The Student List
The Admin student list SHALL show each visible student's available course hours and next lesson. The data SHALL come from a student overview read model that accepts 1 to 100 student ids per request and returns, for each one: the account quantities, the next upcoming non-cancelled lesson, and the latest renewal follow-up.

#### Scenario: Visible students show balance and next lesson
- **WHEN** an operator with the finance capability opens the student list
- **THEN** each row shows 剩余课时 and 下节课, and a student with no upcoming lesson shows "未约课"

#### Scenario: Balance sort applies within the loaded page
- **WHEN** the operator chooses "剩余课时最少"
- **THEN** the loaded rows are ordered by available hours ascending

#### Scenario: Overview rejects an invalid id list
- **WHEN** the overview endpoint receives no ids or more than 100 ids
- **THEN** it responds with `STUDENT_IDS_INVALID` and returns no data

### Requirement: Global Student Search
The Admin top bar SHALL offer a student search for operators who can access students. Pressing `/` outside a form field SHALL focus the search box. The search box SHALL show at most eight results, which can be chosen with the keyboard.

#### Scenario: Administrator opens a student from search
- **WHEN** an administrator types a name or phone number and chooses a result
- **THEN** the Admin opens that student's detail page

#### Scenario: No match is stated
- **WHEN** the search returns no student
- **THEN** the results show "没有找到“<keyword>”"

### Requirement: Shareable List Filters
The students and points lists SHALL keep their filters in the URL. When the URL carries no filter parameters, the filters saved in localStorage SHALL apply.

#### Scenario: Refresh keeps filters
- **WHEN** an operator filters the student list and reloads the page
- **THEN** the same filters are applied

### Requirement: Lesson-Day Step Flow
The lesson drawer SHALL show the steps 点名 → 结束课堂 → 核销 and mark the current step with `aria-current="step"`. The current step's action SHALL be the primary button. The current step SHALL be:
- 点名: while any roster entry is unmarked
- 结束课堂: once every roster entry is marked
- 核销: once the lesson is completed or awaiting correction

Today SHALL offer a "全部到课" action on each open lesson row for operators with the teacher capability.

#### Scenario: Step advances after attendance
- **WHEN** a teacher marks everyone present in an open lesson
- **THEN** the step bar moves from 点名 to 结束课堂

#### Scenario: Today marks a lesson present
- **WHEN** an operator presses "全部到课" on a Today lesson row
- **THEN** every roster entry is marked present, a toast confirms it, and the row action becomes the disabled "已全部到课"

### Requirement: Bounded Complete Lists
The Admin SHALL read lists page by page up to 2,000 rows instead of stopping at the first 100. When a list has more rows than it shows, the Admin SHALL say so with "仅显示前 N 条，共 M 条".

#### Scenario: Truncation is announced
- **WHEN** a list has more rows than the bound
- **THEN** the page shows the truncation notice above the list

#### Scenario: Today asks only for its rows
- **WHEN** Today loads
- **THEN** it requests:
  - today's lessons by Shanghai day range
  - unsettled lessons by status
  - renewal candidates by threshold
  - counts for pending workload and exceptions

### Requirement: Renewal Follow-Up
Operators with the finance capability SHALL be able to record a renewal follow-up for a student:
- status "已联系" or "暂不续"
- an optional note of up to 300 characters
- a future reminder date

Each follow-up SHALL be stored as an append-only audit entry. Today SHALL hide a renewal candidate until its latest reminder date.

#### Scenario: Follow-up hides the student from Today
- **WHEN** an operator records a follow-up with a reminder date next week
- **THEN** the student leaves the 需要续课 group and stays hidden after Today reloads

#### Scenario: Past reminder date is rejected
- **WHEN** the reminder date is not in the future
- **THEN** the server rejects the request with `FOLLOW_UP_SNOOZE_INVALID`, and the dialog stays open with the reason

#### Scenario: Student page lists follow-ups
- **WHEN** an administrator opens a student detail page
- **THEN** the 续课跟进 section lists the follow-ups, newest first, with status, note and reminder date

### Requirement: Today Visibility By Capability
Today SHALL show each task group only to operators holding the matching capability. Administrators SHALL see every group.

| Group | Capability |
|---|---|
| 今日课堂 | academic (all lessons) or teacher (assigned lessons) |
| 待确认预约 | academic |
| 待核销课堂 | settlement |
| 需要续课 | finance |
| 报课后待同步名单 | finance |
| 异常 | settlement or audit |
| 待确认工作量 | teacher |

#### Scenario: Teacher-only operator
- **WHEN** an operator with only the teacher capability opens Today
- **THEN** Today requests assigned lessons and teacher events, and never requests accounts

### Requirement: Careful Money Confirmation
Refunds and mock refunds SHALL be confirmed in an in-app dialog that states the amount and the effect. The browser `window.confirm` SHALL NOT be used.

#### Scenario: Refund states amount and effect
- **WHEN** a finance operator presses 确认退款
- **THEN** a dialog states the refund amount, that the remaining hours stop at once, and that the action cannot be undone
- **AND** the refund is sent only after the operator confirms

### Requirement: Shanghai Time In The Admin
The Admin SHALL show and submit `datetime-local` values as Asia/Shanghai wall time, and SHALL derive calendar dates from the Shanghai day, whatever the browser's time zone.

#### Scenario: Editing keeps the lesson time
- **WHEN** an operator opens a lesson that starts at 10:00 Shanghai time and saves it without changes
- **THEN** the lesson still starts at 10:00 Shanghai time

#### Scenario: Early-morning appointments group under their own day
- **WHEN** an appointment starts at 07:30 Shanghai time
- **THEN** the appointment calendar lists it under that Shanghai date

### Requirement: Success Feedback
After a successful command, the Admin SHALL confirm it with a short toast. Toasts SHALL be shown in a polite live region, at most three at a time, and SHALL dismiss automatically. Errors SHALL stay inline where the action happened.

#### Scenario: Booking decision confirmed
- **WHEN** an operator confirms a pending appointment
- **THEN** a toast "预约已确认" appears and the queue reloads
