## MODIFIED Requirements

### Requirement: Pet Motion
The system SHALL render visible, metadata-driven pet motion during normal use using normalized frame animation with expanded action loops, stable frame alignment, support for selected V5 source-rendered frame assets, and support for selected V6 pixel-3D generated frame assets.

#### Scenario: Idle pet is animated
- **WHEN** a healthy pet is displayed without user interaction
- **THEN** the pet visibly moves through a repeating idle animation with at least twelve aligned runtime frames rather than remaining as a static image

#### Scenario: V5 idle action can render at runtime
- **WHEN** a healthy `sprout` pet in the `baby` stage is displayed after V5 assets are built
- **THEN** the idle animation can render from the V5-generated runtime frames while preserving the same metadata-driven playback contract

#### Scenario: V6 pixel action can render at runtime
- **WHEN** a configured `sprout` pet action is displayed after V6 assets are built
- **THEN** the action can render from V6-generated pixel frames with pixelated image interpolation while preserving the same metadata-driven playback contract

#### Scenario: Feeding produces animation feedback
- **WHEN** the user feeds the current pet
- **THEN** the pet switches to a visible feeding reaction animation whose playback timing comes from action metadata before returning to its ongoing state

#### Scenario: Weak pet has distinct motion or state
- **WHEN** hunger or health falls below the configured weak threshold
- **THEN** the pet renders a visibly weaker aligned animation distinct from the healthy idle state

#### Scenario: Animation frames do not cause layout drift
- **WHEN** a pet animation advances through its runtime frames
- **THEN** frame playback preserves the stage layout and keeps the visible pet aligned to the configured canvas and anchor contract
