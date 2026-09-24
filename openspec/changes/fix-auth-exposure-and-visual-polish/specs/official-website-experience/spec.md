## ADDED Requirements

### Requirement: Readable public catalog
The website SHALL render course detail pages at `/courses/:code`, SHALL show delivery modes, units and activation rules as Chinese labels, SHALL NOT show internal course or package codes, and SHALL format activity times in `Asia/Shanghai`.

#### Scenario: Visitor opens a course
- **WHEN** a visitor opens a course from the course index
- **THEN** the detail page renders with Chinese delivery labels and no internal code

#### Scenario: Server in another time zone
- **WHEN** the site is rendered on a host outside China
- **THEN** activity dates and times still show Beijing time

### Requirement: Chinese-first editorial layout
Headings SHALL be measured in `em` with balanced wrapping and no English eyebrows; mobile pages SHALL keep at least 16px side gutters; the home page SHALL show courses as a horizontal carousel on narrow screens.

#### Scenario: Narrow phone
- **WHEN** the home page is viewed at 390px
- **THEN** side gutters are at least 16px and course cards scroll horizontally instead of stacking

### Requirement: Honest imagery
Pages using generated or staged teaching photos SHALL state that images are illustrative, and hero crops SHALL keep faces in frame.

#### Scenario: Footer note
- **WHEN** any page is viewed
- **THEN** the footer states that images illustrate teaching scenes
