# What Changed connection and display contract

`/changes` uses `AI_DASHBOARD_DATABASE_URL` exclusively through server-only
`lib/changes-data.ts`. There is no DATABASE_URL fallback or mock/demo fallback.
Provision a dedicated login inheriting only `ai_dashboard_reader`; review actual
effective privileges using the backend integration runbook before deployment.
Do not use the AI mart reader, writer or owner login. No env file is changed by
this implementation. Existing analytics routes retain their connection.

The connection requires TLS, a read-only transaction, statement timeout, bounded
pool and a 101-row query limit. A runtime guard requires inherited dashboard-reader
membership and rejects table-level SELECT on raw explanations. This is a defense
in depth check, not a substitute for the full actual-login ACL verification.

Only `ai_store.published_outputs` is queried for display data. Its current columns
are job_id, created_at, evidence, explanation, provider_used, attempt_count and
publication_status. The page queries six of these (publication time is not used
for observation-date filtering). It does not query raw evidence tables, drafts,
jobs, judge prose, withheld explanations or provider-call logs.

The display boundary revalidates finite counts, timestamps, prior windows, z-score
consistency and exact evidence-linked claims. Only whitelisted validated fields
are rendered, as plain escaped React text. The prose presentation is a fixed
template of those claims, not free-form model output. Extra/causal prose or
unsupported numbers fail validation and are omitted. An empty view cannot diagnose
whether there were no anomalies, insufficient history, withheld output or an
unexecuted batch. The page states those limits and reports configuration/database
failures separately without displaying driver error messages.

Filters reuse the existing campaign IDs and configured campaign flight dates
(currently June 6–12, 2013) through shared filter validation. The dates are selection
bounds, not claims of data coverage. DEMO budget amounts are never used. A changed
dataset/reporting period will require updating the existing configuration. No
synthetic fixtures are loaded by the runtime; they exist only in offline tests.

Live SQL, migration state, effective privileges and browser rendering are not
verified by offline tests. Configure the restricted reader and verify against an
isolated database before enabling it against a deployed environment.
