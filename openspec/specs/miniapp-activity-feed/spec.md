# miniapp-activity-feed Specification

## Purpose
TBD - created by archiving change improve-miniapp-ux-flows. Update Purpose after archive.
## Requirements
### Requirement: Date strip next to its list
The activity tab SHALL place the date strip directly above the activity list it filters, with upcoming lessons above both, and SHALL NOT show brand info links.

#### Scenario: Selecting a day
- **WHEN** the user taps a day in the strip
- **THEN** the list immediately below the strip shows that day's activities

### Requirement: Honest empty day
Days with activities SHALL carry a marker. An empty selected day SHALL say that the day has no activities and offer to jump to the next day in the strip that has one.

#### Scenario: Nothing today, something later
- **WHEN** today has no activity and a later day in the strip has one
- **THEN** the empty state reads "这天没有活动" and its action selects that later day

#### Scenario: Nothing this week
- **WHEN** no day in the strip has an activity
- **THEN** the empty state says there are no activities in the next 7 days and offers no jump

### Requirement: Bounded activity query
The activity tab SHALL request only activities that start between the start of today and the end of the last day in the strip, sorted by `startTime`.

#### Scenario: Many past activities
- **WHEN** more than 100 past activities exist
- **THEN** the activities in the strip are still returned

