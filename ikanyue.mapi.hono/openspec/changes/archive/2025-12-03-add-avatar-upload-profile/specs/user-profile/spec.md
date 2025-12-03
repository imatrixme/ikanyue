## ADDED Requirements
### Requirement: Avatar Upload Endpoint
The backend SHALL provide an authenticated `/v1/user/avatar` endpoint that accepts an image file, stores it in PocketBase under the current user, and returns the stored avatar reference for the frontend to refresh the thumbnail.

#### Scenario: Successful avatar upload
- **GIVEN** the client sends a logged-in request with an image file to `/v1/user/avatar`
- **THEN** the backend SHALL store the file via the PocketBase SDK under the requesting user record
- **AND** respond with the stored avatar URL/path in the standard `code/message/data` envelope

#### Scenario: Missing file
- **GIVEN** a request to `/v1/user/avatar` without an image file
- **THEN** the backend SHALL return an error payload indicating the file is required

#### Scenario: Unauthenticated request
- **GIVEN** a request to `/v1/user/avatar` without valid auth
- **THEN** the backend SHALL return an authorization error using the standard envelope
