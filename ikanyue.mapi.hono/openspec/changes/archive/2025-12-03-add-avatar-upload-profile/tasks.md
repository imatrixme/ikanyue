## 1. Implementation
- [x] 1.1 Add `/v1/user/avatar` route with auth middleware.
- [x] 1.2 Accept multipart upload, validate image presence, and store avatar in PocketBase (current user record) using SDK.
- [x] 1.3 Return stored avatar URL/path; set default on failure to derive URL; keep legacy `code/message/data` contract.

## 2. Validation
- [ ] 2.1 Manual upload via curl/postman (happy path) returns avatar URL and updates user record.
- [ ] 2.2 Manual error cases: missing file or unauthenticated request return error payload with code/message.
