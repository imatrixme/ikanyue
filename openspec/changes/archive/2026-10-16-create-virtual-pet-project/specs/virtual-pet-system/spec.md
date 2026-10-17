## ADDED Requirements

### Requirement: Standalone Virtual Pet Project
The system SHALL provide the virtual pet experience as a new standalone browser subproject under `virtual-pet/` and SHALL keep its package metadata, dependencies, source files, assets, and verification scripts inside that directory.

#### Scenario: Project is isolated from existing Kanyue subprojects
- **WHEN** the virtual pet system is implemented
- **THEN** files under existing `ikanyue.*` projects remain unmodified unless a later change explicitly expands scope

#### Scenario: Parent repository remains dependency-neutral
- **WHEN** the virtual pet project adds JavaScript dependencies
- **THEN** dependency declarations and package-manager lockfiles exist inside `virtual-pet/` and no root `package.json`, root lockfile, or root JavaScript workspace is added

### Requirement: Pet Adoption And Species Variety
The system SHALL allow a user to adopt or select from multiple configured pet species, with each species providing distinct display identity, stage definitions, and animation assets.

#### Scenario: User selects an initial pet
- **WHEN** a user opens the app without an existing saved pet
- **THEN** the app presents at least three pet species choices and creates a pet state for the selected species

#### Scenario: Species data drives pet differences
- **WHEN** different species are rendered
- **THEN** their names, visual assets, and configured growth or food preferences come from species data rather than duplicated species-specific UI branches

### Requirement: Pet Motion
The system SHALL render visible pet motion during normal use, using repeated image frames, sprite frames, or an equivalent low-cost frame animation.

#### Scenario: Idle pet is animated
- **WHEN** a healthy pet is displayed without user interaction
- **THEN** the pet visibly moves through a repeating idle animation rather than remaining as a static image

#### Scenario: Feeding produces animation feedback
- **WHEN** the user feeds the current pet
- **THEN** the pet switches to a visible feeding reaction or animation before returning to its ongoing state

#### Scenario: Weak pet has distinct motion or state
- **WHEN** hunger or health falls below the configured weak threshold
- **THEN** the pet renders a visibly weaker state or animation distinct from the healthy idle state

### Requirement: Feeding And Growth Loop
The system SHALL let the user feed the current pet and SHALL use feeding to improve pet stats and advance growth progress toward later stages.

#### Scenario: Feeding improves pet state
- **WHEN** the user feeds a valid food to the current pet
- **THEN** hunger, mood, and growth progress update according to the configured food and species rules

#### Scenario: Pet grows into later stages
- **WHEN** feeding and elapsed care raise the pet's growth progress past a configured stage threshold
- **THEN** the pet advances to the next growth stage and renders the stage-appropriate identity and animation assets

#### Scenario: Mature pet remains playable
- **WHEN** the current pet reaches the final configured growth stage
- **THEN** feeding continues to affect hunger, health, mood, and animation feedback without requiring another growth stage

### Requirement: Time-Based Weakening
The system SHALL apply elapsed-time decay so pets gradually become hungry and weaker when not fed.

#### Scenario: Hunger decays after inactivity
- **WHEN** the app loads or ticks after time has elapsed since the last state update
- **THEN** the pet's hunger decreases according to deterministic decay rules

#### Scenario: Neglect affects health and mood
- **WHEN** hunger remains below the configured low threshold after elapsed-time decay
- **THEN** health and mood decrease enough for the UI to show the pet is weakening

#### Scenario: Weakening is recoverable
- **WHEN** a weakened pet is fed before reaching any terminal failure state
- **THEN** hunger and mood can recover through normal feeding actions

### Requirement: Local Persistence
The system SHALL persist adopted pet state locally so browser refreshes keep the current pet and its lifecycle progress.

#### Scenario: Saved pet restores on refresh
- **WHEN** a user refreshes the browser after adopting or feeding a pet
- **THEN** the app restores the saved species, stage, stats, growth progress, and last update timestamp

#### Scenario: Corrupt saved state fails safely
- **WHEN** saved pet data is missing required fields or has an unsupported schema version
- **THEN** the app falls back to a safe new-adoption state without crashing

### Requirement: Pet Status Interface
The system SHALL provide a usable browser interface for pet care, including pet display, core stats, feeding controls, and current lifecycle state.

#### Scenario: User can inspect pet state
- **WHEN** a pet is active
- **THEN** the UI displays the pet name or species, growth stage, hunger, health, mood, and growth progress

#### Scenario: User can feed from visible controls
- **WHEN** a pet is active
- **THEN** the UI provides visible food controls that trigger the feeding loop without requiring hidden keyboard commands

#### Scenario: Responsive layout remains usable
- **WHEN** the app is viewed on a desktop or mobile-sized browser viewport
- **THEN** the pet display, stats, and feeding controls remain readable and do not overlap

### Requirement: Project-Local Verification
The system SHALL include project-local verification for core pet engine behavior and app build health.

#### Scenario: Pet engine behavior is tested locally
- **WHEN** the virtual pet project test command is run from `virtual-pet/`
- **THEN** tests cover feeding updates, growth-stage transitions, elapsed-time weakening, weak-state derivation, and corrupt-state recovery

#### Scenario: App builds from the virtual pet project
- **WHEN** the virtual pet project build command is run from `virtual-pet/`
- **THEN** the production build completes without requiring commands from existing Kanyue subprojects

#### Scenario: Animation is verified in browser
- **WHEN** implementation verification is performed
- **THEN** the core browser smoke test confirms a pet renders, idle motion is visible, feeding changes visual state, and weak-state rendering can be reached through deterministic state setup
