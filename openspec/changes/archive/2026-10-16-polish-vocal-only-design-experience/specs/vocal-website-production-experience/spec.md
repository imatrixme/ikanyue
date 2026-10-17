## ADDED Requirements

### Requirement: The public website is vocal-only
The website SHALL position Kanyue as a vocal education provider and SHALL NOT present piano, guitar, instrumental study, or generic instrument-school offerings in public copy, metadata, structured data, or tests. Supporting visuals MAY include piano, music stands, vocal scores, microphones, and choral materials only when the context clearly serves sight-singing, ear training, rehearsal, or vocal performance.

#### Scenario: Public route content audit
- **WHEN** production website source and generated output are searched for instrument-domain terms and obsolete asset names
- **THEN** no public-facing instrument course offering remains and any supporting teaching equipment is presented inside an unmistakably vocal context

#### Scenario: Live activity fallback is needed
- **WHEN** the public activity API is unavailable or empty
- **THEN** the website displays vocal workshops, showcases, and learning events that match the vocal-only positioning

### Requirement: Vocal education covers distinct life stages
The website SHALL describe vocal learning paths for early-childhood, school-age, teenage, adult, and mature learners, plus age-appropriate ensemble or stage practice.

#### Scenario: Visitor reviews course choices
- **WHEN** a visitor opens the home or courses page
- **THEN** they can distinguish the intended age, learning focus, format, and expected progression of each vocal pathway

#### Scenario: Visitor reads representative learning journeys
- **WHEN** a visitor opens the stories route
- **THEN** they see clearly labelled representative journeys rather than fabricated testimonials or identities

### Requirement: Website copy is production-ready and truthful
The website SHALL use complete public-facing copy and SHALL NOT expose preview disclaimers, fake success states, placeholder biographies, invented credentials, or unsupported contact promises.

#### Scenario: Visitor opens consultation page
- **WHEN** a visitor wants to contact Kanyue
- **THEN** the page provides a truthful WeChat search and copy workflow, consultation preparation guidance, and a clear process without pretending to submit data

#### Scenario: Visitor reads teaching-team content
- **WHEN** a visitor opens the faculty route
- **THEN** the page explains teaching roles, methods, and shared standards without presenting generated identities as real staff

### Requirement: Generated imagery follows one art direction
The website SHALL use a coherent generated editorial-photography set that represents multiple learner ages, focuses on human voice and learning interaction, uses supporting teaching equipment only where pedagogically relevant, and follows Kanyue color and composition tokens.

#### Scenario: Responsive image review
- **WHEN** the website is rendered at desktop and mobile widths
- **THEN** each primary image keeps its subject visible, has an appropriate crop and alt description, and does not conflict with overlaid copy

#### Scenario: Asset conformance audit
- **WHEN** committed public images are inspected
- **THEN** obsolete instrument assets are absent and every referenced vocal asset has valid dimensions and an optimized web format

### Requirement: Typography and composition remain token-driven
The website SHALL use generated Kanyue typography, spacing, radius, color, motion, and measure tokens for shared page and component styling.

#### Scenario: Source token scan
- **WHEN** website styles and components are scanned
- **THEN** no unapproved raw font, color, shadow, radius, or repeated spacing value bypasses the generated token contract

#### Scenario: Responsive hierarchy review
- **WHEN** public routes are rendered at desktop, tablet, and mobile widths
- **THEN** headings, body copy, metadata, controls, and captions retain a consistent hierarchy without overflow, orphaned labels, or viewport-scaled font sizes

### Requirement: Public website quality gates remain green
The revised website SHALL pass lint, unit tests, production build, route-level Playwright checks, accessibility checks, and screenshot review.

#### Scenario: Production verification
- **WHEN** the website verification suite runs
- **THEN** every public route loads without console errors, serious accessibility violations, missing image assets, or broken internal navigation
