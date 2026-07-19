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
