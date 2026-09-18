# Setup Guide

> **This file is read by the automated evaluation pipeline. Be precise and complete.**

## Prerequisites

- [x] Python 3.12 (also runs on 3.11+)
- [x] `pip`
- [ ] Docker Desktop — only needed if you want to run via `docker compose` instead of locally
- [ ] An OpenAI (or Azure OpenAI) API key — **optional**, only needed to enable true LLM
      function-calling in the copilot. Without it, the copilot runs a fully grounded
      local tool-router with no external dependency.

## Environment Variables

Copy `src/.env.example` to `src/.env` and adjust if needed — **every value has a safe
default, nothing is required to run the app**:

```bash
cd src
cp .env.example .env
```

| Variable | Description | Required |
|---|---|---|
| `SEED` | RNG seed for synthetic data generation (deterministic) | No (default `42`) |
| `N_ASSETS` | Number of synthetic grid assets to generate | No (default `220`) |
| `HISTORY_DAYS` | Days of hourly sensor history to simulate | No (default `21`) |
| `PREDICTION_HORIZON_HOURS` | Failure-prediction horizon | No (default `72`) |
| `HERO_TARGET_DEG` | Severity knob for the demo "hero" asset (T-1024) | No (default `0.60`) |
| `DB_PATH` / `DATABASE_URL` | Override the SQLite file location, or point at Postgres | No (default: local SQLite file) |
| `CREW_SPEED_KMPH` | Assumed field-crew travel speed for the optimiser | No (default `45`) |
| `WATSONX_API_KEY` + `WATSONX_PROJECT_ID` | **Recommended — enables the IBM watsonx.ai copilot.** IBM Cloud IAM API key and watsonx.ai project id. Checked before all other providers | No — grounded local mode is used if unset |
| `WATSONX_URL` | watsonx.ai regional endpoint | No (default `https://us-south.ml.cloud.ibm.com`) |
| `WATSONX_MODEL_ID` | Any tool-calling watsonx chat model | No (default `ibm/granite-3-8b-instruct`) |
| `NEBIUS_API_KEY` / `NEBIUS_BASE_URL` / `NEBIUS_MODEL` | Alternative: Nebius Token Factory (OpenAI-SDK-compatible) | No |
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` | Alternative: plain OpenAI | No |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_KEY` / `AZURE_OPENAI_DEPLOYMENT` | Alternative: Azure OpenAI | No |

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/shreylakhtaria/bob-ai-hackathon-Nirmaan.git
cd bob-ai-hackathon-Nirmaan

# 2. Install backend dependencies
cd src
pip install -r requirements.txt
```

There is no separate frontend install step — the frontend is a static SPA
(HTML/CSS/JS) served directly by the FastAPI backend, so there is no
`npm install` / build step to run or fail.

## Running the Application

```bash
# From src/

# 1. Generate synthetic data + train the ML models (deterministic, ~60s first run)
python -m scripts.seed

# 2. Start the API (terminal 1)
uvicorn backend.main:app --reload --port 8000

# 3. Start the operator console (terminal 2)
cd frontend-next
npm install        # first run only
npm run dev
```

The operator console will be available at: `http://localhost:3000`
Interactive API docs (Swagger) are at: `http://localhost:8000/docs`

The console proxies `/api/*` to the API on port 8000, so the browser only ever
talks to port 3000. Override with `API_PROXY_TARGET` if the API is elsewhere.

**One-shot alternative:**
```bash
cd src
./run.sh --install
```

**Docker alternative** (seeds data + trains models at build time, so the
image is demo-ready on first `up`):
```bash
cd src
docker compose up --build
```

**Optional: enable the IBM watsonx.ai copilot**
```bash
export WATSONX_API_KEY=...      # IBM Cloud IAM API key
export WATSONX_PROJECT_ID=...   # watsonx.ai project id
# then run uvicorn as above
```
Without these, the copilot still fully answers operator questions — it just
uses a deterministic grounded tool-router instead of a language model. If the
credentials are wrong or watsonx is unreachable, the app automatically falls
back to that router rather than failing the request.

## Running Tests

```bash
cd src
pytest backend/tests/ -v
```

## Quick Demo (Optional)

Once the server is running:

```bash
open http://localhost:3000
```

1. **Overview** page shows overall grid risk, critical assets, customers at
   risk, live map and active alerts.
2. Click the pulsing red marker on the map → asset **T-1024** (the seeded
   demo "hero" asset, in a storm-exposed area).
3. Open **Asset Detail** for T-1024 → sensor trend charts and a
   plain-language "why is this asset high risk?" explanation.
4. Open **Maintenance** → T-1024 ranks **#1** by Grid Impact Score, even
   though it isn't the single highest raw failure probability.
5. Open **AI Copilot** and ask: *"Why is T-1024 critical?"*, *"What happens
   if T-1024 fails?"*, or *"Summarize today's grid risks"* — every answer
   cites the exact tool calls and data it used.

## Troubleshooting

| Issue | Solution |
|---|---|
| `Database not seeded` (HTTP 503) | Run `python -m scripts.seed` from `src/` before starting the server |
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` again from `src/` |
| `ImportError` / LightGBM fails to load on Linux | Install `libgomp1` (`apt-get install libgomp1`) — already handled automatically in the provided `Dockerfile` |
| Port 8000 already in use | Run `uvicorn backend.main:app --port 8001` and start the console with `API_PROXY_TARGET=http://127.0.0.1:8001 npm run dev` |
| Copilot always answers in grounded/local mode even with a key set | Confirm `OPENAI_API_KEY` (or the `AZURE_OPENAI_*` trio) is exported in the same shell/process running `uvicorn` |
