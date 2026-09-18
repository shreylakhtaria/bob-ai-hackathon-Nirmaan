# Security, roles and the AI action surface

This document covers the parts of the system where getting it wrong is expensive:
who you are, what you are allowed to do, what the AI is allowed to do on your
behalf, and what happens to data you upload.

---

## 1. Authentication

Two tokens, different jobs, different lifetimes.

| | Access token | Refresh token |
|---|---|---|
| Lifetime | 15 minutes | 14 days |
| Carries | user id, email, display name, role | an opaque id |
| Stored by browser | in memory only (never `localStorage`) | HttpOnly cookie, path-scoped to `/api/auth` |
| Stored by server | nothing | SHA-256 hash in `refresh_tokens` |

Both are signed HMAC-SHA256 over a canonical JSON payload. The signature covers a
`typ` field (`access` / `refresh`), so a refresh token cannot be replayed as an
access token even though both are signed with the same key.

**Why hand-rolled instead of PyJWT.** The token format is ~40 lines of `hmac` and
`base64` from the standard library, with no algorithm negotiation — there is no
`alg` header to confuse, so the `alg: none` and `HS256`-vs-`RS256` confusion
classes simply do not exist here. It is also one less dependency to audit.

**Passwords** are PBKDF2-HMAC-SHA256, 260,000 iterations, per-user 16-byte salt,
compared with `hmac.compare_digest`. A login for an unknown email still runs a
dummy hash, so response timing does not reveal which accounts exist.

**Rotation and revocation.** Every `/api/auth/refresh` revokes the presented
refresh token and issues a new one. Because the server stores a hash of each live
token, `/api/auth/logout` kills one session and `/api/auth/logout-all` kills every
session for that user — a plain stateless JWT cannot do either.

**CSRF.** Cookies are `SameSite=Lax` and the cookie-bearing endpoints
(`/api/auth/refresh`, `/api/auth/logout*`) additionally require a double-submit:
an `X-CSRF-Token` header matching a non-HttpOnly `csrf_token` cookie. In
production (`ENVIRONMENT=production`) cookies are also `Secure`.

**Rate limiting.** `slowapi` caps the credential endpoints (login, signup,
refresh). Disable for tests with `RATE_LIMIT_ENABLED=false`.

**Secrets.** `AUTH_SECRET_KEY` has a development default; the app raises at import
in production if it has not been changed. No secret is hardcoded in source.

---

## 2. Roles

Three roles, no more. Adding a fourth should require a reason.

| Role | Can see | Can do |
|---|---|---|
| `crew` | assets, risk, areas, maintenance queue, own work orders | complete a work order assigned to them |
| `operator` | everything except the security audit trail | dispatch, reposition, schedule, defer, simulate, import CSV, recalculate risk |
| `admin` | everything including security audit entries | everything, plus user and audit administration |

The role comes from the **signed access token**, which the server issued. It is
never read from a request body, a header, or anything the frontend sends. At
signup the role is decided by whether the email is in `ADMIN_EMAILS`; a `role`
field in the signup body is ignored.

Enforcement is `backend/deps.py`:

```python
@app.post("/api/dispatch")
def dispatch(..., user=Depends(require_operator)):
```

Every route carries one of `require_any_role`, `require_operator` or
`require_admin`. A test sweeps the router and fails if any route is left
unguarded, so a new endpoint cannot ship anonymous by accident.

`RequireAuth` on the frontend is a **UX control, not a security boundary** — it
redirects a signed-out visitor to `/login` so they do not stare at an empty
dashboard. Deleting it would expose no data; the API is the boundary.

---

## 3. The MCP tool layer

The AI can take actions. These are the rules, in order of how badly they fail
when broken.

**Allowlist, not reflection.** `backend/services/mcp.py` holds an explicit
registry. A tool name that is not in it is refused with 404 and is *never*
resolved some other way — no `getattr`, no `eval`, no import by name. The model
never emits SQL, a shell command, a file path or a URL that gets executed.

**Authorization is per tool, per caller, server-side.** Each tool declares the
roles that may run it. `GET /api/mcp/tools` only lists what the caller may use,
and `POST /api/mcp/call` re-checks the role before executing — being shown a tool
is cosmetic, being refused it is the control.

**Arguments are schema-validated at the boundary.** Undeclared arguments are
rejected (422) rather than passed through, types are checked, integers are
clamped to a maximum of 50, and enum values are enforced. A malformed argument
never reaches business logic.

**Mutating tools never fire on inference alone.**

```
POST /api/mcp/call  {tool: "assign_crew", ...}        → 428 confirmation required
POST /api/mcp/confirm {tool: "assign_crew", ...}      → {confirmation_token, summary}
POST /api/mcp/call  {..., confirmation_token}         → executes, token consumed
```

The token is single-use, expires after 5 minutes, and is bound to the exact tool,
the exact validated arguments and the requesting user id. A confirmation issued
for one dispatch cannot authorise a different one, and cannot be used by a
different account.

**Everything is audited** — caller, role, tool, arguments, authorization outcome
and result — including the calls that were refused, because a blocked attempt is
the entry you most want to find later.

### Tools

| Tool | Roles | Writes |
|---|---|---|
| `get_asset_status` | all | no |
| `get_risk_summary` | all | no |
| `get_area_risk` | all | no |
| `get_crew_availability` | all | no |
| `get_maintenance_queue` | all | no |
| `get_maintenance_history` | all | no |
| `simulate_asset_failure` | all | no |
| `simulate_weather_event` | all | no |
| `assign_crew` | admin, operator | **yes — confirmation required** |
| `mark_asset_resolved` | all | **yes — confirmation required** |

### The copilot is deliberately weaker

The chat copilot picks its own tools from the model's output with no confirmation
step, so it is restricted to the read-only set. `copilot._run_tool()` refuses
anything outside that allowlist and audits every call. A test asserts the
copilot's allowlist and the set of writing MCP tools never intersect, so adding a
mutating tool cannot silently open a second, unconfirmed route.

---

## 4. CSV onboarding

`POST /api/ingest/{crews|assets}/validate` is a dry run; `/commit` writes. Both
return the same report, so the UI shows exactly what will happen before it
happens.

| | `crews` | `assets` |
|---|---|---|
| Required | `crew_id`, `latitude`, `longitude` | `asset_id`, `asset_type`, `substation_id`, `geographic_area` |
| Optional | `current_area`, `skill_type`, `availability`, `equipment_capability`, `base_response_min`, `active_assignment` | `latitude`, `longitude`, `installation_year`, `manufacturer`, `rated_capacity`, `criticality_score`, `customers_served`, `downstream_assets`, `last_maintenance_date`, `current_status` |

Columns match `db.SCHEMA` exactly and `required` mirrors the PRIMARY KEY / NOT
NULL constraints, so a file that passes validation is a file the database will
accept. Crew coordinates are the one deliberate addition: the column is nullable
in the schema, but every dispatch and pre-positioning decision ranks crews by
travel time from their position, so a crew imported without one can be created
and never sensibly assigned. It is rejected at import, where the operator can
still fix the file. (`crew._travel_min` also treats a missing coordinate as an
unknown, sorting-last travel time rather than raising, so no other path into the
database can take dispatch down.)

Rules:

* **Nothing is silently dropped.** Every rejected row appears in `errors` with its
  1-based line number, the offending field and the value that was seen. Unknown
  columns are reported as warnings, not accepted.
* **Partial import is deliberate** — a handful of bad rows should not cost the
  operator the other 900 good ones. The inserts still share one transaction, so a
  mid-batch database failure rolls the whole batch back.
* **Uploads are untrusted.** Size-capped at 5 MB, row-capped at 10,000, decoded
  strictly, and every stored text cell is neutralised against CSV formula
  injection (`=`, `+`, `-`, `@`, tab, CR) because these rows come back out
  through `/api/export/*` and land in someone's spreadsheet.
* Numeric columns are range-checked (latitude −90…90, installation year
  1900…2100, and so on) and enums are case-normalised.

---

## 5. Risk recalculation

Completing a work order does four writes in **one transaction**: close the work
order, insert the maintenance record, stamp `assets.last_maintenance_date`, and
release the crew — but only if that crew has no other open work order. Half
applying these is the failure that matters: a closed work order with a crew still
marked `ON_JOB` takes that crew out of service until someone notices.

Recalculation then runs **after the commit**:

```
model.score_all()  →  impact.compute_impact()  →  impact.compute_area_risk()
```

It re-scores the whole asset population, which takes roughly 7 seconds. That is
not laziness: Grid Impact min-max normalises `customers_served` and network
exposure **across all assets**, so recomputing one asset in isolation would
produce a number on a different scale from every other row. A test asserts that
recalculating with unchanged inputs reproduces the same scores, which is the
guard against someone "simplifying" this into a per-asset approximation.

It runs outside the transaction on purpose: it rewrites every row in
`predictions`, and holding SQLite's write lock for seconds would block every
other operator action.

---

## 6. Errors

Every failure returns the same envelope, so the frontend has one thing to parse:

```json
{"success": false, "error": {"code": "...", "message": "...", "details": {...}}}
```

Validation failures carry field-level detail but **never echo the submitted
value**. In production, unhandled exceptions log a full traceback server-side and
return a generic message — stack traces are not part of the API.

---

## 7. What is not done

* No ORM. Every statement is parameterised raw `sqlite3` and schema changes go
  through `db.SCHEMA`, but there is no migration tool.
* No automated frontend tests. `tsc` passes with no errors and the flows were
  verified manually end to end.
* WCAG conformance is **not claimed**. Contrast ratios in the token system are
  measured and stated, keyboard focus is visible and trapped correctly in the
  copilot, and `aria-live` is used for streamed answers — but no audit with an
  assistive technology has been run, so no level is asserted.
