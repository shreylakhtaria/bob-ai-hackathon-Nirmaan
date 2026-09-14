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

## IBM / LLM Copilot Integration

The copilot's optional LLM mode talks to any **OpenAI-SDK-compatible chat
completions API** using the official `openai` Python client, with true
function/tool calling over the same fixed set of grounded tools the local
router uses. Three providers are supported out of the box, tried in this
order: **Nebius Token Factory** (recommended — hosts the open-weight
`openai/gpt-oss-120b` model), plain **OpenAI**, or **Azure OpenAI**. Set the
matching API key and the copilot upgrades automatically, with no code
changes and no possibility of ungrounded answers, since the model can only
call the allow-listed tools.

**Honest limitation:** this repository currently wires the LLM mode to the
OpenAI chat-completions contract (via Nebius, OpenAI, or Azure OpenAI), not
directly to IBM watsonx.ai / IBM Bob's own API surface — meaning the core
"Build a Bob solution" ask of the challenge is not yet literally satisfied
by an IBM Bob integration. Because the tool-calling loop in
`backend/services/copilot.py` is already isolated behind one client
adapter (`_make_openai_client`) and a fixed `TOOLS` registry, pointing it at
watsonx.ai would mean swapping that one adapter and its request/response
shapes — the tool definitions, grounding guarantees, and evidence trail do
not need to change. A second, complementary path is to expose the same
`TOOLS` registry as an MCP (Model Context Protocol) server, so IBM Bob (or
any MCP-capable agent) could call this system's tools directly rather than
going through the in-app copilot at all. Neither has been built yet — see
`known_limitations` in [`submission.yaml`](../submission.yaml) for the same
note.
