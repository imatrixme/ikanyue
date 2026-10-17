## ADDED Requirements

### Requirement: Publish-only visual scheduling
The visual scheduler SHALL create lessons only by publishing them with a class and teacher; if publication fails, the lesson created for that attempt SHALL be cancelled and the operator told which dates were published.

#### Scenario: Publication rejected
- **WHEN** the second of four weekly lessons fails to publish
- **THEN** its draft is cancelled, the first lesson remains published and the message names the published date and the failure

### Requirement: Collision-free lesson codes
Scheduler lesson codes SHALL be unique across teachers and across cancelled lessons at the same time.

#### Scenario: Two teachers at the same time
- **WHEN** two teachers are scheduled for 10:00 on the same day
- **THEN** both lessons are created

### Requirement: Occupancy-aware selection
Drag and click selection SHALL never include an occupied slot and SHALL end when the pointer is released anywhere.

#### Scenario: Drag across an existing lesson
- **WHEN** an operator drags from a free slot across an occupied slot
- **THEN** the selection stops before the occupied slot

### Requirement: Server-owned lesson defaults
The API SHALL default a new lesson's rule snapshots, roster version and version when the client omits them.

#### Scenario: Minimal lesson create
- **WHEN** a lesson is created without rule snapshots
- **THEN** the stored lesson has version-1 snapshots
