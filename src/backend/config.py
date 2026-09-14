"""
Central configuration. All tunables (thresholds, paths, weights, LLM keys)
live here and can be overridden via environment variables.
"""
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", ROOT_DIR / "data"))
MODEL_DIR = Path(os.getenv("MODEL_DIR", ROOT_DIR / "models"))
FRONTEND_DIR = Path(os.getenv("FRONTEND_DIR", ROOT_DIR / "frontend"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# Default = SQLite (zero infra). To use Postgres, point DATABASE_URL at it and
# swap the thin db.py driver (documented in README).
DB_PATH = Path(os.getenv("DB_PATH", DATA_DIR / "grid.db"))
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

MODEL_PATH = MODEL_DIR / "failure_model.joblib"
ANOMALY_PATH = MODEL_DIR / "anomaly_model.joblib"
META_PATH = MODEL_DIR / "model_meta.json"

# ---------------------------------------------------------------------------
# Simulation / data generation
# ---------------------------------------------------------------------------
SEED = int(os.getenv("SEED", "42"))
HERO_DEGRADE_RATE = float(os.getenv("HERO_DEGRADE_RATE", "1.5"))  # (legacy) hero severity knob
# Hero follows a controlled, still-ACCELERATING degradation curve so it looks
# like a pre-first-failure asset (rising slopes, in-range magnitudes) rather
# than a saturated post-repair asset.
HERO_TARGET_DEG = float(os.getenv("HERO_TARGET_DEG", "0.60"))
HERO_CURVE_EXP = float(os.getenv("HERO_CURVE_EXP", "2.4"))
N_ASSETS = int(os.getenv("N_ASSETS", "220"))
HISTORY_DAYS = int(os.getenv("HISTORY_DAYS", "21"))     # hourly sensor history
SENSOR_FREQ_HOURS = 1
PREDICTION_HORIZON_HOURS = int(os.getenv("PREDICTION_HORIZON_HOURS", "72"))

# The whole app is a *simulation*. This flag is surfaced in the UI/API so no one
# mistakes synthetic data for a live SCADA feed.
IS_SIMULATION = True

GEO_AREAS = [
    {"area_id": "NORTH-04", "name": "North Ridge",   "lat": 23.10, "lon": 72.62},
    {"area_id": "NORTH-01", "name": "North Central", "lat": 23.16, "lon": 72.55},
    {"area_id": "SOUTH-02", "name": "South Basin",   "lat": 22.95, "lon": 72.58},
    {"area_id": "EAST-03",  "name": "East Industrial","lat": 23.02, "lon": 72.70},
    {"area_id": "WEST-05",  "name": "West Harbor",   "lat": 23.05, "lon": 72.48},
    {"area_id": "CENTRAL-00","name": "City Core",    "lat": 23.03, "lon": 72.58},
]

ASSET_TYPES = ["Transformer", "CircuitBreaker", "Substation", "Switchgear", "Feeder"]
MANUFACTURERS = ["Siemens", "ABB", "GE", "Schneider", "Hitachi", "Crompton"]

# ---------------------------------------------------------------------------
# Risk thresholds (configurable). Applied to failure_probability AND to
# area outage_probability and grid impact score bands.
# ---------------------------------------------------------------------------
RISK_BANDS = {          # lower-bound (inclusive) -> label
    "CRITICAL": 0.75,
    "HIGH": 0.55,
    "MEDIUM": 0.30,
    "LOW": 0.0,
}
IMPACT_BANDS = {        # grid impact score 0-100
    "CRITICAL": 85,
    "HIGH": 65,
    "MEDIUM": 40,
    "LOW": 0,
}

# ---------------------------------------------------------------------------
# Grid Impact Score weights (see services/impact.py). Interpretable blend.
# ---------------------------------------------------------------------------
IMPACT_WEIGHTS = {
    "failure": 0.35,
    "criticality": 0.20,
    "customers": 0.20,
    "network": 0.15,
    "weather": 0.10,
}

# ---------------------------------------------------------------------------
# Crew optimisation
# ---------------------------------------------------------------------------
CREW_SPEED_KMPH = float(os.getenv("CREW_SPEED_KMPH", "45"))

# ---------------------------------------------------------------------------
# LLM copilot (optional). If no key is present the copilot runs a deterministic,
# fully grounded responder over the same tool functions.
# ---------------------------------------------------------------------------
OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL    = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Nebius (or any OpenAI-SDK-compatible provider)
NEBIUS_API_KEY  = os.getenv("NEBIUS_API_KEY", "")
NEBIUS_BASE_URL = os.getenv("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1/")
NEBIUS_MODEL    = os.getenv("NEBIUS_MODEL", "openai/gpt-oss-120b")

# Azure OpenAI
AZURE_OPENAI_ENDPOINT   = os.getenv("AZURE_OPENAI_ENDPOINT", "")
AZURE_OPENAI_KEY        = os.getenv("AZURE_OPENAI_KEY", "")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "")

# IBM watsonx.ai — native chat/tool-calling API (checked first; this is the
# challenge's actual "Bob solution" ask). Auth is an IBM Cloud IAM API key
# exchanged for a short-lived bearer token (see services/copilot.py).
WATSONX_API_KEY    = os.getenv("WATSONX_API_KEY", "")
WATSONX_PROJECT_ID = os.getenv("WATSONX_PROJECT_ID", "")
WATSONX_URL        = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")
WATSONX_MODEL_ID   = os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-8b-instruct")
WATSONX_VERSION    = os.getenv("WATSONX_VERSION", "2024-10-07")
WATSONX_IAM_URL    = os.getenv("WATSONX_IAM_URL", "https://iam.cloud.ibm.com/identity/token")

WATSONX_ENABLED = bool(WATSONX_API_KEY and WATSONX_PROJECT_ID)

LLM_ENABLED = bool(
    WATSONX_ENABLED
    or NEBIUS_API_KEY
    or OPENAI_API_KEY
    or (AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY)
)

API_TITLE = "Grid Risk Command Center API"
API_VERSION = "1.0.0"
