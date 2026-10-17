## 1. Account exposure (ikanyue.mapi.hono)

- [x] 1.1 `publicUser()` redaction applied to every route returning a user record; `filterLiteral()` for cellphone filters.
- [x] 1.2 Password login: no auto-registration, per-account failure limit, docs and swagger updated.
- [x] 1.3 Tests for redaction, unknown numbers, escaping and throttling.

## 2. Website (ikanyue.website)

- [x] 2.1 Course detail route; Chinese enum labels; codes hidden; Asia/Shanghai activity times.
- [x] 2.2 Remove English eyebrows; em-based heading measure; 16px mobile gutter.
- [x] 2.3 Mobile course carousel, header CTA button, faculty chips, 2-line excerpts, face-safe hero crop, illustrative-image note.

## 3. Miniapp (ikanyue.taro3)

- [x] 3.1 Single native title per page; canvas chrome; remove English eyebrows and tall heroes.
- [x] 3.2 Profile and courses information architecture.
- [x] 3.3 Points wording, seals, reward fallback, shop refund-rule link and short buy button.
- [x] 3.4 Outline teacher tab icons, palette recolour, brand empty-state art, circular date selection.

## 4. Local stack (root)

- [x] 4.1 Separate PocketBase migrations directories with automigrate off.

## 5. Verification

- [x] 5.1 Hono tests, lint, check-docs; website unit, lint, build; miniapp unit, lint, weapp build and e2e; native-stack test.
