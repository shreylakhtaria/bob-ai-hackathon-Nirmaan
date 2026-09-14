# Problem Statement

## Background

Power transformers, substations, switchgear and feeders are the load-bearing
infrastructure of the electrical grid. They are expensive, long-lived, and
their failure is rarely instantaneous — degradation shows up in sensor
telemetry (temperature, vibration, oil quality, partial discharge) weeks
before an actual outage.

## The Problem

Most utilities still schedule maintenance on a fixed calendar (e.g. "inspect
every transformer every 18 months") rather than on the asset's actual
condition. Meanwhile the sensors that already exist on this equipment are
producing exactly the signals that would predict failure — but that data is
never combined with weather forecasts, network topology, or crew
availability in a form an operator can act on *before* the failure happens.
The result: reactive, not predictive, operations. A transformer with a 20%
failure probability but 100,000 customers behind it can silently outrank a
60%-probability asset with only 1,000 customers, and nobody notices until
it's too late.

## Who is Affected

Grid control-room operators and maintenance planners at electric utilities —
the people who have to decide, every day, "which of our 200+ transformers do
we inspect this week, and which crew do we send where" — using dashboards
that show raw sensor values and probabilities, but not *impact* or a
recommended action.

## Why It Matters

Unplanned transformer and substation failures cause blackouts that cost
utilities well over $1M per hour and disrupt service for potentially
hundreds of thousands of customers. Storm-driven cascading failures are the
worst case: a single weather event can push several already-degraded assets
over the edge simultaneously, and crews are rarely pre-positioned to respond
efficiently.

## Why Existing Solutions Fall Short

- **Calendar-based maintenance** ignores actual asset condition — it both
  over-maintains healthy equipment and under-maintains equipment that is
  degrading faster than the schedule assumes.
- **Raw anomaly dashboards** surface sensor deviations but don't translate
  them into *"how many customers, how soon, how confident, and what should I
  do about it."*
- **Failure-probability-only ranking** misprioritizes: it ignores how many
  customers and downstream assets are actually behind a given piece of
  equipment, and ignores current weather exposure.
- **Weather forecasts and sensor/SCADA data live in separate systems**, so
  the compounding risk of "already-degraded asset + incoming storm" is
  rarely combined into a single, ranked, actionable view.
