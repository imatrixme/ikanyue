## ADDED Requirements

### Requirement: Platform Calls Stay in the Kit

The mini program SHALL call platform APIs (`wx`) only from its `kit/` directory, and its pure logic in `core/` SHALL NOT depend on `kit/` or any platform object. A check SHALL fail the unit test command when either rule is broken.

#### Scenario: Direct platform call in a page
- **WHEN** a page or service file calls `wx.` directly
- **THEN** the guard test fails and names the file

#### Scenario: Core stays portable
- **WHEN** a file in `core/` imports from `kit/`
- **THEN** the guard test fails

### Requirement: Cancellation Is Not an Error

Kit APIs SHALL return a user's own cancellation of a payment, confirmation dialog or subscribe prompt as a normal result, and SHALL raise errors only for real failures, as `Error` objects carrying `code` and `message`.

#### Scenario: Learner closes the cashier
- **WHEN** the learner cancels the payment sheet
- **THEN** `pay` resolves with `cancelled` and no error toast is shown

#### Scenario: Network failure
- **WHEN** a request cannot reach the server
- **THEN** `request` rejects with an error whose code is `NETWORK`

### Requirement: Minimal View Updates

Pages and components defined through the kit SHALL send to the view only the fields whose values changed since the last update, recomputing computed values as pure functions of the data.

#### Scenario: Unchanged fields are not resent
- **WHEN** a page sets one field while twenty others stay the same
- **THEN** exactly that field and the computed values that changed are passed to `setData`

#### Scenario: Pull-down refresh ends itself
- **WHEN** a page's pull-down refresh handler finishes or fails
- **THEN** the refresh indicator stops without the page calling it

### Requirement: Same Code for Development and Release

The mini program SHALL NOT need a build step or build-time constants: the API address and gateway stage SHALL follow the running version (development: local server and `TEST`; trial and release: `https://mapi.ikanyue.com` and `RELEASE`).

#### Scenario: Release version
- **WHEN** the released mini program sends a request
- **THEN** it goes to `https://mapi.ikanyue.com` with `X-Ca-Stage: RELEASE`

#### Scenario: Development version
- **WHEN** the project runs in WeChat DevTools as a development version
- **THEN** requests go to `http://127.0.0.1:1437` with `X-Ca-Stage: TEST`
