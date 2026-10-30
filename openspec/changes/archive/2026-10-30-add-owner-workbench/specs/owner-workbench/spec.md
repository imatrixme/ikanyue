## ADDED Requirements

### Requirement: One Workbench Shaped by Permissions
The teacher side of the mini program SHALL have a single workbench and SHALL NOT have a separate owner role or an owner mode to switch into. Each management section SHALL show only when the signed-in teacher holds its permission: students and adding students for an administrator teacher, granting lessons for the finance capability, and undoing a confirmation for the settlement capability. Teaching sections SHALL show for the teacher capability.

#### Scenario: Solo studio owner
- **WHEN** an administrator teacher who also teaches opens the workbench
- **THEN** the same page shows their lessons waiting for confirmation, pending requests, students and granting lessons, with no role or mode switch

#### Scenario: Hired teacher
- **WHEN** a teacher with only the teacher capability opens the workbench
- **THEN** only the teaching sections show, and no students, granting or undo entries are offered

### Requirement: Owner Manages Students and Grants Lessons
An administrator teacher SHALL be able to add a student by name and cellphone, list and search students, and view a student's lesson ledger from the mini program. A teacher holding the finance capability SHALL be able to grant lessons to a student by choosing an existing package and price version, optionally recording the amount actually received; the grant SHALL be recorded as an offline order with both the list price and the received amount, and SHALL NOT involve online payment. A teacher without these permissions SHALL NOT be able to add students or grant lessons.

#### Scenario: Owner grants a discounted package
- **WHEN** the owner grants a 10-lesson package listed at 3000 and records 2700 received
- **THEN** the student receives 10 lessons, the order keeps 3000 as list price and 2700 as received, and the ledger shows the grant

#### Scenario: Hired teacher tries to grant lessons
- **WHEN** a teacher without the finance capability calls the grant endpoint
- **THEN** the request is refused with 403 and nothing is granted

#### Scenario: No package exists yet
- **WHEN** the owner opens granting and the studio has no sellable package
- **THEN** the page explains that packages are created in the web admin, without an error state

### Requirement: Management Permissions Are Checked Per Request
Management endpoints (students, ledger, granting, undoing a confirmation) SHALL re-read the teacher record on every request and SHALL refuse with 403 when the teacher is inactive or no longer holds the required permission, regardless of the permissions captured in the session.

#### Scenario: Permission removed during a session
- **WHEN** an administrator teacher loses administrator status while still signed in
- **THEN** their next request to add a student is refused with 403

### Requirement: Teachers Confirm Their Own Lessons
A teacher SHALL be able to confirm a started lesson they teach as taught in one action that records attendance (everyone present unless marked absent), completes the lesson and deducts lessons by attendance. A teacher holding the academic capability MAY confirm any lesson of the studio. Confirming SHALL NOT require the settlement capability, SHALL be audited with the acting teacher, and SHALL deduct lessons at most once.

#### Scenario: Confirm after class
- **WHEN** a teacher confirms their started lesson with one student marked absent
- **THEN** the present students are deducted by attendance, the absent student follows the absence rule, and the lesson leaves the waiting list

#### Scenario: Confirm before the lesson starts
- **WHEN** a teacher confirms a lesson that has not started
- **THEN** the request is refused with `LESSON_NOT_STARTED` and nothing changes

#### Scenario: Someone else's lesson
- **WHEN** a teacher without the academic capability confirms a lesson they do not teach
- **THEN** the request is refused and nothing changes

#### Scenario: Repeated confirmation
- **WHEN** the same confirmation is submitted twice
- **THEN** lessons are deducted once and the second submission returns the first result or `SESSION_ALREADY_SETTLED`

### Requirement: Owner Undoes a Confirmation
A teacher holding the settlement capability SHALL be able to undo a confirmed lesson with a required reason; the deducted lessons SHALL be restored and the lesson SHALL become confirmable again. Teachers without the settlement capability SHALL NOT undo confirmations.

#### Scenario: Wrong attendance corrected
- **WHEN** the owner undoes a confirmation with the reason "学员实际缺席"
- **THEN** the deducted lessons return to the student, the reason is audited, and the lesson can be confirmed again

### Requirement: Single Teacher Studio Defaults
When a studio has exactly one active teacher, the workbench SHALL NOT show teacher names, teacher filters or teacher pickers; they SHALL appear only once the studio has more than one active teacher. Workbench commands SHALL NOT ask for a teacher when the teacher follows from the lesson or the signed-in teacher.

#### Scenario: Solo studio
- **WHEN** the only teacher of a studio opens waiting lessons, students or a ledger
- **THEN** no teacher name, filter or picker is shown

#### Scenario: Second teacher joins
- **WHEN** a second active teacher is added to the studio
- **THEN** the owner sees which teacher teaches each waiting lesson and can filter by teacher
