# 🚀 Power Outage Prediction & Grid Equipment Failure Advisor

---

## 👥 Team

| Field | Value |
|---|---|
| **Team Name** | nirman |
| **Track** | AI / Sustainability |
| **Team Lead** | Kathan modh — 23cs046@charusat.edu.in |
| **Members** | Aaleya boxwala, FarhaanAli Vohra, Shrey lakhataria |

---

## 🎯 Problem Statement

Power transformer and substation failures cause blackouts costing utilities $1M+/hour and affecting millions of people. Most utilities still use calendar-based maintenance, while sensors already measuring temperature, vibration, partial discharge, and oil quality show failure signatures weeks in advance. Weather events compound the risk - but sensor data and weather forecasts are never combined in time to act.

---

## 💡 Solution

**Grid Risk Command Center** — an operator-facing decision-support platform that turns
raw asset-health, weather and incident data into grounded operational decisions: what
will fail, where, when, why, what happens if it does, and what to do now. It delivers
the full chain **PREDICT → EXPLAIN → PRIORITISE → SIMULATE → OPTIMISE → ACT**, and every
number shown — in the dashboard or from the AI copilot — is grounded in a real model
output or database row. All data is clearly labelled **SIMULATION DATA**. See
[`docs/solution-overview.md`](docs/solution-overview.md) for the full write-up.

---

## ✨ Key Features

- **Failure prediction** — LightGBM (28 engineered features) + IsolationForest anomaly
  scoring, **ROC-AUC ≈0.97** on a held-out, time-aware split (the live figure is shown
  in the app header and the Metrics drawer, straight from `/api/model/metrics`).
- **Explainability** — per-asset SHAP attributions surfaced as human-readable drivers
  (e.g. *"partial-discharge rise (72h): +65 pC"*); the copilot can only relay these.
- **Grid Impact Score** — an interpretable 0–100 blend of failure probability,
  criticality, customers served, network exposure and weather risk that drives the
  maintenance queue (raw probability alone is a poor ranking signal).
- **What-if simulation** — simulate an asset failure or a severe-weather event and see
  customers affected, downstream assets, nearest crew and estimated outage duration.
- **Grounded AI copilot on IBM Bob** — a floating copilot on every page answers
  operator questions using only real backend tool results, and cites the exact tool
  calls behind each answer. It runs **IBM Bob** in headless mode (`bob run --mode ask`)
  when `BOB_API_KEY` is set, then IBM **watsonx.ai** `/ml/v1/text/chat` function-calling,
  then any OpenAI-compatible provider, and finally a deterministic grounded router — so
  it works with no API key at all. It can never reach a tool that writes.
- **MCP tool layer** — the AI's action surface is an explicit allowlist with per-tool,
  per-role authorization checked server-side, schema-validated arguments, and a
  single-use human confirmation token for anything that mutates. Every call is audited,
  including the refusals. See [`docs/security.md`](docs/security.md).
- **Authentication & RBAC** — split access/refresh tokens in HttpOnly cookies with CSRF
  double-submit, PBKDF2 password hashing and three roles (admin / operator / crew)
  derived server-side from the signed token. Every one of the 40+ API routes is guarded.
- **IBM Carbon throughout** — the UI Shell, buttons, tables, tiles, tags, inputs,
  selects, search, modals, notifications, skeletons and icons are all `@carbon/react`,
  running on a custom Carbon theme so the components arrive in this console's
  control-room palette instead of IBM blue. See [`docs/design-system.md`](docs/design-system.md).
- **CSV data onboarding** — bring your own crew and asset records. Every file is
  validated as a dry run first: you see exactly which rows are rejected, with line
  number, field and value, before anything is written.
- **Closed resolution loop** — completing a work order writes maintenance history,
  stamps the asset, releases the crew and re-derives risk through the real scoring
  pipeline, so the map and the queue actually change.
- **Closed-loop operator actions** — dispatch a crew, schedule or defer a job,
  pre-position crews, acknowledge alerts and export CSVs. Each one writes a real work
  order, changes crew availability and is recorded in an audit log — nothing in the UI
  is a decorative button.

---

## 🛠️ Tech Stack

| Category | Technologies |
|---|---|
| **Languages** | Python, JavaScript, SQL |
| **Frameworks** | FastAPI, Pydantic, Uvicorn |
| **IBM Technologies** | **IBM Bob** (headless CLI, `bob run --mode ask`) · **IBM watsonx.ai** `/ml/v1/text/chat` tool-calling API (default model `ibm/granite-3-8b-instruct`), authenticated via IBM Cloud IAM · IBM Plex type |
| **AI / LLM copilot** | IBM Bob first, then watsonx.ai, then Nebius / OpenAI / Azure OpenAI as alternates; grounded local tool-router when no key is set |
| **Databases** | SQLite (documented one-line swap to PostgreSQL, see [`docs/architecture.md`](docs/architecture.md)) |
| **Frontend & UI** | Next.js 16 (App Router) · React 19 · TypeScript · **IBM Carbon Design System** (`@carbon/react` components on a custom Carbon theme, `@carbon/icons-react`, IBM Plex) · Tailwind v4 for layout · TanStack Query · Leaflet (map) · Chart.js (sensor trends) |
| **Security** | Split access/refresh tokens, PBKDF2-HMAC-SHA256, HttpOnly cookies, CSRF double-submit, role-based route guards, slowapi rate limiting |
| **AI / ML** | Pandas, NumPy, Scikit-learn, LightGBM, IsolationForest, SHAP |
| **Ops** | Docker, docker-compose |

---

## 📁 Repository Structure

```
├── src/                  # All source code (see src/README.md for the full layout)
│   ├── backend/          # FastAPI app, ML pipeline, decision-engine services
│   ├── frontend-next/    # Next.js operator console — dashboard, map, copilot UI
│   └── scripts/seed.py   # generate data → train models → seed DB
├── docs/                 # Written documentation
│   ├── problem-statement.md
│   ├── solution-overview.md
│   ├── architecture.md
│   ├── security.md       # auth, RBAC, MCP tools, CSV format, risk recalc
│   ├── design-system.md  # IBM Carbon: what it owns, the theme, the build step
│   └── setup-guide.md
├── demo/                 # Demo artifacts
│   ├── screenshots/      # App screenshots
│   └── demo-video-link.txt  # Link to demo video
├── presentation/         # Slide deck
└── submission.yaml       # Structured submission metadata
```

---

## ⚡ How to Run

> Full details in [`docs/setup-guide.md`](docs/setup-guide.md)

```bash
# 1. Clone the repo
git clone https://github.com/shreylakhtaria/bob-ai-hackathon-Nirmaan.git
cd bob-ai-hackathon-Nirmaan/src

# 2. Install dependencies
pip install -r requirements.txt
(cd frontend-next && npm install)

# 3. Generate synthetic data + train the ML models (~60s first run)
python -m scripts.seed

# 4. Run the API (terminal 1)
uvicorn backend.main:app --reload --port 8000

# 5. Run the operator console (terminal 2)
cd frontend-next && npm run dev
# → open http://localhost:3000
```

Create an account at `/signup`. The first account is an **operator**; to get **admin**,
set `ADMIN_EMAILS=you@example.com` before signing up. Roles are never taken from the
request body.

| Environment variable | Default | What it does |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` enables secure cookies and hides error detail |
| `AUTH_SECRET_KEY` | dev value | Token signing key. **Required** in production — the app refuses to start on the default |
| `ADMIN_EMAILS` | *(empty)* | Comma-separated emails that get the `admin` role at signup |
| `FRONTEND_URL` | `http://localhost:3000` | Sole allowed CORS origin (credentials are sent, so no wildcard) |
| `BOB_API_KEY` | *(empty)* | Enables the IBM Bob copilot path (needs the `bob` CLI on PATH) |
| `WATSONX_API_KEY` / `WATSONX_PROJECT_ID` | *(empty)* | Enables the watsonx.ai copilot path |
| `RATE_LIMIT_ENABLED` | `true` | Rate limiting on the credential endpoints |
| `API_PROXY_TARGET` | `http://127.0.0.1:8000` | Where the Next.js dev/prod server proxies `/api/*` |

Or one command: `./run.sh --install`  ·  Or Docker: `docker compose up --build`

---

## 🖥️ Demo

| Artifact | Link |
|---|---|
| 📹 Demo Video | [See demo/demo-video-link.txt](demo/demo-video-link.txt) |
| 🌐 Live Demo | [See demo/live-demo-url.txt](demo/live-demo-url.txt) |
| 🖼️ Screenshots | [See demo/screenshots/](demo/screenshots/) |
| 📊 Presentation | [See presentation/slides.pdf](presentation/) |

---

## ⚠️ Known Limitations

- All data is clearly-labelled **SIMULATION DATA** — there is no live SCADA/IoT feed
  integration. Sensor telemetry is generated from a latent asset-health model, not read
  from real equipment.
- The watsonx.ai copilot path needs your own `WATSONX_API_KEY` + `WATSONX_PROJECT_ID`.
  Without them the copilot runs its grounded local tool-router, which answers from the
  same tools but composes text from templates rather than a language model.
- SQLite is used as the data layer for demo reliability (zero infra); a documented,
  mechanical swap to PostgreSQL is described in [`docs/architecture.md`](docs/architecture.md)
  but not exercised here.
- The crew pre-positioning optimiser is a greedy heuristic, not a full OR-Tools LP solve.
- Work orders model dispatch/scheduling state but there is no downstream CMMS
  (Maximo/SAP PM) integration — exports are CSV.
- The data layer is raw parameterised `sqlite3` throughout (~134 statements), not an
  ORM. Every query is parameterised and schema changes go through `db.SCHEMA`, but
  there is no migration tool.
- Backend has 108 tests; the frontend has none. Type safety is enforced by `tsc`, and
  the flows were verified manually end to end, but there is no automated UI test.
- Risk recalculation re-scores the whole asset population (~7s) because Grid Impact
  normalises customer and network exposure across all assets. It runs after the write
  transaction commits, so it never holds the database lock.

---

## 🏅 What We're Most Proud Of

The **Grid Impact Score** — the difference between a model that ranks assets by raw
failure probability and a system operators can actually trust to prioritise correctly.
Our seeded demo hero (**T-1024**) ranks only ~#13 by raw probability but **#1** on the
maintenance queue once customer count, network exposure and weather risk are factored
in — exactly the failure mode this project exists to fix. We're also proud that the
synthetic data isn't random noise: asset health is a latent variable driving every
sensor reading and failure label, which is what lets SHAP produce genuinely meaningful,
non-fabricated explanations instead of noise attribution.
