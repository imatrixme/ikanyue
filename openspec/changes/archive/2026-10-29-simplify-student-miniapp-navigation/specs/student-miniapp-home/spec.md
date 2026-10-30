## ADDED Requirements

### Requirement: Booking-First Student Home
The mini program SHALL open on a student home that shows the studio, the student's lesson status and upcoming lessons, with booking as the single primary action.

#### Scenario: Signed-out visitor opens the home
- **WHEN** a signed-out user opens the first tab
- **THEN** the page shows the studio card and a sign-in action and does not show lesson balances

#### Scenario: Signed-in student without courses
- **WHEN** a signed-in student has no course with lesson hours
- **THEN** the status card explains that booking opens after enrolling, offers calling the studio and browsing course packages, and does not offer booking

#### Scenario: Student with remaining lessons
- **WHEN** a signed-in student has courses
- **THEN** the status card lists each course with remaining lessons and validity and shows one "去约课" action that opens the booking tab

#### Scenario: Lessons are running low
- **WHEN** a course has two or fewer remaining lessons or is marked as expiring soon
- **THEN** the course row shows a renewal hint linking to course packages, without showing prices or asking the student to negotiate

### Requirement: Simplified Student Navigation
The student mini program SHALL expose exactly three tabs, 首页、约课、我的, and SHALL keep secondary features reachable from "我的" instead of the tab bar.

#### Scenario: Student looks for secondary features
- **WHEN** a signed-in student opens "我的"
- **THEN** the page offers 我的预约、我的课程、选课与订单、积分与兑换 and account actions

#### Scenario: Shared activity link is opened
- **WHEN** a user opens a previously shared activity detail link
- **THEN** the activity detail still renders, and leaving it falls back to the home tab
