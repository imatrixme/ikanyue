## ADDED Requirements

### Requirement: Owner Substitutes a Lesson's Teacher
An administrator teacher SHALL be able to replace the lead teacher of an unsettled, non-cancelled lesson with another active teacher, before or after the lesson starts. The replaced teacher's row SHALL be kept as cancelled and the new teacher SHALL be added as a planned substitute, so the original assignment stays on record. Students, attendance and reserved lessons SHALL NOT change. The new teacher SHALL be refused when they already teach another lesson that overlaps in time. Substitution SHALL be audited with both teachers and the optional reason, and SHALL be idempotent. A settled lesson SHALL NOT be substituted directly; it must be undone first.

#### Scenario: Teacher on leave
- **WHEN** the owner substitutes tomorrow's lesson of teacher A with teacher B
- **THEN** the lesson leaves A's calendar and waiting list, appears in B's, and the student's reserved lesson is unchanged

#### Scenario: Substitute confirms and is paid
- **WHEN** teacher B confirms the substituted lesson after it starts
- **THEN** the lesson is settled with B as the confirmed lead teacher and the teaching earning goes to B, not A

#### Scenario: Substitute is busy
- **WHEN** the owner picks a teacher who already has an overlapping lesson
- **THEN** the request is refused with `SUBSTITUTE_TEACHER_BUSY` and nothing changes

#### Scenario: Lesson already confirmed
- **WHEN** the owner substitutes a settled lesson
- **THEN** the request is refused with `SESSION_ALREADY_SETTLED`, and undoing the confirmation, substituting and confirming again settles it under the new teacher

#### Scenario: Switching back
- **WHEN** the owner substitutes a lesson back to the teacher who was replaced earlier
- **THEN** that teacher's existing row becomes the planned lead again without a duplicate row

#### Scenario: Lead was marked absent
- **WHEN** the owner substitutes a lesson whose lead teacher is already marked absent
- **THEN** the absent row stays as attendance history, the new teacher becomes the planned lead, and the lesson's calendar cells move to the new teacher

#### Scenario: Hired teacher tries to substitute
- **WHEN** a teacher without administrator status calls the substitute endpoint
- **THEN** the request is refused with 403 and nothing changes

### Requirement: Owner Hands Over a Leaving Teacher
An administrator teacher SHALL be able to preview and then perform a handover from a leaving teacher to a receiving teacher. The preview SHALL list the leaving teacher's unsettled lessons as lead, lessons that conflict with the receiving teacher, pending booking requests, booking offerings (marking courses the receiving teacher does not offer) and affected students. The handover SHALL, in one transaction: substitute every such lesson to the receiving teacher, cancel the leaving teacher's other session roles, decline their pending booking requests with a reason the student can read, deactivate their booking offerings and availability, and block their account. It SHALL be refused as a whole when any lesson conflicts with the receiving teacher, when the leaving teacher is an administrator or the actor, or without a reason. Students' lessons SHALL NOT be moved or changed by a handover.

#### Scenario: Teacher leaves the studio
- **WHEN** the owner hands teacher A over to teacher B with the reason "老师离职"
- **THEN** A's future and waiting lessons are taught by B, A's pending requests are declined, students can no longer book A, A cannot sign in, and every student keeps the same remaining lessons

#### Scenario: Conflicts block the handover
- **WHEN** one of A's lessons overlaps a lesson B already teaches
- **THEN** the handover is refused with `HANDOVER_CONFLICTS`, nothing changes, and the preview lists that lesson so it can be substituted to someone else first

#### Scenario: Receiving teacher has no booking for a course
- **WHEN** A offered a course for booking that B does not offer
- **THEN** the preview says students cannot book that course with B until B opens availability, and the handover still proceeds

#### Scenario: Administrator cannot be handed over
- **WHEN** the owner tries to hand over an administrator teacher or themselves
- **THEN** the request is refused and nothing changes

### Requirement: Views Follow the Teacher Who Actually Teaches
Once a lesson exists for an appointment, the student's and teacher's views of that lesson and appointment SHALL name the lesson's current lead teacher, and SHALL NOT show replaced teachers. The original appointment teacher SHALL be kept as history. A replaced teacher SHALL NOT cancel that appointment; administrators still can. A substituted appointment SHALL NOT be rescheduled by anyone until the lesson is switched back to the booked teacher, because its bookable slots belong to the booked teacher.

#### Scenario: Student sees the substitute
- **WHEN** a student opens a lesson whose teacher was substituted from A to B
- **THEN** the lesson and appointment show B as the teacher, and A is not listed

#### Scenario: Replaced teacher tries to cancel
- **WHEN** teacher A cancels the appointment of a lesson now taught by B
- **THEN** the request is refused with `APPOINTMENT_TEACHER_FORBIDDEN` and the lesson is unchanged

#### Scenario: Substituted lesson is rescheduled
- **WHEN** anyone reschedules an appointment whose lesson is now taught by a substitute
- **THEN** the request is refused with `APPOINTMENT_TEACHER_SUBSTITUTED`, and the owner can switch the lesson back or cancel it so the student books again

### Requirement: Teacher Management Only Appears With Several Teachers
The owner's workbench SHALL show a teachers section only to administrator teachers when the studio has more than one active teacher. From it the owner SHALL reach each teacher's unsettled lessons with a substitute action and, for non-administrator teachers other than themselves, the handover. Waiting lessons in the workbench SHALL offer the substitute action to the owner when there is more than one teacher. Hired teachers and one-teacher studios SHALL see no substitution entry.

#### Scenario: Solo studio
- **WHEN** the only teacher of a studio opens the workbench
- **THEN** no teachers section and no substitute action are shown

#### Scenario: Owner with two teachers
- **WHEN** the owner of a two-teacher studio substitutes a lesson
- **THEN** the other teacher is preselected, and a busy teacher shows "这位老师在这个时间已有课"
