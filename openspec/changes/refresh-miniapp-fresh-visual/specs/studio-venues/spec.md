## ADDED Requirements

### Requirement: Venue Cover Image

Operators SHALL be able to upload one optional cover image per venue (JPG, PNG or WebP, at most 5MB) in Admin. The public venue list SHALL return its URL as `coverUrl`, and the mini program home SHALL show the current venue's cover as a full-width header with the venue card overlapping it.

#### Scenario: Operator uploads a cover
- **WHEN** an operator uploads a cover for a venue and the student reopens the mini program home
- **THEN** the home header shows that cover without a release

#### Scenario: Venue without a cover
- **WHEN** the current venue has no cover or the image fails to load
- **THEN** the home header shows a soft light wash and the venue card stays fully readable

#### Scenario: Invalid upload
- **WHEN** an operator uploads a file that is not an image or exceeds 5MB
- **THEN** the upload is rejected with a Chinese message and the existing cover is kept
