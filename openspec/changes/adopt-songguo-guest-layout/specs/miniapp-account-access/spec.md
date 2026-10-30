## MODIFIED Requirements

### Requirement: Signed-out points tab
The points page SHALL NOT show a balance pass to signed-out users. It SHALL describe points neutrally and offer one action that signs the user in on the page, without naming sign-in as a requirement.

#### Scenario: Signed out
- **WHEN** a signed-out user opens the points page
- **THEN** only a neutral points card with a "查看我的积分" action is shown

#### Scenario: Signing in from the points page
- **WHEN** the user taps "查看我的积分" and signs in
- **THEN** the login sheet closes and the page reloads with their points

## ADDED Requirements

### Requirement: Sign in where the user acts
Pages with a signed-out view SHALL NOT open on a sign-in prompt. An action that needs an account SHALL open one shared login sheet on the current page. After a successful sign-in, the page SHALL reload in place. A student's tapped action SHALL then continue; a teacher SHALL land on their own view. "我的" SHALL show signed-out visitors the same header, stats, studio card and shortcuts, with the header reading "点击登录".

#### Scenario: Personal entry on 我的
- **WHEN** a signed-out user taps a stat or 我的订单 on "我的"
- **THEN** the login sheet opens on "我的", and after signing in as a student the page reloads and the tapped page opens

#### Scenario: Public entry
- **WHEN** a signed-out user taps 用户协议 or 场馆信息
- **THEN** the page opens without asking for an account

#### Scenario: Closing the sheet
- **WHEN** the user closes the login sheet
- **THEN** typed credentials are cleared and the tapped action does not run
