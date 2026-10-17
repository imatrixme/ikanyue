## ADDED Requirements

### Requirement: Shipped mini-program visuals use semantic design tokens
The mini program SHALL use generated Kanyue tokens for product colors, typography, repeated spacing, radii, shadows, motion, and shared control geometry across every shipped page and shared component.

#### Scenario: Page and component source audit
- **WHEN** the design-system conformance check scans mini-program source files
- **THEN** it finds no unapproved raw visual values in semantic styling properties

#### Scenario: Legitimate local geometry remains expressible
- **WHEN** a page requires intrinsic geometry such as a circle, viewport height, aspect ratio, or content-specific media dimension
- **THEN** the implementation may keep that geometry local without creating a misleading semantic token

### Requirement: Activity rich text follows generated typography roles
Activity detail rich text SHALL derive heading, paragraph, list, image, and link inline styles from generated design-system values rather than raw values embedded in the sanitizer.

#### Scenario: Rich-text HTML is normalized
- **WHEN** activity HTML contains headings, paragraphs, lists, images, or links
- **THEN** the sanitized output uses the generated rich-text style contract for typography, spacing, and brand color

#### Scenario: Compiled mini-program retains the contract
- **WHEN** the WeChat production build is generated
- **THEN** the activity detail bundle contains the expected token-derived rich-text styles and no legacy raw style literals

### Requirement: Token conformance is regression guarded
The repository SHALL include automated checks for generated token freshness and for the mini-program visual bypass patterns fixed by this change.

#### Scenario: Token output drifts
- **WHEN** generated mini-program token files do not match the root token source
- **THEN** the design-system check fails with a non-zero exit status

#### Scenario: A raw rich-text or inline visual value returns
- **WHEN** a future change reintroduces a prohibited raw style in the audited paths
- **THEN** the mini-program build-facing test or parent design guard fails

### Requirement: User-facing pages are visually verified in WeChat DevTools
The activity, points, profile, user-info, history, catalog, and detail surfaces SHALL render with coherent color, typography, spacing, and shared states in the WeChat simulator.

#### Scenario: Core page visual review
- **WHEN** the production mini-program build is opened in WeChat DevTools
- **THEN** core pages show no title-bar mismatch, token-detached component, clipped text, incoherent overlap, or unstyled rich-text hierarchy

