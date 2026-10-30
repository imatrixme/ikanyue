## MODIFIED Requirements

### Requirement: Booking-First Student Home
The mini program SHALL open on a student home in the 松果 layout: the studio card over the venue cover, four shortcuts (场馆信息, 课程课包, 去约课, 我的课时), then the lesson status and, for a signed-in user, 我的约课 (the latest bookings), stacked as sections rather than tabs. Booking SHALL stay the single primary action. A signed-out visitor SHALL see the same layout without any sign-in prompt; personal shortcuts SHALL ask for an account only when tapped, on the home itself.

#### Scenario: Signed-out visitor opens the home
- **WHEN** a signed-out user opens the first tab
- **THEN** the page shows the studio card, the four shortcuts and the "开始学习" card, and shows neither lesson balances, a 我的约课 section nor a sign-in prompt

#### Scenario: Visitor taps a personal shortcut
- **WHEN** a signed-out user taps 课程课包 or 我的课时
- **THEN** the login sheet opens on the home; after signing in as a student the home reloads with their lessons and the tapped page opens

#### Scenario: Signed-in student without courses
- **WHEN** a signed-in student has no course with lesson hours
- **THEN** the lesson section explains that booking opens after enrolling, offers calling the studio and browsing course packages, and does not offer booking

#### Scenario: Student with remaining lessons
- **WHEN** a signed-in student has courses
- **THEN** the 我的课时 section lists each course with remaining lessons and validity and shows one "去约课" action that opens the booking tab

#### Scenario: Recent bookings
- **WHEN** a signed-in student opens the home
- **THEN** 我的约课 lists their latest three bookings with a link to all bookings, or a quiet "还没有约课" line, and a failed load offers a retry instead of an empty list

#### Scenario: Lessons are running low
- **WHEN** a course has two or fewer remaining lessons or is marked as expiring soon
- **THEN** the course row shows a renewal hint linking to course packages, without showing prices or asking the student to negotiate
