## MODIFIED Requirements

### Requirement: Student Learning Projection Boundary
Student course pages SHALL consume only `/v1/student/learning/*` projections and SHALL NOT call student course-credit conversion, authorization, reservation, batch, or raw event endpoints.

#### Scenario: Projection response is returned
- **WHEN** `kanyue.server` returns a student learning overview
- **THEN** it omits credit type ids, batch ids, frozen quantities, conversion rules, operation numbers, and raw event metadata
