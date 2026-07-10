## ADDED Requirements

### Requirement: Physical Reward Catalog
The system SHALL provide a lightweight catalog of physical rewards with point prices.

#### Scenario: Admin creates reward item
- **WHEN** an authenticated lite admin creates a reward with name, point price, and active status
- **THEN** the system stores the reward item for mini program display

#### Scenario: Invalid reward price is rejected
- **WHEN** an admin creates or updates a reward with a non-positive point price
- **THEN** the system rejects the request

#### Scenario: Admin uploads reward image
- **WHEN** an authenticated lite admin uploads a supported image within the configured size limit for an existing reward
- **THEN** the backend stores the file in the reward's PocketBase file field and returns the reward with a preview URL

#### Scenario: Invalid reward image is rejected
- **WHEN** an admin uploads an empty file, a non-image MIME type, or an oversized image
- **THEN** the system rejects the upload without replacing the existing image

#### Scenario: Reward image reads bypass PocketBase in production
- **WHEN** a reward has a PocketBase-managed image file and `PUBLIC_ASSET_BASE_URL` is configured
- **THEN** admin and mini program reward responses expose the public object-storage URL using the PocketBase collection, record, and filename path

#### Scenario: Legacy image URL remains compatible
- **WHEN** a reward has no managed image file but has an existing absolute image URL
- **THEN** the system continues returning that URL

#### Scenario: Inactive reward is hidden from students
- **WHEN** a reward item is inactive
- **THEN** the mini program reward list does not include it in redeemable or locked rewards

### Requirement: Student Reward Availability
The mini program SHALL show students which physical rewards they can and cannot redeem with their current points.

#### Scenario: Reward list is split by affordability
- **WHEN** an authenticated student opens the rewards page
- **THEN** the system returns current points, active rewards whose point price is less than or equal to current points as redeemable items, and active rewards whose point price is greater than current points as locked items

#### Scenario: Student sees no admin-only fields
- **WHEN** the mini program displays reward availability
- **THEN** the response excludes admin-only operator fields and internal point event metadata

### Requirement: Offline Reward Deduction
The lite admin SHALL deduct points when a student takes a physical reward in person.

#### Scenario: Admin redeems item offline
- **WHEN** an authenticated lite admin selects a student and active reward item for offline redemption
- **THEN** the backend checks the student's balance, deducts exactly the reward's stored point price, creates a negative `point_events` record with the reward item, and returns the updated balance

#### Scenario: Insufficient points blocks redemption
- **WHEN** an admin attempts offline redemption for a reward whose point price is greater than the student's current balance
- **THEN** the system rejects the redemption without changing the balance

#### Scenario: Client cannot override reward price
- **WHEN** an offline redemption request includes a client-provided point amount
- **THEN** the backend ignores it and uses the active reward item's stored point price

#### Scenario: Inactive reward cannot be redeemed
- **WHEN** an admin attempts offline redemption for an inactive or missing reward
- **THEN** the system rejects the redemption without changing the balance
