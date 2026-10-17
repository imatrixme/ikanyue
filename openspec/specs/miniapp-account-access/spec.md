# miniapp-account-access Specification

## Purpose
TBD - created by archiving change improve-miniapp-ux-flows. Update Purpose after archive.
## Requirements
### Requirement: Single-step WeChat login
The miniapp SHALL sign users in with WeChat by requesting only the phone number, and SHALL NOT call `getUserProfile`.

#### Scenario: One tap login
- **WHEN** a user who has accepted the agreements taps "使用微信手机号一键登录" and allows the phone number
- **THEN** the miniapp signs in with that phone number without asking for avatar or nickname

#### Scenario: Phone denied
- **WHEN** the user declines the phone number prompt
- **THEN** the miniapp says the phone number was not shared and stays signed out

### Requirement: Agreement consent before login
The login sheet SHALL show an unchecked consent row linking to the user agreement and privacy policy. Neither WeChat nor password login SHALL proceed until it is checked.

#### Scenario: Not accepted
- **WHEN** the user taps a login button without checking the consent row
- **THEN** no phone number or password request is sent and the miniapp asks the user to read and accept the agreements

#### Scenario: Reading the agreement
- **WHEN** the user taps "用户协议" or "隐私政策"
- **THEN** the corresponding agreement page opens and the login sheet keeps its state when the user returns

### Requirement: Visible sign out
Signed-in users SHALL find "退出登录" on the "我的" tab, and signing out SHALL ask for confirmation.

#### Scenario: Sign out from profile
- **WHEN** a signed-in user taps "退出登录" on "我的" and confirms
- **THEN** the local session is cleared and the tab shows its signed-out state

### Requirement: Signed-out points tab
The points tab SHALL NOT show a balance pass to signed-out users.

#### Scenario: Signed out
- **WHEN** a signed-out user opens the points tab
- **THEN** only the sign-in prompt is shown

