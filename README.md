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
- **Grounded AI copilot on IBM watsonx.ai** — answers operator questions using only
  real backend tool results and cites the exact tool calls behind each answer. It runs
  true function-calling against watsonx.ai's `/ml/v1/text/chat` API when credentials are
  present, and falls back to a deterministic grounded router otherwise — so it works
  with no API key at all.
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
| **IBM Technologies** | **IBM watsonx.ai** — `/ml/v1/text/chat` tool-calling API (default model `ibm/granite-3-8b-instruct`), authenticated via IBM Cloud IAM |
| **AI / LLM copilot** | watsonx.ai first, then Nebius / OpenAI / Azure OpenAI as alternates; grounded local tool-router when no key is set |
| **Databases** | SQLite (documented one-line swap to PostgreSQL, see [`docs/architecture.md`](docs/architecture.md)) |
| **Frontend & UI** | Build-free static SPA — HTML/JS, Tailwind CSS (CDN), Leaflet (map), Chart.js (sensor trends) |
| **AI / ML** | Pandas, NumPy, Scikit-learn, LightGBM, IsolationForest, SHAP |
| **Ops** | Docker, docker-compose |

---

## 📁 Repository Structure

```
├── src/                  # All source code (see src/README.md for the full layout)
│   ├── backend/          # FastAPI app, ML pipeline, decision-engine services
│   ├── frontend/         # Static SPA — dashboard, map, copilot UI
│   └── scripts/seed.py   # generate data → train models → seed DB
├── docs/                 # Written documentation
│   ├── problem-statement.md
│   ├── solution-overview.md
│   ├── architecture.md
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

# 3. Generate synthetic data + train the ML models (~60s first run)
python -m scripts.seed

# 4. Run the project
uvicorn backend.main:app --reload --port 8000
# → open http://localhost:8000
```

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
