"""
Central configuration. All tunables (thresholds, paths, weights, LLM keys)
live here and can be overridden via environment variables.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load src/.env (if present) into the process environment before anything
# below reads os.getenv(). Real environment variables still take precedence
# over .env values, matching standard dotenv behavior.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", ROOT_DIR / "data"))
MODEL_DIR = Path(os.getenv("MODEL_DIR", ROOT_DIR / "models"))
# No FRONTEND_DIR: the UI is the Next.js app in src/frontend-next, served by Next
# itself. This process is the JSON API only.
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

# IBM Bob — the hackathon-provided coding-agent CLI. This is the literal
# graded "IBM Bob Integration" criterion, distinct from watsonx.ai below.
# Bob has no public raw-HTTP inference API for third-party backends (its
# /inference/* route is Cloudflare-gated to the official CLI client only —
# confirmed by a 403 even with a bogus token). The working integration is
# headless CLI mode (`bob run --mode ask ...`, invoked as a subprocess from
# services/copilot.py), which requires the `bob` binary on PATH:
# https://bob.ibm.com/docs/shell/getting-started/install-and-setup
# Checked first if BOB_API_KEY is present.
BOB_API_KEY = os.getenv("BOB_API_KEY", "")
BOB_ENABLED = bool(BOB_API_KEY)

# IBM watsonx.ai — native chat/tool-calling API. Auth is an IBM Cloud IAM API
# key exchanged for a short-lived bearer token (see services/copilot.py).
WATSONX_API_KEY    = os.getenv("WATSONX_API_KEY", "")
WATSONX_PROJECT_ID = os.getenv("WATSONX_PROJECT_ID", "")
WATSONX_URL        = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")
WATSONX_MODEL_ID   = os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-8b-instruct")
WATSONX_VERSION    = os.getenv("WATSONX_VERSION", "2024-10-07")
WATSONX_IAM_URL    = os.getenv("WATSONX_IAM_URL", "https://iam.cloud.ibm.com/identity/token")

WATSONX_ENABLED = bool(WATSONX_API_KEY and WATSONX_PROJECT_ID)

LLM_ENABLED = bool(
    BOB_ENABLED
    or WATSONX_ENABLED
    or NEBIUS_API_KEY
    or OPENAI_API_KEY
    or (AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY)
)

API_TITLE = "Grid Risk Command Center API"
API_VERSION = "1.0.0"

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
# "development" | "production". Controls cookie Secure flag, error verbosity and
# whether a weak signing secret is tolerated.
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT.lower() in ("production", "prod")

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
_DEV_SECRET = "dev-insecure-secret-change-me"
AUTH_SECRET_KEY = os.getenv("AUTH_SECRET_KEY", _DEV_SECRET)
# A forgeable signing key is a total auth bypass: anyone who reads this repo can
# mint an admin token. Refuse to boot in production rather than fail open.
if IS_PRODUCTION and AUTH_SECRET_KEY == _DEV_SECRET:
    raise RuntimeError(
        "AUTH_SECRET_KEY must be set to a unique secret when ENVIRONMENT=production. "
        "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
    )

# Split-token lifetimes. The access token is a bearer credential held in memory by
# the SPA, so it is short; the refresh token lives in an HttpOnly cookie and is
# revocable server-side (see the refresh_tokens table).
ACCESS_TOKEN_TTL_MINUTES = int(os.getenv("ACCESS_TOKEN_TTL_MINUTES", "15"))
REFRESH_TOKEN_TTL_DAYS = int(os.getenv("REFRESH_TOKEN_TTL_DAYS", "14"))

REFRESH_COOKIE_NAME = os.getenv("REFRESH_COOKIE_NAME", "grid_refresh")
CSRF_COOKIE_NAME = os.getenv("CSRF_COOKIE_NAME", "grid_csrf")
CSRF_HEADER_NAME = os.getenv("CSRF_HEADER_NAME", "X-CSRF-Token")
# Path-scoped so the refresh cookie is only ever sent to the endpoints that need
# it, instead of riding along on every API call.
REFRESH_COOKIE_PATH = os.getenv("REFRESH_COOKIE_PATH", "/api/auth")
# Secure requires HTTPS; forcing it in local dev would silently drop the cookie.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true" if IS_PRODUCTION else "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")

ROLES = ("admin", "operator", "crew")
DEFAULT_ROLE = os.getenv("DEFAULT_ROLE", "operator")
# Comma-separated emails that are promoted to admin on signup, so the first real
# account can administer the system without a manual DB edit.
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}

# ---------------------------------------------------------------------------
# CSV bulk ingestion limits (services/ingest.py)
# ---------------------------------------------------------------------------
# An upload is untrusted input: cap the bytes we will buffer and the rows we
# will parse, so a single request cannot exhaust memory or the database.
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))
MAX_IMPORT_ROWS = int(os.getenv("MAX_IMPORT_ROWS", "10000"))

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
# Explicit origins only. Credentialed requests cannot use "*", and an open API
# behind cookie auth is a CSRF hole.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", FRONTEND_URL).split(",") if o.strip()]

# ---------------------------------------------------------------------------
# Rate limiting (auth endpoints only — normal app traffic is not limited)
# ---------------------------------------------------------------------------
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
RATE_LIMIT_LOGIN = os.getenv("RATE_LIMIT_LOGIN", "10/minute")
RATE_LIMIT_SIGNUP = os.getenv("RATE_LIMIT_SIGNUP", "5/minute")
RATE_LIMIT_REFRESH = os.getenv("RATE_LIMIT_REFRESH", "30/minute")
