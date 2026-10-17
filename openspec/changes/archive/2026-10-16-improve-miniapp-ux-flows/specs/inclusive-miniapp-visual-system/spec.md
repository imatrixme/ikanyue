## ADDED Requirements

### Requirement: Readable miniapp type scale
The miniapp type scale SHALL NOT go below 11px, and body text SHALL be at least 14px.

#### Scenario: Generated tokens
- **WHEN** design tokens are synced
- **THEN** `$ky-font-size-2xs` is at least 11px and `$ky-font-size-body` is at least 14px

### Requirement: Muted text contrast
`textMuted` SHALL reach at least 4.5:1 contrast on both `surface` and `canvas`.

#### Scenario: Muted caption on canvas
- **WHEN** muted text is drawn on the canvas color
- **THEN** its contrast ratio is at least 4.5:1

### Requirement: Accessible small controls
Icon-only and text-only controls SHALL have at least a 44px hit area and expose `aria-role="button"` with a label.

#### Scenario: Remove availability rule
- **WHEN** a screen reader focuses the "×" that removes a weekly rule
- **THEN** it is announced as the button "移除时段" and its hit area is at least 44px
