# Change: Add avatar upload endpoint for user info page

## Why
Frontend now supports avatar selection; backend needs an authenticated upload endpoint to store avatars in PocketBase.

## What Changes
- Add Hono route for `/v1/user/avatar` that accepts an image file, authenticates the user, and stores the file in PocketBase.
- Return stored avatar URL/path for immediate frontend refresh and cache update.

## Impact
- Affected specs: user-profile
- Affected code: user routes, PocketBase helper usage, file upload handling
