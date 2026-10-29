## MODIFIED Requirements

### Requirement: Mini Program Runtime Verification
The change SHALL include repeatable verification for key mini program runtime paths affected by report discovery, report rendering, and operation-slot navigation.

#### Scenario: Runtime paths are verified
- **WHEN** implementation is complete
- **THEN** verification covers home operation-slot display, operation-slot navigation, report history entry, shared-token report opening, invalid-token handling, and student-owned report opening

#### Scenario: WeChat runtime constraints are respected
- **WHEN** report and operation-slot pages are built for WeChat mini program
- **THEN** navigation URLs, page registration, network calls, and rendered text fit WeChat mini program constraints
