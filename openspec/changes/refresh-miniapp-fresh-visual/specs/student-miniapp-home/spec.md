## MODIFIED Requirements

### Requirement: Simplified Student Navigation
The student mini program SHALL expose exactly three tabs, 首页、约课、我的, and SHALL keep secondary features reachable from "我的" instead of the tab bar, with one entry per destination.

#### Scenario: Student looks for secondary features
- **WHEN** a signed-in student opens "我的"
- **THEN** the 剩余课时、待上课 and 积分 numbers open my courses, my appointments and points, and the shortcuts open 选课订单 and 个人资料

#### Scenario: Shared activity link is opened
- **WHEN** a user opens a previously shared activity detail link
- **THEN** the activity detail still renders, and leaving it falls back to the home tab
