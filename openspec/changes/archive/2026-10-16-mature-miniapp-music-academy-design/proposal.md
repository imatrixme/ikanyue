## Why

The mini program currently combines saturated primary colors, oversized clay-style illustrations, game-like English labels, and reward-heavy decoration. That visual language reads as a children-only product, while Kanyue Art serves children, parents, and adult music learners and needs one credible institutional experience for all of them.

## What Changes

- Replace the child-oriented visual language with a restrained contemporary music-education system built around warm neutrals, institutional red, muted informational colors, Chinese-first typography, and compact motion.
- Replace the six oversized clay empty-state illustrations with age-neutral musical still-life artwork and reduce empty states to supporting content rather than page focal points.
- Remove game-like English labels and role numbering while retaining "musician" only where it works as an inclusive identity expression.
- Rework the activity, points, profile, and profile-editing page hierarchy so real activities, account information, rewards, and learner identity carry the visual emphasis.
- Redesign the three tab-bar icons and shared functional icons with one consistent line system and restrained selected states.
- Verify children, adult, and no-avatar identities across 320px, 375px, and 430px viewport widths without changing APIs, authentication, points rules, reward rules, or refresh behavior.

## Capabilities

### New Capabilities
- `inclusive-miniapp-visual-system`: Defines the age-inclusive visual language, page hierarchy, empty states, iconography, copy, motion, and responsive verification requirements for the Kanyue mini program.

### Modified Capabilities

## Impact

- `ikanyue.taro3`: shared visual tokens, app and page configuration, icon and empty-state assets, activity/points/profile/userinfo presentation, and build-facing tests.
- Root OpenSpec artifacts and the Taro submodule pointer only; the parent repository remains dependency-neutral.
- No Admin, Hono, PocketBase, authentication, points ledger, reward pricing, shipping, inventory, or redemption-flow changes.
- No Docker verification during implementation.
