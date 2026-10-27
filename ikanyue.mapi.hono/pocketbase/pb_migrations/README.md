# Course-credit migrations

The executable migrations in this directory are generated from
`src/services/courseCredits/schema` with:

```bash
pnpm run course-credits:migrations:generate
```

The generated catalog, ledger, and teaching migrations are reviewed and
committed. Apply them with PocketBase `v0.32.0` using this directory as
`--migrationsDir`. The API bootstrap script remains an idempotent local
inspection tool; production rollout uses these versioned migrations.

`1788739300_course_commerce.js` is generated from `src/services/commerce/schema.js`
by the same command. `scripts/pb-ensure-commerce-schema.js` stays the local
bootstrap path; production uses the migration. Do not run both against one
database.

`1788739200_batch_capacity.js` raises the Batch API limit to at least 1000
requests. The API refuses to start below 500 because publication and settlement
commit one atomic batch per command.
