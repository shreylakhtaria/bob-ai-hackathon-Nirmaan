#!/usr/bin/env bash
# One-shot: install deps (optional), seed data + train models, launch server.
set -e
cd "$(dirname "$0")"
if [ "${1:-}" = "--install" ]; then pip install -r requirements.txt; fi
echo "==> Seeding data + training models (first run ~60s)..."
python -m scripts.seed
echo "==> Starting Grid Risk Command Center at http://localhost:8000"
uvicorn backend.main:app --host 0.0.0.0 --port 8000
