## ADDED Requirements

### Requirement: Booking Page and Role Inventory
The change SHALL include every registered student and teacher booking page, role-aware TabBar path, shared appointment component, and matching Hono endpoint in the mini-program coverage inventory.

#### Scenario: Booking inventory is checked
- **WHEN** the mini-program coverage and compiled-output contracts run
- **THEN** they include appointment creation, appointment list, appointment detail, teacher availability, role switching, teacher schedule, and the shared course pages modified for booking

### Requirement: Booking Interaction Coverage
The change SHALL test role routing, slot selection, request submission, confirmation, withdrawal, cancellation, availability editing, pagination, refresh, and conflict recovery outside WeChat DevTools.

#### Scenario: Student booking flow is covered
- **WHEN** Taro unit tests run
- **THEN** they verify eligibility mapping, teacher and date selection, disabled slots, idempotent submission, pending state, withdrawal, cancellation cutoff, and safe error presentation

#### Scenario: Teacher booking flow is covered
- **WHEN** Taro unit tests run
- **THEN** they verify teacher workbench filtering, confirm and decline actions, concurrent slot conflict recovery, weekly availability validation, date overrides, and role-specific navigation

### Requirement: Booking API Route Coverage
Every Hono route used by student or teacher booking pages SHALL have success, validation, authorization, ownership, idempotency, and conflict tests without requiring production services.

#### Scenario: Mini-program booking API contract is covered
- **WHEN** Hono route tests run
- **THEN** student routes derive the student id from authentication, teacher routes enforce assigned teacher ownership, and neither response leaks internal ledger or claim fields
