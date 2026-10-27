# home-page-image-navigation Specification

## Purpose
TBD - created by archiving change update-home-tabs-to-image-detail. Update Purpose after archive.
## Requirements
### Requirement: Home entry SHALL use home-oriented labels
The system SHALL present the first tab and its page title as “首页”, while preserving the existing `pages/activity/index` page route.

#### Scenario: User opens the first tab
- **WHEN** the user views the first tab entry in the mini program tab bar
- **THEN** the tab label is shown as “首页”

#### Scenario: User enters the page from the first tab
- **WHEN** the user opens `pages/activity/index`
- **THEN** the navigation bar title is shown as “首页”

### Requirement: Home page SHALL provide static image navigation entries
The system SHALL replace the existing “一周后” and “已结束” left-side groups with a “看乐教学” entry and a “关于看乐” entry, and SHALL treat them as navigation entries instead of activity filters.

#### Scenario: User views the left-side groups
- **WHEN** the home page renders the left-side group list
- **THEN** the original “一周后” entry is replaced by “看乐教学”
- **THEN** the original “已结束” entry is replaced by “关于看乐”

#### Scenario: User views tomorrow and the day after tomorrow
- **WHEN** the home page renders the entries for tomorrow and the day after tomorrow
- **THEN** both entries are labeled with their corresponding weekday names instead of “明天” and “后天”

#### Scenario: User taps the learn-what entry
- **WHEN** the user taps the “看乐教学” entry
- **THEN** the system navigates to the image detail page with the configured image URL `https://kyoss.abcmem.com/ikanyue-public/zai-kanyue-xue-shenme.JPG`
- **THEN** the current activity list content remains based on the previously selected date filter

#### Scenario: User taps the about entry
- **WHEN** the user taps the “关于看乐” entry
- **THEN** the system navigates to the image detail page with the configured image URL `https://kyoss.abcmem.com/ikanyue-public/guanyu-kanyue.JPG`
- **THEN** the current activity list content remains based on the previously selected date filter

### Requirement: Image detail page SHALL render a requested remote image
The system SHALL provide a dedicated image detail page that accepts an encoded `imageUrl` parameter, decodes it, and displays the remote image content.

#### Scenario: User opens image detail with a valid image URL
- **WHEN** the image detail page is opened with a valid encoded `imageUrl` parameter
- **THEN** the page decodes the parameter and renders the corresponding remote image

#### Scenario: User opens image detail without an image URL
- **WHEN** the image detail page is opened without an `imageUrl` parameter
- **THEN** the system informs the user that the image does not exist
- **THEN** the page returns to the previous screen

