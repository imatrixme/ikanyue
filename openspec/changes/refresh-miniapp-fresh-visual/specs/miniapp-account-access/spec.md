## MODIFIED Requirements

### Requirement: Visible sign out
Signed-in users SHALL find "退出登录" at the foot of the profile editor opened from "我的", and signing out SHALL ask for confirmation that offers to stay signed in.

#### Scenario: Sign out from profile
- **WHEN** a signed-in user opens the profile editor from "我的", taps "退出登录" and confirms
- **THEN** the local session is cleared and "我的" shows its signed-out state

#### Scenario: Stay signed in
- **WHEN** the user chooses "保持登录" in the confirmation
- **THEN** the session is kept and the editor stays open
