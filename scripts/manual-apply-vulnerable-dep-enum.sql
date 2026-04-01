-- Use this ONLY if `npx prisma migrate deploy` keeps failing with P1002 (advisory lock).
--
-- Before running:
--   1. Stop `npm run dev` and any other app using DATABASE_URL (they hold DB sessions).
--   2. In Neon → SQL Editor, paste and run this (uses your direct connection automatically).
--
-- After it succeeds (or if you see "already exists"):
--   npx prisma migrate resolve --applied 20260401180000_add_vulnerable_dep_kind
--
-- Then Prisma and your database stay in sync without the migrate CLI taking a lock.

ALTER TYPE "FindingKind" ADD VALUE 'VULNERABLE_DEP';
