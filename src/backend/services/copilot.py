"""
Grounded AI operations copilot.

The copilot NEVER invents data. It exposes a fixed set of backend TOOLS that read
real model/DB outputs, then answers using ONLY those tool results.

Two execution modes (auto-selected):
  * LLM mode  - if OPENAI_API_KEY / Azure creds are set, the model does true
                function-calling over the tools below and composes the prose.
  * Grounded  - default, no key required. A deterministic intent router picks the
    (local)   right tool(s), and a templated composer formats the real results.
                Every answer carries the tool `evidence` it was built from.
"""
import json
import re

from .. import config, db
from . import simulation, crew as crew_svc, briefing, impact as impact_svc, maintenance

# ---------------------------------------------------------------------------
# TOOLS  (each returns JSON-serialisable, real data)
# ---------------------------------------------------------------------------
def get_high_risk_assets(limit: int = 10):
    return db.query(
        """SELECT p.asset_id, a.asset_type, a.geographic_area area,
                  p.failure_probability, p.grid_impact_score, p.priority,
                  p.predicted_failure_window, a.customers_served, p.recommended_action
           FROM predictions p JOIN assets a ON a.asset_id=p.asset_id
           WHERE p.priority IN ('HIGH','CRITICAL')
           ORDER BY p.grid_impact_score DESC LIMIT ?""", (limit,))


def get_asset_details(asset_id: str):
    a = db.query_one("SELECT * FROM assets WHERE asset_id=?", (asset_id,))
    if not a:
        return {"error": f"Asset {asset_id} not found"}
    p = db.query_one("SELECT * FROM predictions WHERE asset_id=?", (asset_id,))
    return {"asset": a, "prediction": p}


def get_asset_sensor_history(asset_id: str, hours: int = 72):
    return db.query(
        """SELECT * FROM sensor_data WHERE asset_id=?
           ORDER BY timestamp DESC LIMIT ?""", (asset_id, hours))


def get_area_risk(area_id: str = None):
    if area_id:
        return db.query_one("SELECT * FROM area_risk WHERE area_id=?", (area_id,))
    return db.query("SELECT * FROM area_risk ORDER BY outage_probability DESC")


def get_weather_risk(area_id: str = None):
    wx = impact_svc.area_weather_risk()
    return wx.get(area_id) if area_id else wx


def get_maintenance_priorities(limit: int = 10):
    return maintenance.priority_queue(limit=limit)


def get_crew_recommendations():
    return crew_svc.recommend_crews()


def simulate_asset_failure(asset_id: str):
    return simulation.simulate_asset_failure(asset_id)


def simulate_weather_event(area_id: str, event: str = "severe"):
    return simulation.simulate_weather_event(area_id, event)


def generate_operations_brief():
    return briefing.generate_brief()


TOOLS = {
    "get_high_risk_assets": get_high_risk_assets,
    "get_asset_details": get_asset_details,
    "get_asset_sensor_history": get_asset_sensor_history,
    "get_area_risk": get_area_risk,
    "get_weather_risk": get_weather_risk,
    "get_maintenance_priorities": get_maintenance_priorities,
    "get_crew_recommendations": get_crew_recommendations,
    "simulate_asset_failure": simulate_asset_failure,
    "simulate_weather_event": simulate_weather_event,
    "generate_operations_brief": generate_operations_brief,
}

# OpenAI function schema (used only in LLM mode)
TOOL_SCHEMA = [
    {"type": "function", "function": {
        "name": "get_high_risk_assets", "description": "Top assets by grid impact / failure risk.",
        "parameters": {"type": "object", "properties": {"limit": {"type": "integer"}}}}},
    {"type": "function", "function": {
        "name": "get_asset_details", "description": "Full detail + prediction for one asset id.",
        "parameters": {"type": "object", "properties": {"asset_id": {"type": "string"}},
                       "required": ["asset_id"]}}},
    {"type": "function", "function": {
        "name": "get_area_risk", "description": "Area outage risk (all areas if area_id omitted).",
        "parameters": {"type": "object", "properties": {"area_id": {"type": "string"}}}}},
    {"type": "function", "function": {
        "name": "get_weather_risk", "description": "Weather risk by area.",
        "parameters": {"type": "object", "properties": {"area_id": {"type": "string"}}}}},
    {"type": "function", "function": {
        "name": "get_maintenance_priorities", "description": "Ranked maintenance queue.",
        "parameters": {"type": "object", "properties": {"limit": {"type": "integer"}}}}},
    {"type": "function", "function": {
        "name": "get_crew_recommendations", "description": "Crew pre-positioning recommendations.",
        "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {
        "name": "simulate_asset_failure", "description": "Simulate impact if an asset fails.",
        "parameters": {"type": "object", "properties": {"asset_id": {"type": "string"}},
                       "required": ["asset_id"]}}},
    {"type": "function", "function": {
        "name": "simulate_weather_event", "description": "Simulate a weather event on an area.",
        "parameters": {"type": "object", "properties": {
            "area_id": {"type": "string"}, "event": {"type": "string"}}, "required": ["area_id"]}}},
    {"type": "function", "function": {
        "name": "generate_operations_brief", "description": "Whole-grid operations briefing.",
        "parameters": {"type": "object", "properties": {}}}},
]

ASSET_RE = re.compile(r"\b([A-Z]{1,3}-\d{3,5})\b", re.I)
AREA_RE = re.compile(r"\b([A-Z]+-\d{2})\b", re.I)


def _extract_asset(q):
    m = ASSET_RE.search(q.upper())
    return m.group(1) if m else None


def _extract_area(q):
    up = q.upper()
    for a in [g["area_id"] for g in config.GEO_AREAS]:
        if a in up:
            return a
    return None


# ---------------------------------------------------------------------------
# Grounded (local) responder
# ---------------------------------------------------------------------------
def _answer_grounded(query: str):
    q = query.lower()
    asset = _extract_asset(query)
    area = _extract_area(query)
    evidence = []

    def ev(tool, args, result):
        evidence.append({"tool": tool, "args": args, "result": result})
        return result

    # ---- simulate asset failure ----
    if ("what happens" in q or "if" in q and "fail" in q or "simulate" in q) and asset:
        r = ev("simulate_asset_failure", {"asset_id": asset}, simulate_asset_failure(asset))
        if r.get("error"):
            return _wrap(r["error"], evidence)
        txt = (f"**Simulated failure of {asset}** ({r['asset_type']}, {r['area']}):\n"
               f"- Customers affected: **{r['total_customers_affected']:,}** "
               f"({r['direct_customers']:,} direct + {r['downstream_customers']:,} downstream)\n"
               f"- Severity: **{r['severity']}**; est. outage ~{r['estimated_outage_minutes']:.0f} min\n"
               f"- Affected areas: {', '.join(r['affected_areas'])}\n"
               f"- Nearest crew: {r['nearest_crew']['crew_id'] if r['nearest_crew'] else 'n/a'} "
               f"(~{r['nearest_crew']['response_min'] if r['nearest_crew'] else '?'} min)\n"
               f"- Mitigation: {r['recommended_mitigation'][0]}")
        return _wrap(txt, evidence)

    # ---- weather simulation ----
    if "simulate" in q and area and ("weather" in q or "storm" in q):
        r = ev("simulate_weather_event", {"area_id": area, "event": "severe"},
               simulate_weather_event(area, "severe"))
        txt = (f"**Simulated severe weather on {area}:** outage probability "
               f"{r['baseline_outage_probability']:.0%} -> **{r['new_outage_probability']:.0%}** "
               f"({r['new_risk_level']}), {r['high_risk_assets']} high-risk assets exposed.")
        return _wrap(txt, evidence)

    # ---- why is asset risky ----
    if asset and ("why" in q or "risk" in q or "critical" in q or "explain" in q):
        d = ev("get_asset_details", {"asset_id": asset}, get_asset_details(asset))
        if d.get("error"):
            return _wrap(d["error"], evidence)
        p = d["prediction"]; a = d["asset"]
        factors = p.get("top_risk_factors") or []
        bullets = "\n".join(
            f"- {f['label']}: {f['value']} ({'elevated' if f['direction']=='high' else 'degraded'})"
            for f in factors[:5]) or "- No dominant risk factors."
        txt = (f"**{asset}** ({a['asset_type']}, {a['geographic_area']}) is "
               f"**{p['priority']}** - failure probability **{p['failure_probability']:.0%}** "
               f"within {p['predicted_failure_window']}, grid impact **{p['grid_impact_score']:.0f}/100**, "
               f"serving {a['customers_served']:,} customers.\n\n**Why it is risky:**\n{bullets}\n\n"
               f"**Recommended action:** {p['recommended_action']}")
        return _wrap(txt, evidence)

    # ---- area / substation weather exposure ----
    if ("weather" in q or "exposed" in q or "storm" in q) and ("area" in q or "substation" in q
            or "which" in q or area):
        wx = ev("get_weather_risk", {}, get_weather_risk())
        ar = ev("get_area_risk", {}, get_area_risk())
        ranked = sorted(ar, key=lambda x: -x["weather_risk"])[:4]
        lines = "\n".join(
            f"- **{a['area_id']}**: weather risk {a['weather_risk']:.0f}/100, "
            f"{a['high_risk_assets']} high-risk assets, outage prob {a['outage_probability']:.0%}"
            for a in ranked)
        return _wrap(f"**Most weather-exposed areas:**\n{lines}", evidence)

    # ---- crew recommendation ----
    if "crew" in q or "pre-position" in q or "position" in q or "dispatch" in q:
        r = ev("get_crew_recommendations", {}, get_crew_recommendations())
        recs = r["recommendations"][:3]
        if not recs:
            return _wrap("No crew repositioning needed - no HIGH/CRITICAL demand clusters.", evidence)
        lines = "\n".join(
            f"- **{x['crew_id']}** ({x['current_area']} -> **{x['recommended_area']}**): "
            f"{x['high_risk_assets']} high-risk assets, response "
            f"{x['current_response_min']:.0f}->{x['projected_response_min']:.0f} min"
            for x in recs)
        return _wrap(f"**Recommended crew pre-positioning:**\n{lines}", evidence)

    # ---- maintenance plan ----
    if "maintenance" in q or "plan" in q or "inspect" in q:
        r = ev("get_maintenance_priorities", {"limit": 5}, get_maintenance_priorities(5))
        lines = "\n".join(
            f"{x['rank']}. **{x['asset_id']}** ({x['priority']}) - fail {x['failure_probability']:.0%}, "
            f"impact {x['grid_impact_score']:.0f}, due {x['due_window']}: {x['recommended_action']}"
            for x in r)
        return _wrap(f"**Maintenance plan (next {config.PREDICTION_HORIZON_HOURS}h):**\n{lines}", evidence)

    # ---- summarise / brief (explicit) ----
    if any(w in q for w in ("summar", "brief", "overview", "overall", "today", "situation")):
        return _brief_answer(evidence, ev)

    # ---- most likely to fail ----
    if "fail" in q or "risk" in q or "top" in q or "which asset" in q:
        r = ev("get_high_risk_assets", {"limit": 5}, get_high_risk_assets(5))
        if not r:
            return _wrap("No HIGH/CRITICAL assets right now.", evidence)
        lines = "\n".join(
            f"- **{x['asset_id']}** ({x['area']}): fail **{x['failure_probability']:.0%}**, "
            f"impact {x['grid_impact_score']:.0f}, {x['customers_served']:,} customers ({x['priority']})"
            for x in r)
        return _wrap(f"**Assets most likely to fail this week:**\n{lines}", evidence)

    # ---- summarise / brief (default) ----
    return _brief_answer(evidence, ev)


def _brief_answer(evidence, ev):
    b = ev("generate_operations_brief", {}, generate_operations_brief())
    acts = "\n".join(f"{i+1}. {a}" for i, a in enumerate(b["recommended_immediate_actions"][:4]))
    txt = (f"**Grid operations summary** - overall risk **{b['overall_grid_risk']}**.\n"
           f"- Critical assets: {b['critical_assets']}, high-risk: {b['high_risk_assets']}\n"
           f"- High-risk areas: {b['high_risk_areas']}, weather-exposed zones: {b['weather_exposed_zones']}\n"
           f"- Customers at risk: {b['customers_at_risk']:,}\n\n**Immediate actions:**\n{acts}\n\n"
           f"**Main driver:** {b['major_risk_driver']}")
    return _wrap(txt, evidence)


def _wrap(answer, evidence):
    return {"answer": answer, "evidence": evidence, "mode": "grounded",
            "is_simulation": True}


# ---------------------------------------------------------------------------
# LLM mode (optional)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = (
    "You are the Grid Risk Command Center copilot for utility control-room operators. "
    "Answer ONLY using the provided tools, which return real model and database outputs. "
    "Never invent asset ids, probabilities, or customer numbers. If a tool returns no data, "
    "say so. Be concise and operational. All data is clearly-labelled SIMULATION data.")


def _make_openai_client():
    """Return (openai.OpenAI client, model_name) for whichever provider is configured."""
    from openai import OpenAI, AzureOpenAI
    if config.NEBIUS_API_KEY:
        return OpenAI(
            api_key=config.NEBIUS_API_KEY,
            base_url=config.NEBIUS_BASE_URL,
        ), config.NEBIUS_MODEL
    if config.AZURE_OPENAI_ENDPOINT and config.AZURE_OPENAI_KEY:
        return AzureOpenAI(
            api_key=config.AZURE_OPENAI_KEY,
            azure_endpoint=config.AZURE_OPENAI_ENDPOINT,
            api_version="2024-06-01",
        ), config.AZURE_OPENAI_DEPLOYMENT
    # plain OpenAI or any other OpenAI-compatible base_url
    return OpenAI(
        api_key=config.OPENAI_API_KEY,
        base_url=config.OPENAI_BASE_URL,
    ), config.OPENAI_MODEL


def _answer_llm(query: str):
    client, model = _make_openai_client()
    messages = [{"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": query}]
    evidence = []
    for _ in range(5):  # allow a few tool round-trips
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=TOOL_SCHEMA,
            tool_choice="auto",
            temperature=0.2,
            timeout=45,
        )
        msg = resp.choices[0].message
        # append assistant message (openai SDK object -> dict for json serialisation)
        messages.append(msg.model_dump(exclude_unset=True))
        calls = msg.tool_calls
        if not calls:
            return {"answer": msg.content or "", "evidence": evidence,
                    "mode": "llm", "is_simulation": True}
        for call in calls:
            name = call.function.name
            args = json.loads(call.function.arguments or "{}")
            try:
                result = TOOLS[name](**args)
            except Exception as e:  # never crash on a bad tool call
                result = {"error": str(e)}
            evidence.append({"tool": name, "args": args, "result": result})
            messages.append({"role": "tool", "tool_call_id": call.id,
                             "content": json.dumps(result, default=str)[:6000]})
    return {"answer": "Unable to complete the tool sequence.", "evidence": evidence,
            "mode": "llm", "is_simulation": True}


def answer(query: str):
    db.audit("copilot", "query", {"query": query, "llm": config.LLM_ENABLED})
    if config.LLM_ENABLED:
        try:
            return _answer_llm(query)
        except Exception as e:
            out = _answer_grounded(query)
            out["llm_error"] = str(e)
            return out
    return _answer_grounded(query)
