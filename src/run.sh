#!/usr/bin/env bash
# One-shot: install deps (optional), seed data + train models, launch API + UI.
set -e
cd "$(dirname "$0")"

if [ "${1:-}" = "--install" ]; then
  pip install -r requirements.txt
  (cd frontend-next && npm install)
fi

echo "==> Seeding data + training models (first run ~60s)..."
python -m scripts.seed

echo "==> Starting API on :8000"
uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
API_PID=$!
# Stop the API when this script exits, otherwise Ctrl-C leaves it holding :8000.
trap 'kill $API_PID 2>/dev/null || true' EXIT

echo "==> Starting UI on http://localhost:3000"
cd frontend-next
[ -d node_modules ] || npm install
npm run dev
