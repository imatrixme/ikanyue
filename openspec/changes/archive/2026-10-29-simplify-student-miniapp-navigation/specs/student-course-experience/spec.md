## REMOVED Requirements

### Requirement: Independent Course Tab
**Reason**: The tab bar is now 首页 / 约课 / 我的; the course overview is no longer a tab.
**Migration**: Replaced by "Course Overview Page", reached from "我的".

## ADDED Requirements

### Requirement: Course Overview Page
The mini program SHALL keep a dedicated course overview page reached from "我的", and SHALL NOT register it as a tab.

#### Scenario: Student opens the course overview
- **WHEN** an authenticated student opens "我的课程" from "我的"
- **THEN** the mini program shows the next lesson, enrolled courses, validity warnings, and recent lesson records
