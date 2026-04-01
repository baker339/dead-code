# Deploying Dead Code

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `DATABASE_URL` | App runtime (Vercel, etc.) | Pooled Neon URL (`-pooler` host) for Prisma + `pg` pool |
| `DIRECT_URL` | **CI + local only** for `prisma migrate` | Non-pooled Neon host (no `-pooler`) — advisory locks require a direct session |
| `CRITICAL_VULN_WEBHOOK_URL` | Optional | HTTPS endpoint that receives a JSON POST when a run reports **critical** dependency advisories (Slack incoming webhook, etc.) |

Do **not** use the pooled URL for `npx prisma migrate deploy` — it will time out (P1002) waiting for advisory locks.

## Database migrations

1. Add `DIRECT_URL` to your CI secrets (same DB as production, direct connection string from Neon).
2. On deploy, run migrations **before** or **with** the app build, e.g.:

```bash
npx prisma migrate deploy
```

Use `npm run db:migrate` as an alias.

3. Re-run **repo analysis** on a schedule or after deploy so new analyzers (lockfile audits, gitignore rules) apply to stored runs.

## GitHub Actions

See `.github/workflows/migrate.yml` — wire `DIRECT_URL` (or a single `DATABASE_URL` if you only use a direct string in CI) as a repository secret.

## Language toolchains (C#, Java, Swift)

Analysis runs shell out to the repo’s toolchain. Install on the host or Docker image that runs Inngest:

| Stack | Required for |
|-------|----------------|
| **.NET SDK** (`dotnet`) | `dotnet build` warnings / analyzers (`.sln` / `.csproj`) |
| **JDK + Maven** or **Gradle** (`gradle` / `gradlew`) | `mvn compile` / `gradle classes` compiler warnings |
| **Swift** (`swift`) | `swift build` diagnostics for SwiftPM (`Package.swift`) |

If a tool is missing, that analyzer returns no findings and the graph may still be built from tracked `*.cs` / `*.java` / `*.kt` / `*.swift` files.

## Re-running analysis

After schema or analyzer changes, run analysis again from the dashboard so **Files** and **Charts** reflect the latest findings.

## Production checklist

1. **Auth** — Set `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` in the host. Add the production app URL and callback URL (`/api/auth/callback/github`) in the GitHub OAuth app settings.
2. **Database** — `DATABASE_URL` (pooled) for the app; `DIRECT_URL` for CI migrations. Run `npx prisma migrate deploy` on every deploy before traffic.
3. **Inngest** — Set `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` (unset `INNGEST_DEV`). Point the Inngest app at your deployed `/api/inngest` URL and verify the **Analyze repository** function is registered.
4. **Analysis runtime** — Long jobs use the Inngest step timeout (`maxDuration` on the route). Ensure the host allows enough wall time for clone + analyzers (see `app/api/inngest/route.ts`).
5. **Stripe** (if billing) — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs, webhook endpoint URL in Stripe Dashboard, Customer Portal configuration.
6. **Observability** — Ship `console` output from Vercel/host logs and Inngest run history. Failed runs store `error` on `AnalysisRun`; search logs for `[run-analysis]` and `[inngest analyze-repository]`.
7. **Secrets** — Never commit `.env`. Mirror `.env.example` in your host’s secret store.
