## ADDED Requirements

### Requirement: One title and one icon language
Miniapp pages SHALL rely on the native navigation title without repeating it in the page body, SHALL NOT show English eyebrows or decorative seals, and tab bar icons for every role SHALL use the same outline style and brand palette.

#### Scenario: Teacher tab bar
- **WHEN** a teacher opens the miniapp
- **THEN** the workbench and calendar tabs use outline icons matching the student tabs

#### Scenario: Course page
- **WHEN** a student opens 课程
- **THEN** the page starts with a one-line summary instead of a second title block

### Requirement: Consistent reward and purchase language
Reward states SHALL use 可领取 / 未解锁; course shop cards SHALL show refund rules behind a link and repeat them in the purchase confirmation.

#### Scenario: Buying a package
- **WHEN** a student taps 购买
- **THEN** the confirmation shows the amount and the refund rules before the order is created

### Requirement: Brand empty states
Empty and error states SHALL use brand object illustrations in the palette, not stock people illustrations; missing reward images SHALL fall back to the gift icon.

#### Scenario: No rewards unlocked
- **WHEN** a reward has no image
- **THEN** its thumbnail shows the gift icon instead of a single character
