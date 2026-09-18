# Enterprise Data Onboarding & SCADA Ingestion Module — Implementation Plan

## Top-Level Overview

**Goal:** Add a self-contained "Data Onboarding & Connectors" module to the Grid Risk Command Center that lets operators (a) batch-upload grid asset manifests via CSV/JSON, (b) stream live SCADA telemetry packets, (c) trigger ML re-scoring after ingestion, and (d) ask the AI Copilot about ingestion status. A matching UI portal integrates into the existing Tailwind/dark-theme SPA.

**Scope:**
- 1 new backend router file: `src/backend/routers/ingest.py`
- 1 new Pydantic schema file: `src/backend/schemas/ingest.py`
- 1 new test file: `src/backend/tests/test_ingest.py`
- Modifications to: `src/backend/main.py`, `src/backend/services/copilot.py`, `src/frontend/index.html`, `src/frontend/js/api.js`, `src/frontend/js/app.js`, `src/frontend/js/pages.js`

**Confirmed Design Decisions:**
- `POST /api/ingest/assets` is split into **two separate endpoints**: `POST /api/ingest/assets/csv` (multipart file upload) and `POST /api/ingest/assets/json` (JSON array body). Cleaner FastAPI typing, no runtime content-type sniffing.
- `POST /api/ingest/re-score` runs **synchronously** — blocks until the full pipeline completes and returns the scored count. Rationale: SQLite at 220-asset scale completes in seconds; the frontend toast requires the result; no existing background-task pattern in the codebase (simulation endpoint is also synchronous).

**Approach:** Follow all existing conventions exactly — raw sqlite3 via `db.query/query_one`, Pydantic v2 models, FastAPI routers, vanilla-JS page renderers returning HTML strings, no new heavyweight dependencies. Use only `python-multipart` (already part of `uvicorn[standard]`'s optional installs and needed for file upload) and stdlib `csv`/`io`/`json`.

---

## Sub-Task 1 — Pydantic Schemas for Ingest Payloads

**Intent:** Define the validated data contracts for all three ingest endpoints in a single schema file. Centralising these makes the router thin and the test fixtures reusable.

**Expected Outcomes:**
- `src/backend/schemas/ingest.py` exists.
- `AssetRecord` model validates all 10 required fields with correct types and value-range constraints.
- `TelemetryPacket` model validates 11 telemetry fields; `timestamp` defaults to `datetime.utcnow()` if absent.
- `RescoreRequest` model allows an optional list of `asset_ids` to scope re-scoring (empty = rescore all).
- Import works cleanly: `from backend.schemas.ingest import AssetRecord, TelemetryPacket, RescoreRequest`.

**Todo List:**
- [ ] Create `src/backend/schemas/__init__.py` (empty).
- [ ] Create `src/backend/schemas/ingest.py` with Pydantic v2 `BaseModel` classes:
  - `AssetRecord`: `asset_id: str`, `asset_type: str`, `substation_id: str`, `geographic_area: str`, `latitude: float`, `longitude: float`, `customers_served: int (≥0)`, `criticality_score: float (0–10)`, `installation_year: int`, `rated_capacity: float (>0)`. All required.
  - `TelemetryPacket`: `timestamp: datetime (default utcnow)`, `asset_id: str`, `temperature: Optional[float]`, `vibration: Optional[float]`, `oil_temperature: Optional[float]`, `oil_quality: Optional[float]`, `partial_discharge: Optional[float]`, `voltage: Optional[float]`, `current: Optional[float]`, `load_percentage: Optional[float]`, `humidity: Optional[float]`.
  - `RescoreRequest`: `asset_ids: Optional[list[str]] = None`.
  - `IngestionStatusResponse` (for the Copilot tool): `last_telemetry_at: Optional[str]`, `total_telemetry_rows: int`, `onboarded_asset_count: int`, `last_rescore_at: Optional[str]`.

**Relevant Context:**
- Pydantic v2 already installed (`pydantic==2.12.5`).
- No existing `schemas/` package — must be created from scratch.
- `AssetRecord` field names must match `assets` table column names exactly (from `db.py` schema).
- Existing Pydantic models (e.g., `SimulationRequest`, `CopilotRequest`) defined inline in `main.py`; new schemas live in the dedicated package to keep `main.py` clean.

**Status:** [x] done

---

## Sub-Task 2 — Backend Ingest Router (`routers/ingest.py`)

**Intent:** Implement all three ingest endpoints plus the CSV template download as a self-contained FastAPI `APIRouter`. This keeps `main.py` clean and makes the module independently testable.

**Expected Outcomes:**
- `GET /api/ingest/template` returns a `text/csv` response with the correct header row and one example data row.
- `POST /api/ingest/assets` accepts either `multipart/form-data` with a CSV file or a JSON body (`application/json`) array of `AssetRecord` objects. Validates schema, upserts into `assets` table. Returns `{inserted, updated, errors: [{row, reason}]}`.
- `POST /api/ingest/telemetry` accepts a single `TelemetryPacket` JSON body. Inserts into `sensor_data`. Returns `{status: "ok", id: <row_id>}`.
- `POST /api/ingest/re-score` accepts `RescoreRequest`. Calls `build_frames()` → `score_all()` → `compute_impact()` → `compute_area_risk()`. Records timestamp in `meta` table under key `last_rescore_at`. Returns `{scored: N, areas_updated: M, as_of: <timestamp>}`.
- All four endpoints are mounted at `/api/ingest/...` in `main.py`.

**Todo List:**
- [ ] Create `src/backend/routers/__init__.py` (empty).
- [ ] Create `src/backend/routers/ingest.py`:
  - Import `APIRouter`, `UploadFile`, `File`, `HTTPException`, `Response` from FastAPI.
  - Import `db`, `config`, and `AssetRecord`, `TelemetryPacket`, `RescoreRequest` from schemas.
  - Import `build_frames` from `backend.ml.features`, `score_all` from `backend.ml.model`, `compute_impact`, `compute_area_risk` from `backend.services.impact`.
  - Implement `GET /template`: build CSV string with `csv.writer` over `io.StringIO` and return `Response(content=..., media_type="text/csv", headers={"Content-Disposition": "attachment; filename=asset_template.csv"})`.
  - Implement `POST /assets/csv`:
    - Accept `UploadFile` (`file: UploadFile = File(...)`).
    - Parse with `csv.DictReader` after decoding bytes.
    - Validate each row with `AssetRecord`. Collect validation errors with row index.
    - Upsert via `INSERT OR REPLACE INTO assets (...)` for valid rows.
    - Write to `audit_log` via `db.audit("ingest", "asset_upsert", {inserted, updated})`.
    - Return summary dict.
  - Implement `POST /assets/json`:
    - Accept `List[AssetRecord]` as JSON body directly (Pydantic handles array parsing).
    - Upsert via `INSERT OR REPLACE INTO assets (...)` for all valid rows.
    - Write to `audit_log`.
    - Return same summary dict shape as the CSV endpoint.
  - Implement `POST /telemetry`:
    - Accept `TelemetryPacket` JSON body.
    - Insert into `sensor_data` using parameterized `INSERT INTO`.
    - Return `{status: "ok", id: lastrowid}`.
  - Implement `POST /re-score`:
    - Accept `RescoreRequest`.
    - Call ML pipeline: `build_frames()` → `score_all(asset_ids=...)` → `compute_impact()` → `compute_area_risk()`.
    - Store `datetime.utcnow().isoformat()` in `meta` table key `last_rescore_at` using `db.set_meta`.
    - Return counts.
- [ ] In `src/backend/main.py`, add `from backend.routers.ingest import router as ingest_router` and `app.include_router(ingest_router, prefix="/api/ingest")`.

**Relevant Context:**
- `db.query()`, `db.query_one()`, `db.set_meta()`, `db.get_meta()`, `db.audit()` are the only DB access patterns used in the project.
- `INSERT OR REPLACE INTO assets` is the correct SQLite upsert pattern (preserves PK, replaces row). The `assets` table uses `asset_id` as the primary key — verify column list from `db.py`.
- `score_all()` currently scores ALL assets at "now". The `asset_ids` filter must be optionally forwarded or the full rescore can be performed since it's fast on SQLite.
- `build_frames()` in `features.py` reads from DB directly — it will naturally pick up newly upserted assets.
- `python-multipart` is needed for `UploadFile` — it ships as part of `uvicorn[standard]` optional extras and is already in the environment; confirm in requirements and add explicitly if absent.

**Status:** [x] done

---

## Sub-Task 3 — Copilot `get_ingestion_status` Tool

**Intent:** Allow the AI Copilot to answer questions about ingestion history by registering a new grounded tool. Follows the identical pattern used by the existing 10 tools in `copilot.py`.

**Expected Outcomes:**
- A `get_ingestion_status()` function exists in `copilot.py` that queries DB for: last telemetry row timestamp, total telemetry row count, count of assets with `current_status IS NOT NULL` (proxy for "onboarded"), and `last_rescore_at` from `meta`.
- The tool is listed in `TOOLS` (the OpenAI function-calling schema dict) with name `get_ingestion_status`, description, and empty `parameters` object.
- The grounded intent router in `_route_grounded()` dispatches to `get_ingestion_status()` when the query mentions "ingest", "telemetry", "onboard", "last update", or "when was".
- LLM-mode function dispatch table also maps `"get_ingestion_status"` to the function.

**Todo List:**
- [ ] In `src/backend/services/copilot.py`:
  - Add `get_ingestion_status()` function that runs:
    - `SELECT MAX(timestamp) as last_ts, COUNT(*) as total FROM sensor_data`
    - `SELECT COUNT(*) as cnt FROM assets`
    - `db.get_meta("last_rescore_at", None)`
  - Returns a dict: `{last_telemetry_at, total_telemetry_rows, onboarded_asset_count, last_rescore_at}`.
  - Add tool schema entry to `TOOLS` list.
  - Add intent pattern `r"ingest|telemetry|onboard|last.*(update|ingest)|when.*ingest"` to `_route_grounded()`.
  - Add `"get_ingestion_status": get_ingestion_status` to the LLM function dispatch table.

**Relevant Context:**
- `copilot.py` already has 10 tools following the exact pattern to replicate.
- `db.get_meta(key, default)` already exists for reading from `meta` table.
- `_route_grounded()` uses `re.search(pattern, query.lower())` for matching — follow the same style.
- The grounded path returns `{"tool": name, "result": data, "prose": template_string}`.

**Status:** [x] done

---

## Sub-Task 4 — Frontend: Data Onboarding Portal Page

**Intent:** Add an 8th navigation page ("Data Onboarding & Connectors") to the SPA that exposes: a drag-and-drop CSV upload dropzone, a "Download Template" button, a live SCADA telemetry packet stream visualizer, and an "Ingest & Re-score Grid" button with toast feedback. Follows existing page-renderer pattern exactly.

**Expected Outcomes:**
- A new nav entry `{ id: 'onboarding', label: 'Data Onboarding' }` appears in the sidebar.
- `pages.js` exports a `renderOnboarding()` async function that populates `#view`.
- The dropzone accepts `.csv` and `.json` file drops/clicks, shows filename + row-count preview on selection, and displays validation errors from `POST /api/ingest/assets` inline.
- "Download Sample CSV Template" button calls `GET /api/ingest/template` and triggers browser download.
- SCADA Packet Stream section shows a scrolling feed of animated telemetry packet cards (generated via `setInterval` in demo mode, or from real `POST /api/ingest/telemetry` responses). Each card shows `asset_id`, timestamp, a key metric (temperature), and a green "✓ ingested" badge.
- "Ingest & Re-score Grid" button calls `POST /api/ingest/re-score`, then shows a toast notification (reusing existing toast pattern) with scored count.
- `api.js` has three new methods: `ingestAssets(formData)`, `ingestTelemetry(packet)`, `rescoreGrid(body)`.

**Todo List:**
- [ ] In `src/frontend/js/api.js`:
  - Add `downloadTemplate()` — returns the raw response (for browser download trigger).
  - Add `ingestAssets(formData)` — `POST /api/ingest/assets` with `FormData` (no `Content-Type` header, let browser set it with boundary).
  - Add `ingestTelemetry(packet)` — `POST /api/ingest/telemetry` with JSON body.
  - Add `rescoreGrid(body={})` — `POST /api/ingest/re-score` with JSON body.
- [ ] In `src/frontend/js/app.js`:
  - Add `{ id: 'onboarding', label: 'Data Onboarding' }` to `NAV` array.
  - Add routing case `'onboarding'` in the page-switch handler that calls `renderOnboarding()`.
- [ ] In `src/frontend/js/pages.js`:
  - Add `async function renderOnboarding()`.
  - Build HTML using `C.panel()` / `C.kpi()` conventions for visual consistency (dark theme, MD3 tokens).
  - Implement dropzone: `dragover`/`drop`/`click` handlers, `FileReader` for CSV preview, badge for row count.
  - Implement template download: fetch blob → `URL.createObjectURL` → programmatic anchor click.
  - Implement SCADA stream visualizer: `setInterval` every 1.5 s generates synthetic packet from random asset IDs and displays a scrolling card list (max 8 cards in view, oldest removed).
  - Implement "Ingest & Re-score Grid" button with spinner state and toast on completion.
  - Wire up CSV upload form submission to `API.ingestAssets()` and display per-row error list.
- [ ] In `src/frontend/index.html`:
  - Confirm no structural changes required (nav is built dynamically from `NAV` array in `app.js`).
  - Add any necessary CSS class overrides for dropzone (`.dropzone`, `.packet-card`, `.packet-stream`) that are not covered by existing style.css tokens into a `<style>` block or `style.css`.

**Relevant Context:**
- `app.js` builds nav sidebar from `NAV` array at startup — adding one entry is sufficient to make it appear.
- `pages.js` currently exports 7 render functions; the 8th follows the identical async pattern.
- Existing toast / notification pattern: check if there's an existing `showToast()` or equivalent in `app.js`; if not, add a minimal one (div append + CSS fade timeout).
- `F.*` formatters and `C.*` component builders are available globally in `pages.js` scope.
- The `API` client object is globally available in `pages.js` scope.
- File upload uses `FormData` — the backend `UploadFile` parameter must match the form field name `file`.
- The SCADA stream is a frontend-only visual demo in the absence of a live SCADA feed; it calls `POST /api/ingest/telemetry` with synthetic data to actually persist packets, providing an end-to-end live demonstration.

**Status:** [x] done

---

## Sub-Task 5 — Automated Tests (`test_ingest.py`)

**Intent:** Provide full API-level test coverage for all four ingest endpoints and the Copilot tool, following the exact test style used in `test_core.py` and `test_operations.py`.

**Expected Outcomes:**
- `src/backend/tests/test_ingest.py` contains at minimum 10 test cases covering happy-path and error scenarios.
- All tests pass with `pytest src/backend/tests/test_ingest.py` after the full data seed has run.
- No new test fixtures or conftest.py needed (existing DB state is sufficient, as in the existing tests).

**Todo List:**
- [ ] Create `src/backend/tests/test_ingest.py` with the following test cases:
  1. `test_template_download` — GET `/api/ingest/template` returns 200, `Content-Type: text/csv`, body contains header row with all 10 column names.
  2. `test_asset_ingest_json` — POST valid JSON array of 2 new `AssetRecord` dicts → `{inserted: 2, updated: 0, errors: []}`.
  3. `test_asset_ingest_csv` — POST a well-formed CSV via `POST /assets/csv` with `multipart/form-data` → successful upsert.
  4. `test_asset_ingest_upsert` — POST JSON via `POST /assets/json` for an `asset_id` that already exists → `updated: 1` not `inserted`.
  5. `test_asset_ingest_validation_error` — POST JSON via `POST /assets/json` with a row missing `asset_id` → row appears in `errors`, rest succeed.
  6. `test_asset_ingest_bad_type` — POST JSON via `POST /assets/json` with `criticality_score: "bad"` → validation error for that row.
  7. `test_telemetry_ingest` — POST valid `TelemetryPacket` JSON → `{status: "ok"}`, row exists in `sensor_data`.
  8. `test_telemetry_missing_asset` — POST telemetry for unknown `asset_id` (no FK enforcement, row is accepted — verify DB stores it).
  9. `test_rescore_endpoint` — POST `/api/ingest/re-score` → response has `scored > 0`, `areas_updated > 0`, and `last_rescore_at` is stored in `meta` table.
  10. `test_copilot_ingestion_status` — Call `get_ingestion_status()` directly (or via `/api/copilot/query` with "When was telemetry last ingested?") → response contains `total_telemetry_rows > 0`.
  11. `test_copilot_onboard_routing` — Query "How many assets were onboarded?" routes to `get_ingestion_status` tool in grounded mode.
  12. `test_template_columns_complete` — Verify template CSV header includes all 10 fields from `AssetRecord` definition.

**Relevant Context:**
- Existing tests use `httpx.Client` with `transport=httpx.ASGITransport(app=app)` or direct function calls — confirm exact pattern in `test_core.py` and replicate.
- DB is assumed to be already seeded (tests run after seed pipeline); new test assets use unique IDs like `TEST-9001`, `TEST-9002` to avoid collisions.
- `test_rescore_endpoint` is the most expensive test (re-runs ML pipeline); place it last or mark with a note.
- For CSV upload test, use `io.BytesIO` to simulate an uploaded file without disk I/O.

**Status:** [x] done

---

## API Endpoint Contracts

### `GET /api/ingest/template`
- **Request:** None
- **Response:** `200 text/csv`, `Content-Disposition: attachment; filename=asset_template.csv`
- **Body (example):**
  ```
  asset_id,asset_type,substation_id,geographic_area,latitude,longitude,customers_served,criticality_score,installation_year,rated_capacity
  EXAMPLE-001,Transformer,SUB-A,NORTH-04,51.5,-0.1,450,7.5,2005,100.0
  ```

### `POST /api/ingest/assets`
- **Request:** `multipart/form-data` with field `file` (`.csv`) OR `application/json` with array of asset objects
- **Response `200`:**
  ```json
  {
    "inserted": 5,
    "updated": 2,
    "errors": [
      { "row": 3, "reason": "criticality_score must be between 0 and 10" }
    ]
  }
  ```
- **Response `422`:** Pydantic validation failure (body-level, not row-level)

### `POST /api/ingest/telemetry`
- **Request:** `application/json`
  ```json
  {
    "asset_id": "T-1024",
    "timestamp": "2025-07-14T10:00:00Z",
    "temperature": 82.3,
    "vibration": 3.1,
    "load_percentage": 91.0
  }
  ```
- **Response `200`:** `{ "status": "ok", "id": 45231 }`

### `POST /api/ingest/re-score`
- **Request:** `application/json` `{ "asset_ids": ["T-1024", "T-0055"] }` OR `{}` for all
- **Response `200`:**
  ```json
  {
    "scored": 220,
    "areas_updated": 6,
    "as_of": "2025-07-14T10:05:33.124Z"
  }
  ```

---

## Verification Plan

Run all existing + new tests together:

```bash
cd src && python -m pytest backend/tests/ -v
```

Expected: All existing 27 tests (14 core + 13 ops) continue to pass. All 12 new ingest tests pass.

Manual smoke-test checklist after starting the server:
1. Open the UI → confirm "Data Onboarding" appears in the sidebar.
2. Navigate to the page → dropzone renders, stream visualizer animates.
3. Download template → CSV opens correctly in spreadsheet.
4. Upload the downloaded template CSV back → toast shows "2 rows ingested".
5. Ask Copilot "When was telemetry last ingested?" → answer cites `get_ingestion_status` tool evidence.

---

## Files to Create / Modify Summary

| File | Action | Sub-Task |
|------|--------|----------|
| `src/backend/schemas/__init__.py` | Create (empty) | 1 |
| `src/backend/schemas/ingest.py` | Create | 1 |
| `src/backend/routers/__init__.py` | Create (empty) | 2 |
| `src/backend/routers/ingest.py` | Create | 2 |
| `src/backend/main.py` | Modify — add router include | 2 |
| `src/backend/services/copilot.py` | Modify — add tool + routing | 3 |
| `src/frontend/js/api.js` | Modify — add 4 API methods | 4 |
| `src/frontend/js/app.js` | Modify — add nav entry + route | 4 |
| `src/frontend/js/pages.js` | Modify — add renderOnboarding() | 4 |
| `src/frontend/index.html` | Modify — CSS for dropzone/stream | 4 |
| `src/backend/tests/test_ingest.py` | Create | 5 |

**Total: 5 new files, 6 modified files.**
