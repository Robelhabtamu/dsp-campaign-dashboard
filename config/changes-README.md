# What Changed connection and display contract

`/changes` uses `AI_DASHBOARD_DATABASE_URL` exclusively through server-only
`lib/changes-data.ts`. There is no DATABASE_URL fallback or implicit demo fallback. An explicit development-only synthetic path is described below.
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
dataset/reporting period will require updating the existing configuration. Production never loads synthetic fixtures. Local preview requires an explicit development opt-in and never calls the live reader.

Live SQL, migration state, effective privileges and browser rendering are not
verified by offline tests. Configure the restricted reader and verify against an
isolated database before enabling it against a deployed environment.


## Working local synthetic preview

From the ROOT repository:

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m ai.run_changes_preview --port 3002
```

Open **http://127.0.0.1:3002/changes**. Leave the command running; Ctrl-C stops it.
No installation, dotenv edits, database access or API keys are required. The
launcher builds deterministic observations with the existing Python detector,
writes a temporary JSON transport file, and starts the installed Next dev server
on loopback. It clears DB/provider configuration in that child process so other
live routes cannot accidentally reach Neon. This isolated app is for `/changes`;
other analytics routes need their normal separate dashboard server.

The launcher sets `CHANGES_LOCAL_PREVIEW=1` and `CHANGES_PREVIEW_FILE` only in its
child environment. `NODE_ENV` MUST be `development`; production ignores both flags
and does not open the fixture file. A requested local preview with a missing or
malformed file shows an error, never silently falls back to Neon. The build goes
to ignored `.next-changes-preview/`, independent of the existing server on 3001.
Next includes that output's generated types in tsconfig; ESLint ignores it.

Fixtures: advertisers 1458 and 3358, June 6–7, 2013. Four synthetic alerts occur
at June 7, 12:00: clicks and impressions above baseline for 1458, below baseline
for 3358. Impressions are 200/10 against a baseline mean of 102.5; clicks are
20/1 against a baseline mean of 10. A missing hour for 3358 at June 7, 20:00
exercises coverage diagnostics. Conversion baselines are constant zero, so no
conversion z-score is invented. June 6 has insufficient history.

Baseline: prior 24 consecutive recorded hours, minimum 24 samples, sample standard
deviation, |z| >= 3, same advertiser only, no current/future observation included.
Missing slots withhold scoring. No weekday recurrence or significance claim is
made. Descriptions are fixed statistics, clearly NOT generated or judged AI.
The existing explanation engine, batch, SQL migrations and Neon data are untouched.

Metric/direction/campaign/date filters are applied together. Dates are inclusive;
all reporting dates June 6–12 remain selectable so days outside fixture coverage
produce explicit empty results. Counts describe the displayed selection only.
Cards sort newest first with deterministic tie-breaks. Percentage change is
(observed - mean) / mean * 100; a zero mean displays “Not defined (zero baseline)”.
Summary/evidence values use the existing number formatter; percentages are rounded
to one decimal place, with exact counts/baselines retained in evidence details.

For live results, metric/direction predicates are parameterized in the view query
BEFORE LIMIT 101; the pure display filter also enforces them. Existing published
validation, read-only transactions and the dedicated reader remain in place.
The pool disables named prepared statements for serverless pooling compatibility.

## Missing live status contract — not inferred by this UI

`published_outputs` exposes approved results only. An empty published selection
cannot distinguish: no anomaly detected, no batch run, insufficient history,
missing coverage, generator/judge failure, or withholding. Do not show a zero count
for any of those operational states from this view alone. Local diagnostics are
known because the real detector was executed on the fixture; they do not establish
anything about live campaigns.

A future dedicated published-safe batch-status read model must include scoped
campaign/time window, run ID/configuration, started/completed timestamps, completion
state, coverage watermark, hours expected/observed, diagnostic counts by reason,
normal/anomaly counts and approved/withheld/error counts. It must expose no rejected
text, provider responses or raw logs, and needs its own reviewed reader grants.
No such model or schema migration was introduced here.

## Remaining activation steps (not executed)

1. Validate reviewed migrations 001/002 and permission gate 003 on an isolated DB.
   Review existing shared PUBLIC/default privileges; do not revoke shared rights
   blindly. The existing integration runbook records the remaining SQL risks.
2. Provision separate batch reader/writer and published-view reader logins. Verify
   actual effective ACLs and ownership with real logins. No owner credential fallback.
3. Run the existing batch with an explicitly approved model budget; verify final
   call logs, numeric validation and Cohere judgment before publication.
4. Set server-only `AI_DASHBOARD_DATABASE_URL` for the verified view reader, then
   verify filters and actual approved results. Never enable preview in production.
5. Implement the scoped operational status contract before claiming “no anomalies”.

## Tests

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=pipeline/src .venv/bin/python -m pytest -p no:cacheprovider pipeline/tests ai evals reports/tests -q
cd dashboard
npm test
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
```

Dashboard tests use an explicitly synthetic checked-in transport fixture so this
submodule can test independently. Root Python tests verify the fixture matches
the real deterministic producer. The runtime preview still generates fresh
fixture evidence with Python; it never uses the test snapshot. Tests cover
production isolation, malformed fixtures, unauthorized live readers, sanitized
errors, zero baselines, missing hours, filters, chronological output and no mutation.

## Browser verification (2026-11-23)

Verified in Firefox against the actual running localhost Next app, not static HTML:

- `/changes` displayed the SYNTHETIC DEMO banner and four alerts (two above/two below).
- Used the Campaign, Metric and Direction dropdowns and Apply filters: advertiser
  3358 + impressions + below returned exactly one alert (10 versus 102.5, z-score
  −16.198508, percentage change −90.2%).
- Expanded “View baseline & validation details”; UI showed June 6 12:00 through
  June 7 12:00 exclusive, 24 samples and sample standard deviation 5.710402.
  A screenshot of that expanded card was captured in the tool conversation.
- Opened the June 6-only selection; UI explicitly reported insufficient history.
- Changed the To date's day control from 06 to 07 and clicked Apply filters;
  the alert returned, verifying the inclusive date endpoint through the real form.

This is local synthetic browser verification only. Live database ACLs, live batch
status, persisted output and AI calls were not exercised. Mobile breakpoint layout
uses the existing responsive grid; no mobile-device walkthrough is claimed.
