## ADDED Requirements

### Requirement: Single cancellation preview
Students SHALL preview appointment cancellation fees and refunds only through `GET /v1/student/appointments/:appointmentId/cancellation-preview`; the commerce module SHALL NOT expose a second route for the same quote.

#### Scenario: Cash-paid appointment
- **WHEN** a student opens cancellation for an appointment paid with a cash-refundable package
- **THEN** the booking preview returns the refundable amount and fee, and no commerce-prefixed preview route exists
