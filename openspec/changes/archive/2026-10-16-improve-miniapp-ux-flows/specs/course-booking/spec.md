## ADDED Requirements

### Requirement: Lightweight withdrawal
A student SHALL withdraw a pending request through a confirmation dialog without typing a reason.

#### Scenario: Withdraw pending request
- **WHEN** a student taps "撤回申请" and confirms
- **THEN** the request is withdrawn without a reason and the detail page reloads

### Requirement: Explained disabled submit
Booking sheets that require a reason SHALL tell the user what is missing when the disabled submit button is tapped.

#### Scenario: Reason too short
- **WHEN** a user taps submit with fewer than 2 characters of reason
- **THEN** the miniapp shows "请填写至少 2 个字的原因"

### Requirement: Informed reschedule
The teacher reschedule sheet SHALL show the selected day's open availability windows for the appointment's course and the end time computed from the original duration.

#### Scenario: Choosing a new day
- **WHEN** a teacher picks a date in the reschedule sheet
- **THEN** the sheet lists that day's open windows for the course, or says there are none, and shows the new start and end times

### Requirement: Slot submit only with slots
The student slot page SHALL show the submit bar only when slots are listed.

#### Scenario: No slots
- **WHEN** the slot page is loading, failed or empty
- **THEN** no submit bar is shown

### Requirement: Clear credit cancellation
Credit-mode cancellation copy SHALL state that the reserved lesson returns to the course without a fee.

#### Scenario: Credit-mode cancel
- **WHEN** a student opens cancellation for a credit-mode appointment
- **THEN** the sheet says the reserved lesson returns to the course and no fee is charged

### Requirement: Unsaved availability guard
The teacher availability page SHALL warn before the page is left while weekly availability edits are unsaved.

#### Scenario: Leaving with edits
- **WHEN** a teacher edits weekly rules or switches mode and taps back without saving
- **THEN** the miniapp asks for confirmation before leaving

#### Scenario: After save
- **WHEN** the weekly rules are saved
- **THEN** leaving the page does not prompt

### Requirement: Consistent teacher naming
The teacher course tab SHALL use the title "工作台", matching its tab label. Upcoming-lesson links SHALL read "查看日历" for teachers and "全部日程" for students.

#### Scenario: Teacher opens course tab
- **WHEN** a teacher opens the second tab
- **THEN** the tab label and the navigation title both read "工作台"
