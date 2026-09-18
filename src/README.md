# Source Code — Grid Risk Command Center

A FastAPI backend + framework-free static frontend, monorepo-style:

```
src/
├── backend/
│   ├── main.py              # FastAPI app — all REST endpoints + static mount
│   ├── config.py            # tunables, thresholds, env vars
│   ├── db.py                # SQLite schema + data-access helpers + audit log
│   ├── data/generator.py    # correlated synthetic data generator
│   ├── ml/
│   │   ├── features.py      # rolling/slope feature engineering
│   │   └── model.py         # train / evaluate / score / anomaly / SHAP explain
│   ├── services/
│   │   ├── impact.py        # Grid Impact Score + area outage risk
│   │   ├── maintenance.py   # ranked maintenance queue
│   │   ├── crew.py          # crew pre-positioning optimiser
│   │   ├── simulation.py    # what-if asset-failure & weather-event engines
│   │   ├── briefing.py      # auto operator briefing
│   │   ├── alerts.py        # intelligent alert generation
│   │   ├── operations.py    # work orders, crew dispatch, exports, system stats
│   │   └── copilot.py       # grounded copilot on IBM watsonx.ai tool calling
│   └── tests/               # test_core.py (model/logic) + test_operations.py (actions)
├── frontend-next/
│   ├── index.html
│   ├── css/style.css
│   └── js/                  # api.js · components.js · pages.js · app.js
├── scripts/seed.py          # end-to-end pipeline: generate → train → score → seed DB
├── requirements.txt
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── run.sh                   # one-shot install + seed + launch
```

## Running it

See [`../docs/setup-guide.md`](../docs/setup-guide.md) for full instructions. Short version:

```bash
cd src
pip install -r requirements.txt
python -m scripts.seed        # generates data + trains models (~60s first run)
uvicorn backend.main:app --reload --port 8000
```

The generated SQLite database (`src/data/grid.db`) and trained model files
(`src/models/*.joblib`) are build artifacts produced by `scripts/seed.py` — they
are not committed and are regenerated on every fresh setup (deterministic given
the same `SEED`).
