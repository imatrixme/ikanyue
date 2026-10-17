## ADDED Requirements

### Requirement: Candidate-led website direction
The website implementation SHALL begin with at least four high-fidelity desktop/mobile design candidates generated from the shared Kanyue design language before production page coding begins.

#### Scenario: Website candidates are generated
- **WHEN** the design phase completes
- **THEN** each candidate presents the homepage, course discovery, activity content, and institutional credibility using the shared green system, music-ticket motifs, and age-inclusive music-education imagery

#### Scenario: A direction is selected
- **WHEN** candidates are reviewed
- **THEN** they are scored for brand fit, age inclusivity, content clarity, implementation realism, responsive adaptability, accessibility, and distinctiveness, and the selected direction is recorded before implementation

### Requirement: Independent official website project
The official website SHALL be implemented as an independent `ikanyue.website` Nuxt 4, Vue 3, TypeScript, and Tailwind 4 project with its own package metadata, lockfile, tests, build, and Git history.

#### Scenario: The website is developed locally
- **WHEN** dependencies are installed or the site is built
- **THEN** no root JavaScript package, lockfile, or workspace is created

#### Scenario: The website is registered in the parent repository
- **WHEN** a durable remote repository URL is available
- **THEN** the parent registers `ikanyue.website` as a submodule rather than committing a broken local-only Git URL

### Requirement: Complete institutional information architecture
The website SHALL provide Home, Courses, Faculty, Activities, Activity Detail, Student Stories, About, Contact, and Privacy routes with consistent global navigation and footer access.

#### Scenario: A prospective learner explores the site
- **WHEN** they navigate from the homepage
- **THEN** they can discover courses, understand teacher credibility, inspect current activities, read learner stories, and find contact information without encountering placeholder navigation

### Requirement: Age-inclusive music-education presentation
The website SHALL communicate a credible music institution for children, parents, and adult learners without a children-only game aesthetic or generic corporate styling.

#### Scenario: Homepage imagery and copy are rendered
- **WHEN** the first viewport and following content sections are viewed
- **THEN** real instruments, learning environments, or representative learners carry the subject while decorative ticket motifs remain secondary and text remains readable

### Requirement: Shared tokens with public-site adaptation
The website SHALL consume generated Kanyue tokens and implement its own public-site components for navigation, buttons, page headers, editorial sections, course cards, faculty profiles, activity tickets, media, forms, and async states.

#### Scenario: A shared brand token changes
- **WHEN** website token output is regenerated
- **THEN** public-site components update consistently without importing runtime code from the mini program or Admin

### Requirement: Responsive and accessible website
The website SHALL support 320px mobile through 1440px desktop viewports, semantic landmarks, keyboard navigation, visible focus, reduced-motion preference, sufficient contrast, and non-overlapping text and media.

#### Scenario: The homepage is viewed at target breakpoints
- **WHEN** visual checks run at 320px, 375px, 768px, 1280px, and 1440px
- **THEN** the primary subject remains visible, navigation remains usable, the next section is discoverable from the first viewport, and no horizontal overflow or incoherent overlap occurs

### Requirement: Public activity integration
The website SHALL render activity lists and details from the existing public activity contract when available, with explicit loading, empty, error, and unavailable-image states.

#### Scenario: Public activity data is available
- **WHEN** a visitor opens Activities or an Activity Detail route
- **THEN** the site renders server-delivered activity data with stable media geometry and canonical detail URLs

#### Scenario: The activity service is unavailable
- **WHEN** the public request fails or returns no records
- **THEN** the site renders a useful recoverable state without exposing operations endpoints or private data

### Requirement: Search and sharing readiness
The website SHALL provide canonical metadata, sitemap, robots directives, Open Graph data, and structured data appropriate to the organization, courses, and music events.

#### Scenario: A public route is rendered for indexing or sharing
- **WHEN** a crawler or link preview requests the route
- **THEN** it receives route-specific title, description, canonical URL, share image metadata, and applicable structured data without requiring client-only execution

### Requirement: Website quality gates
The website SHALL pass its unit, type, production build, browser E2E, accessibility, and responsive visual checks before release validation.

#### Scenario: The release candidate is evaluated
- **WHEN** local quality checks run
- **THEN** all required checks pass and Lighthouse performance, accessibility, best-practices, and SEO targets are each at least 90 on representative production pages

