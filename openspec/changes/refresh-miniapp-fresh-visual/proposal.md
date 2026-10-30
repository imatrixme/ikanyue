## Why

The founder finds the native mini program visually heavy next to 松果约课:

- Large deep-green blocks (the home venue card, the profile header, primary buttons) dominate every page.
- The 32 icons are multicolour, semi-3D illustrations with yellow accents, and their styles differ.
- Empty states use a saturated book illustration.
- The home header is a flat green card. 松果 opens on a full-width venue photo with a white card on top.
- Tab icons were missing at runtime: `setTabBarItem` was given page-relative paths. That is fixed separately with root-absolute paths.

## What Changes

- **Venue cover.**
  - Venues get an optional cover image.
  - Admin uploads it in the venue drawer: JPG/PNG/WebP, at most 5MB.
  - `GET /v1/public/venues` returns `coverUrl`.
- **Home header.**
  - The home page opens on the current venue's cover, full width, with a white venue card overlapping its lower edge.
  - Without a cover it shows a soft light-green wash instead of a photo.
- **Lighter surfaces.**
  - Mini program pages use light surfaces and white cards, with the brand green only for actions, selection and small accents.
  - The brand token source and the website are unchanged.
- **One rounded line-icon set.**
  - Every mini program icon, tab icons included, is redrawn as a hand-written SVG on a 24-unit grid.
  - All icons share a 1.5 rounded stroke, generous corner radii, a single colour and a pale accent blob set slightly off-centre.
  - SVG sources live in `ikanyue.mini/design/icons/` and are exported to PNG by a script.
- **No illustrations.** Empty and error states show a small line icon in a pale circle instead of artwork.
- **Lighter mini program tokens.**
  - `brand-tokens.json` gains mini-program-only keys: `foundation.typography.miniappWeight` (no bold: titles 500, text 400), a smaller `miniappSizePx` scale, `foundation.miniappRadiusPx` (softer corners) and `semantic.miniappColor` (softer ink).
  - `foundation.shadow.miniapp` switches from hard offset shadows to soft blurred ones.
  - Card outlines fade to a hairline; primary actions use the brighter brand green.
- **Fewer lists.**
  - Home hides the native title bar: the cover runs under the status bar and the capsule.
  - Each destination has one entry: booking is the 约课 tab, the profile stats open courses, appointments and points, and home keeps the venue card, the lesson balance and one 去约课 action.
- **Studio-neutral profile.**
  - The profile shows the user's own data: avatar and name, lesson, upcoming and points numbers, membership cards and a few account shortcuts.
  - Each studio is a membership card with its own pale theme (or its venue cover); the studio's venues and introduction only show after opening the card (`pages/memberCard`).
  - Logout leaves the profile page and becomes a quiet text link at the foot of the profile editor, with a confirm that offers to stay signed in.
  - Course detail, the shop and order detail use a few soft cards instead of stacked list sections; inside a course, lesson rows drop the repeated course name.

## Non-goals

- No change to shared `semantic.color` or to any web token; the website and Admin look the same.
- Only the home page draws its own top; other pages keep the native title.
- No change to page behaviour beyond the header, entry placement and visuals.

## Impact

- Affected specs:
  - `studio-venues` (cover image)
  - `inclusive-miniapp-visual-system` (icons and empty states)
  - `student-miniapp-home` (profile entries become the stats and shortcuts)
  - `miniapp-account-access` (sign out moves to the profile editor)
- Affected code:
  - `kanyue.server`: venues module, new migration, tests.
  - `ikanyue.admin`: venue API and drawer, tests.
  - `ikanyue.mini`: home page, page styles, `app-icon`, `async-state`, `imgs/`, icon export script, tests.
- Data: one optional file field on `venues`. `migrate up` is required before serving.
