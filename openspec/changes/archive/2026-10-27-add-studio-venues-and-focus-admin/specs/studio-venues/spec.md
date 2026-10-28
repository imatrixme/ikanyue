## ADDED Requirements

### Requirement: Admin-Managed Venues

Operators SHALL manage venues in Admin with name, introduction, address, opening hours, contact phone, bookable flag, status and sort order. Venues SHALL be deactivated rather than deleted.

#### Scenario: Founder updates opening hours
- **WHEN** an operator edits a venue's opening hours and saves
- **THEN** the mini program shows the new hours on next load without a release

#### Scenario: Deactivate a venue
- **WHEN** an operator deactivates a venue
- **THEN** the public venue list no longer includes it and the venue can be reactivated later

### Requirement: Public Venue List

The API SHALL expose `GET /v1/public/venues` without authentication, returning only active venues ordered by sort order with display fields and the bookable flag only.

#### Scenario: Venue list unavailable
- **WHEN** the venue request fails
- **THEN** the mini program home hides the venue card and still shows lessons and booking entries

### Requirement: Mini Program Venue Switching

The mini program SHALL show the current venue on the home page and SHALL list all active venues on a separate venue page where the student switches the current venue. The choice SHALL be remembered on the device; when nothing is chosen, or the remembered venue is no longer active, the first venue by sort order SHALL be current.

#### Scenario: Single venue
- **WHEN** only one venue is active
- **THEN** the home page shows it as current and the venue page lists that one venue

#### Scenario: Switch venue
- **WHEN** a student picks another venue on the venue page
- **THEN** the student returns to the home page and it shows the picked venue's details

#### Scenario: Venue without online booking
- **WHEN** the current venue is not bookable
- **THEN** the home page and booking tab explain that this venue does not take online bookings yet and offer the venue's phone, instead of listing booking options
