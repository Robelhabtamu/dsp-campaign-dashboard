> Public-access update: visitor sign-in is no longer required by user decision.
> See [PUBLIC_ASK.md](../../ai/PUBLIC_ASK.md) for the implemented public API bridge,
> Python service, configuration and deployment steps. The historical requirements
> below are superseded for this explicit public mode. Backend readiness still gates submission.

# Ask the Data — Phase 3 interface and disabled integration boundary

> Local development update: an explicitly labeled synthetic-only Python/Next
> demo now exists. See [LOCAL_ASK.md](../../ai/LOCAL_ASK.md) for startup, provider
> budgets, verified browser behavior and limitations. Live-data execution remains
> disabled. The sections below describe the original live integration boundary;
> their no-demo/no-service statements are superseded only for this separate
> opt-in development mode. No real user authentication has been invented.

## Current operational status

`/ask` is a dashboard interface with shared navigation/reporting filters and a
question draft input. It has no live answers, database queries or demo fallback.
Submitting is disabled. `/api/ask` has an intentionally disabled POST handler:
it always returns HTTP 503 with a fixed unavailable message and no evidence.
The repository paths inspected for this task contained no authentication/session
mechanism and no safe Python service invocation bridge. This change does not
pretend to supply either. No env flag, browser prop, request header or development
bypass can enable the deployed route. Changing the button in developer tools
still reaches a disabled API.

The generic `handleAsk(request, integration)` gate is tested with MOCK adapters.
Its authentication, authorization, rate limiter and invocation interfaces are
contracts for later integration, NOT working production implementations. No
in-memory limiter, homegrown session cookie, shared API-key sign-in, local Python
subprocess, eval or shell command is introduced.

## Server request flow (when approved adapters eventually exist)

1. Require POST, exact configured trusted Origin, JSON content type, and a maximum
   4,096-byte request. Content-Length is checked when supplied and an independent
   streaming byte counter checks the real body. Deployment infrastructure must
   also set connection/body-read deadlines to protect against stalled streams.
2. Authenticate through a verified server-side session adapter. Browser-provided
   user IDs are not accepted. Authentication failures return 401. A trusted proxy
   header is not sufficient unless verified by the chosen authentication stack.
3. Atomically consume a per-user rate-limit quota using the authenticated identity.
   The backing store must be shared across server instances, have a documented
   quota/window, and fail closed. Denial returns 429/Retry-After. This check runs
   before reading the full body and before queries; invalid/unauthorized scopes
   therefore also consume quota. No concrete quota/store is currently provisioned.
4. Parse an exact `{question, campaign, from, to}` JSON object. Question length is
   1–1,000 nonblank characters; filters use the shared campaign/inclusive-date
   validator. Extra user/role/config keys and invalid filters return 400.
5. Authorize requested campaign/date scope against SERVER-side permissions. Denial
   returns 403. Selection filters are not authorization. An `all` campaign request
   must be authorized for its entire set, not treated as a bypass.
6. Call the existing Python AskAgent through an authenticated bounded service
   bridge with the verified principal and authorized scope. A 30-second deadline
   and AbortSignal are provided; the bridge must enforce that deadline/cancellation
   in the Python worker too. A Promise timeout alone cannot stop provider billing
   or background work. No such bridge is configured by this change.
7. Cap upstream serialized output at 256 KiB and project only public result fields.
   No caching (`Cache-Control: no-store`); no raw error logging or secret echo.
   Dependency failures return a fixed 503. Allowed Python terminal statuses are
   carried in the response; a withheld/unanswerable/error result never displays
   answer text. The browser separately checks transport shape and ignores remote
   status-message prose. React renders SQL, answer and cells as escaped plain text,
   with no HTML/Markdown execution or dangerouslySetInnerHTML.

The API does not implement SQL compilation, numerical claim checking, provider
fallback or judge logic in TypeScript. Those remain in the existing Python agent
and SQLTools. TypeScript checks transport shape/cardinality and selects public
fields only. The bridge must authenticate its response origin; shape validation
is not proof of semantic approval. Unknown upstream fields (including judge
reasons and provider logs) are dropped.

## Provenance and provider verification

The response projection preserves the Python agent's safe provider_used, steps,
sql_calls and answer_attempts metadata, plus SQL associated with each evidence
block. Missing/out-of-bounds metadata is shown as **Not reported**, not inferred.
Source labels and whether SQL was executed appear only when explicitly supplied
by the backend. Synthetic fixtures are conspicuously labeled; no fixture fallback
exists in runtime code. The standard AskAgent response does not report explicit
source/execution flags, model IDs, freshness, publication time or durable audit
IDs; the UI does not invent them. SQL rows are supporting evidence, distinct from
an approved model interpretation when an answer is withheld or unanswerable.

Gemini-to-Cohere generation/validation passed a separate live synthetic smoke
test. That does not verify live database execution, persistence, authenticated
dashboard access or agent-service integration. Groq access remains unresolved.
This page and disabled API make no provider calls. The Python compiler, roles,
timeouts, budgets, exact numerical validation and judgment logic are unchanged.

## Python and authorization blockers

The existing Python agent accepts a question but does not yet accept/enforce an
authorized user/campaign/date scope in its SQLTools layer. DO NOT enable the route
by appending filter instructions to a prompt. First implement and verify a scoped
server adapter/tool policy that constrains every query to the authorized data
without broadening or bypassing the existing SQL grammar/read-only role boundary.
The `/ask` filter selection currently provides UI context only; it executes nothing.

Choose a supported Python deployment/service boundary, authenticated service-to-
service requests, input/output protocol, deadlines, worker resource limits and
safe cancellation. Invoking a local Python subprocess inside a Vercel Next.js
function is not assumed to work or be secure. Keys and the restricted mart-reader
connection belong only in the Python service, not in client props, API responses,
or public environment variables. The published-insights dashboard reader is not
the AskAgent mart reader. Never reuse owner/writer credentials. No credential is
read from `.env.example`, and rotation of previously exposed credentials is not
assumed; administrator rotation/review remains separate work.

## Files and offline checks

- `app/ask/page.tsx`: shared filters, explicit disabled state, no data reads.
- `components/AskPanel.tsx`: draft form plus prepared answer/SQL/evidence renderer.
- `app/api/ask/route.ts`: server-only POST route wired to `null` integration.
- `lib/ask-api.ts`: injectable auth/authz/rate-limit/service gate and byte limits.
- `lib/ask-contract.ts`: public response projection and browser transport parsing.
- `tests/ask.test.ts`: mock API gate tests and in-memory TSX server-render tests.

```sh
cd dashboard
npm test
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
```

UI tests transpile TSX in memory using the already installed TypeScript package;
no build files or packages are created. Synthetic answers exist only in tests.
No real authentication, rate-limit backing store, Python process/service, Neon
connection or LLM API is exercised. Browser hydration and live end-to-end behavior
remain unverified. Production activation requires concrete reviewed adapters,
scope enforcement, isolated database/role and provider integration tests, agent
evals/judge calibration, retention/redaction policy and a secured API deployment.
