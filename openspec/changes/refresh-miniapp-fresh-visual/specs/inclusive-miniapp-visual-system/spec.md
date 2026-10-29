## MODIFIED Requirements

### Requirement: Compact age-neutral empty states
The mini program SHALL provide shared compact empty states for activity, network, points, rewards, image, and signed-out account contexts using one small line icon in a pale circle, without illustrations.

#### Scenario: Empty or error state is shown
- **WHEN** a supported page has no content, cannot load content, or requires login
- **THEN** it shows one small line icon from the shared icon set inside a pale circle, without illustrations, people, faces, text in the artwork, or animation

#### Scenario: Empty state includes recovery
- **WHEN** the user can resolve the empty or error state
- **THEN** the component presents one concise Chinese explanation and one unambiguous action without competing decoration

### Requirement: Coherent icon system
The mini program SHALL use one rounded line-icon set, kept as SVG sources and exported to PNG, for the tab bar and every functional icon.

#### Scenario: Tab bar is rendered
- **WHEN** the native tab bar displays the student or teacher destinations
- **THEN** all icons share the same 24-unit grid, rounded stroke, neutral default colour and brand-green selected colour, and every icon path is root-absolute so it resolves on any page

#### Scenario: Functional icon is rendered
- **WHEN** a shared action icon appears on a page
- **THEN** it follows the same line grammar in one brand colour with at most a pale fill, and uses a semantic colour only when the action or state requires it

### Requirement: Brand empty states
Empty and error states SHALL use line icons from the shared set, not illustrations or stock people artwork; missing reward images SHALL fall back to the gift icon.

#### Scenario: No rewards unlocked
- **WHEN** a reward has no image
- **THEN** its thumbnail shows the gift icon instead of a single character
