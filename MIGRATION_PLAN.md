# Implementation plan: Next.js + Vercel + Supabase PostgreSQL + Prisma

Status: proposed; planning only. No deployment or Prisma implementation performed. Updated requirements: fresh database, explicit Prisma seed, and dashboards without background polling.

## Agreed scope

Use standard Next.js App Router on Vercel's Node.js runtime, Supabase PostgreSQL, and Prisma ORM for server-side persistence. Prisma Postgres and Prisma Accelerate are not required.

Existing data does not need to be preserved or imported. Start with a fresh PostgreSQL database; do not build D1 export/import, record reconciliation or legacy-account linking tools. This does not require deleting the existing local database or uncommitted source changes.

Preserve the current screens, Aluno/Professor tabs, API contracts, teacher email/password login, matrícula login, first student password change, class relationships, progress history and authorization behavior. Retain existing authentication during this adaptation; Supabase Auth is a separate future decision, particularly because students need not have email addresses.

Prisma is recommended for typed models, relations and migrations. Most current business queries use raw D1 SQL, so keeping Drizzle would not eliminate the database-query rewrite. Prisma transactions must still explicitly implement ownership, concurrency and audit rules.

## 1. Prepare the runtime and environments

- Preserve current source changes and establish a recoverable baseline; implement on a dedicated branch.
- Pin compatible Node, Next.js, Prisma CLI/client/adapter and pg versions. Proposed baseline: Node 24 and the documented Prisma 7 workflow; validate exact versions before installing and do not mix major-version configuration examples.
- Replace framework wrappers with `next dev --port 5173`, `next build` and `next start --port 5173`.
- Replace Cloudflare bindings in `db/index.ts` and `lib/classroom/server.ts`. Retire Vinext, Wrangler runtime scripts, Sites build hooks and worker types after verifying parity. Legacy SQL migrations remain historical references, not PostgreSQL migration input.
- Use local PostgreSQL for development/tests and isolated Supabase staging/production projects within available free-project allowances. Vercel previews must never use production database credentials.
- Confirm Vercel Hobby eligibility and select compatible nearby Vercel/Supabase regions before provisioning.
- Document Windows setup and pnpm/Node availability, local PostgreSQL lifecycle, startup commands and environment variables.

Acceptance: standard Next.js starts locally and the pinned stack builds successfully.

## 2. Configure Prisma and PostgreSQL

- Add `prisma/schema.prisma`, `prisma.config.ts`, PostgreSQL migrations and a server-only Prisma client. Reuse the client/pool per process and across development reloads.
- Runtime `DATABASE_URL` uses Supabase's transaction pooler. Bound the pg pool size and connection/query timeouts; verify adapter/prepared-statement compatibility.
- Migration `DIRECT_URL` uses a direct connection when reachable, or the documented session pooler for IPv4-only tooling. Do not run schema migrations through the transaction pooler.
- Separate migration DDL credentials from runtime DML credentials. Keep all database secrets out of browser bundles and `NEXT_PUBLIC_*` variables.
- Disable the unused Supabase Data API or keep application tables outside exposed schemas with public access revoked. Prisma connections do not automatically apply browser-user identity to RLS; server-side role/ownership checks remain mandatory.
- Prisma Migrate becomes the sole schema owner; no parallel Drizzle migration pipeline or production schema changes from ordinary Vercel builds.

Acceptance: a server-side query works, previews are isolated and production builds do not depend on actual user data.

## 3. Model a clean database

Represent the existing 17-table capabilities: user profiles, teacher/student credentials, sessions, login-attempt counters, teacher-student links, classes, memberships, books, class-book assignments, individual readings, progress events, deadline events, account audit events and goals.

- Use readable model names with `@map`/`@@map` for recognizable SQL names.
- Keep identifiers compatible with current APIs. Matrículas remain strings, including leading zeros.
- Preserve the current matrícula-as-student-ID contract for this adaptation. Use reviewed `ON UPDATE CASCADE` relationships for rekeying and explicitly update any unlinked owner fields in the same transaction. Revoke affected student sessions. A separate immutable student ID redesign is out of scope.
- Preserve compound uniqueness, version counters, soft deletion and restrictions that protect assignment/history relationships.
- Convert boolean flags explicitly. Keep statuses constrained and maintain date-only deadlines versus timezone-aware event timestamps, with America/Sao_Paulo deadline calculations.
- Maintain API date/string representations and avoid BigInt serialization errors for session expiry.
- Add ownership, membership, session-expiry and history indexes. With a clean database, all seed records must satisfy the reviewed foreign keys from day one.

Acceptance: migrations create an empty, internally consistent PostgreSQL schema.

## 4. Port services and authentication

Refactor `service.ts`, `accounts.ts`, `memberships.ts`, `student-auth.ts` and `teacher-auth.ts` behind the existing API boundary.

- Replace D1 queries with Prisma operations or parameterized PostgreSQL SQL where appropriate; do not build a D1 emulation layer.
- Replace `db.batch()` with actual transactions whose helpers receive the transaction client.
- Replace SQLite `changes()` and intentional NOT NULL failures with checked affected-row counts and explicit HTTP 409 conflicts; audit writes must roll back with failed state changes.
- Replace SQLite PRAGMAs, random ID expressions and date functions. Preserve atomic class distribution, membership changes, automatic readings, deadline changes, corrections and matrícula rekeying.
- Use consistent row-lock/version-check ordering and bounded retries for transient serialization/deadlock errors. Preserve idempotent distribution and teacher/student isolation.
- Keep scrypt hashing outside short database transactions, then recheck versions/active state before session or password writes.
- Preserve secure cookies, origin checks, size limits, generic errors, database-backed rate limiting, student first-password change, logout and auth-version revocation.
- Replace `cf-connecting-ip` with a verified Vercel-supported trusted client-address source; test spoofed headers and limits across serverless instances.
- Start with empty session/attempt tables. No existing password or session imports are needed.

Acceptance: teacher/student flows, concurrency, rollback and authorization tests pass against PostgreSQL.

## 5. Implement the Prisma seed

Create an executable `prisma/seed.ts` alongside the Prisma schema/client implementation, register it in the pinned Prisma configuration, and expose `pnpm db:seed` through `prisma db seed`. Prisma is not installed yet; this section specifies the required implementation, not an already runnable seed.

| Record | Identity | Initial access and relationships |
| --- | --- | --- |
| Teacher | Henrique Klug; `henriqueklug@gmail.com` | Password `admin`; owns the dummy class and manages both students |
| Student 1 | Aluno Teste 1; matrícula `202600001` | Password `EDU123`; mandatory password change; member of the dummy class |
| Student 2 | Aluno Teste 2; matrícula `202600002` | Password `EDU123`; mandatory password change; member of the dummy class |
| Class | Turma de Teste | Owned by Henrique; both students enrolled |

Dummy student names and matrículas are chosen defaults. No books, readings, goals, fake history or sessions are requested.

- Use stable fixture identifiers/unique keys and Prisma upserts inside one transaction for profiles, credential rows, teacher-student links, class and memberships.
- Hash passwords using the real authentication helper before opening the transaction; database columns contain hashes only. Do not print passwords or hashes.
- Apply initial passwords only on account creation. Rerunning must not reset passwords, names, account activity or first-password-change state, or delete later user data.
- Detect fixture identity/email/matrícula collisions and fail clearly instead of attaching unrelated users to the class.
- Repeated runs must not duplicate accounts, class or relationships. Do not recreate memberships that a user deliberately removed; create initial memberships when the fixture student or class is first created.
- No truncate/reset/delete, no seed in the request path, and no automatic seed on app startup or every deployment. Run it explicitly for the selected database.
- Allow an optional bootstrap-password environment override without changing the requested default for the initial seed.
- Test a fresh seed, a second run with unchanged counts, authentication for all three accounts, class membership/ownership, and a rerun after a user changes their password.

Acceptance: a fresh database has one teacher, two students and one class with both students; reruns preserve subsequent edits.

## 6. Remove automatic dashboard fetching

- Fetch the dashboard once on initial mount and on explicit page reload/manual retry.
- Remove the 10-second `setInterval` and window-focus refresh listener in `components/classroom/app.tsx`.
- Do not substitute visibility refresh, realtime subscriptions, WebSockets or another periodic revalidation mechanism.
- Keep successful user actions reflected immediately. Retain a single action-triggered refresh when a mutation needs an authoritative snapshot, along with conflict/error retry behavior. These are consequences of user actions, not constant background fetching.
- Switching dashboard sections uses the loaded snapshot. Another user's changes appear when the current user refreshes the page.
- Verify idle pages and focus/visibility changes cause no dashboard fetches; manual reload loads fresh data; mutations do not create recurring fetch loops. Check the production build to distinguish behavior from development-mode effect checks.

Acceptance: both dashboards are network-idle after loading unless the user refreshes or performs an action.

## 7. Validate and deploy

- Port SQLite database tests to real isolated PostgreSQL and Worker HTTP tests to standard Next.js. Keep pure-logic tests and use the existing 73 automated checks and 66 HTTP assertions as the behavioral baseline.
- Add seed idempotency, PostgreSQL concurrency/rollback, date handling, connection-pool and no-polling verification.
- Run TypeScript, lint, build, browser journeys and deployed preview smoke tests, including initial student password changes and teacher dashboard membership counts.
- Measure request/data-transfer/database usage under page-load and user-action traffic; old recurring 10-second polling estimates no longer apply. Add pagination/selective fields if needed without reintroducing polling.
- Demonstrate backup and restore for future real data. Document Supabase Free inactivity pausing and quota ownership.
- Connect GitHub to Vercel, isolate environment-scoped secrets, generate Prisma Client during the pinned-version build workflow, and apply production migrations once through a controlled release job.
- Create a fresh target database, apply migrations, invoke the seed explicitly, deploy and verify the seeded user/class flows. No D1 import, reconciliation or old-data write freeze is needed.
- Before real usage begins, correct/retry a failed launch on the fresh environment. Once users create real records, preserve those PostgreSQL records during rollback; use compatible application rollback/forward fixes instead of resetting the database.
- Monitor errors, failed logins, latency, database growth, pool saturation and platform quotas.

Acceptance: the seeded app works on the target URL, refresh-driven behavior is verified, backups work and rollback ownership is documented.

## Suggested order

1. Runtime/Prisma compatibility and environment setup.
2. PostgreSQL schema and integration-test harness.
3. Transactional service and authentication adaptation.
4. Prisma seed and removal of dashboard background fetching.
5. Browser, capacity, backup and staging validation.
6. Reviewed clean deployment.

Before provisioning/launch, confirm expected teachers/students and concurrent use, free-plan eligibility/project ownership, regions, domain and backup ownership. Old-data preservation is explicitly out of scope; existing authentication, the exact teacher seed and refresh-driven dashboards are agreed requirements. No public deployment is implied by this plan update.

## References

- [Supabase and Prisma](https://supabase.com/docs/guides/database/prisma)
- [Supabase connection options](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Prisma 7 PostgreSQL adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)
- [Vercel Hobby terms and limits](https://vercel.com/docs/plans/hobby)
- [Supabase plans](https://supabase.com/pricing)
