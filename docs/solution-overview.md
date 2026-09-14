# Solution Overview

## What We Built

**Grid Risk Command Center** is an operator-facing decision-support platform
that turns raw asset-health, weather and incident data into grounded
operational decisions: *what will fail, where, when, why, what happens if it
does, and what the operator should do now.*

It is explicitly **not a chatbot**. Every number the UI or the AI copilot
shows is grounded in a real model output or a real database row — nothing is
invented. All data is clearly labelled **SIMULATION DATA** throughout the
product, since this is a hackathon build without access to live SCADA feeds.

The system delivers the full decision chain:

**PREDICT → EXPLAIN → PRIORITISE → SIMULATE → OPTIMISE → ACT**

## How It Works

1. **Generate a realistic grid.** 220 synthetic assets (transformers, circuit
   breakers, substations, switchgear, feeders) are created with a *latent
   health* value that decays with age, chronic overloading, poor maintenance
   recency and acute weather stress. Hourly sensor telemetry (temperature,
   vibration, oil quality, partial discharge, load) is driven by that latent
   health, and failures follow a smooth probabilistic hazard curve rather
   than random noise — so the resulting labels are learnable and calibrated,
   not saturated.
2. **Predict.** A LightGBM classifier (28 engineered features: 24h/72h
   rolling stats and slopes, oil-quality degradation, asset age, maintenance
   recency, historical failures, 24h weather forecast) scores every asset's
   failure probability. An IsolationForest adds an anomaly score on top.
3. **Explain.** Per-asset SHAP (TreeExplainer) attributions are converted
   into human-readable drivers (e.g. *"partial-discharge rise (72h): +65
   pC"*). The AI copilot can only relay these — it can never invent a reason.
4. **Prioritise.** Failure probability alone is a poor ranking signal — a
   20%-probability asset serving 100k customers can matter more than a 60%
   asset serving 1k. The **Grid Impact Score** (0–100) blends failure
   probability, asset criticality, customers served, downstream network
   exposure and current weather risk into one interpretable ranking that
   drives the maintenance queue.
5. **Simulate.** An operator can run "what happens if asset X fails right
   now" or "what happens if a severe storm hits area Y" and see customers
   affected, downstream assets, nearest available crew, and estimated
   outage duration — before either event actually happens.
6. **Optimise.** A greedy crew pre-positioning optimiser recommends which
   field crews should reposition toward high-risk areas, and by how much
   that would cut response time.
7. **Act.** Everything above surfaces as a ranked maintenance queue, an
   auto-generated operations briefing, intelligent alerts, and a
   grounded AI copilot that answers operator questions ("Why is T-1024
   critical?", "What happens if it fails?") by calling the same backend
   tools and citing exactly which tool calls and data it used.

## Architecture Diagram

> See [`architecture.md`](architecture.md) for the full diagram and component
> breakdown.

```
[Operator Browser] → [Static SPA: map, dashboards, copilot UI]
        │ REST/JSON
        ▼
[FastAPI backend] → [ML: LightGBM + IsolationForest + SHAP]
        │                 │
        ▼                 ▼
[SQLite data layer]  [Decision engines: Grid Impact Score,
 (assets, sensors,    crew optimiser, what-if simulation,
  weather, incidents,  briefing, alerts]
  predictions, ...)         │
                            ▼
                    [Grounded copilot — tool-calling,
                     auto-upgrades to real LLM function-
                     calling if an OpenAI-compatible key
                     is configured]
```

## Key Design Decisions

| Decision | Rationale |
|---|---|
| SQLite via stdlib `sqlite3` instead of Postgres | Zero infrastructure to fail during a live demo; fully reproducible from a fresh clone. One-line swap to Postgres is documented (see `docs/architecture.md`). |
| Framework-free static frontend served by FastAPI | No `npm install` / frontend build step that can fail or drift right before a demo. |
| Grounded, tool-calling copilot with no required API key | The copilot must work in the demo room with no internet/API key. A deterministic intent router answers from real tool calls by default, and *auto-upgrades* to true LLM function-calling over the same tools if an OpenAI-compatible key is present — the answers stay grounded either way. |
| Correlated synthetic data instead of random noise | A model trained on random labels can't demonstrate real predictive skill or explainability. Driving sensors from a latent health variable with a smooth failure hazard produces calibrated, non-saturated probabilities that SHAP can meaningfully explain. |
| Grid Impact Score as an explicit, interpretable blend (not a black box) | Judges and operators alike need to see *why* an asset outranks another — every weighted component is stored and shown in the UI, not hidden inside a model. |

## What the User Experience Looks Like

An operator opens the dashboard and immediately sees overall grid risk,
critical-asset counts, customers at risk, a live map, and active alerts.
Clicking a high-risk marker opens an asset detail view with sensor trend
charts and a plain-language explanation of why the asset is risky. The
maintenance queue is ranked by grid impact, not raw probability — so the
highest-consequence asset floats to the top even if it isn't the single
highest-probability one. A "what-if" panel lets the operator simulate a
failure or a storm before it happens, and the AI copilot answers natural-
language questions by citing the exact tool calls and data behind each
answer.

## IBM watsonx.ai Integration

The copilot runs its LLM mode **natively on IBM watsonx.ai**, using the
platform's own chat + tool-calling API rather than a generic OpenAI client:

- **Auth** — the IBM Cloud IAM API key is exchanged for a short-lived bearer
  token at `https://iam.cloud.ibm.com/identity/token`, cached in-process and
  refreshed a minute before expiry (`_get_watsonx_token` in
  `backend/services/copilot.py`).
- **Inference** — `POST {WATSONX_URL}/ml/v1/text/chat?version=2024-10-07`
  with `model_id`, `project_id`, `messages`, `tools` and
  `tool_choice_option: "auto"`. The default model is
  `ibm/granite-3-8b-instruct`; any tool-calling watsonx chat model works.
- **Tool loop** — watsonx returns `choices[0].message.tool_calls`; the backend
  executes each call against the fixed `TOOLS` registry (10 read/simulate
  functions), appends the result as a `role: "tool"` message, and loops up to
  five round-trips until the model produces its final answer.
- **Grounding** — the model can *only* call allow-listed tools that read real
  model outputs and database rows. Every response carries the `evidence` list
  (tool, arguments, result) that produced it, which the UI renders as an
  evidence table. The model cannot invent an asset id or a probability.

Provider precedence is **watsonx.ai → Nebius → OpenAI → Azure OpenAI**, so
setting `WATSONX_API_KEY` + `WATSONX_PROJECT_ID` is all that's needed to run
on IBM. If watsonx is unreachable or a credential is wrong, `answer()` catches
the failure and degrades to the deterministic grounded router, returning the
same tool-backed answer with an `llm_error` field attached — a bad key can
never take the demo down.

**Honest scope note:** the integration targets watsonx.ai's chat/tool-calling
API. It does not wrap the system as an MCP server for an external agent to
drive; the same `TOOLS` registry is what such a server would expose, so that
remains a contained follow-up rather than a rewrite.

## Closed-Loop Operator Actions

The dashboard is not read-only. Dispatching a crew, scheduling or deferring a
job, authorising a pre-positioning move, acknowledging an alert and exporting
data all hit real endpoints in `backend/services/operations.py`:

| Action | Real effect |
|---|---|
| Dispatch crew | Picks the nearest AVAILABLE crew with a skill-match penalty (same cost model as the optimiser), writes a `work_orders` row, flips the crew to `ON_JOB` with an `active_assignment`, returns a computed ETA |
| Schedule job | Creates a scheduled work order in the horizon implied by the asset's priority band (CRITICAL 4h → LOW 168h) |
| Defer job | Records a `DEFERRED` work order with the operator's reason |
| Pre-position crew | Moves the crew's `current_area` and lat/lon to the target area centroid |
| Emergency dispatch | Bulk-dispatches available crews to the top CRITICAL assets by grid impact, reporting which could not be staffed |
| Acknowledge alert | Flags the alert row and clears it from the header badge |
| Export | Streams a real CSV built from the live tables |

Every one is written to an `audit_log` table that the Runs Log view reads
back, so an operator (or a judge) can see exactly what the system did and why.
