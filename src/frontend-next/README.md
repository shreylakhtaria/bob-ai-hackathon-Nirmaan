# Grid Risk Advisor — frontend (Next.js)

Operator console for the Grid Risk Command Center. Next.js App Router + TypeScript,
Tailwind, TanStack Query, Leaflet (map) and Chart.js (telemetry). It is a pure client
of the FastAPI backend — all data comes from `/api/*`.

## Running it

The backend must be up first; the frontend proxies `/api/*` to it.

```bash
# 1. backend (from src/)
python -m scripts.seed          # first run only: generate data + train models
uvicorn backend.main:app --port 8000

# 2. frontend (from src/frontend-next/)
npm install
npm run dev                     # http://localhost:3000
```

`npm run build && npm run start` for a production build.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `API_PROXY_TARGET` | `http://127.0.0.1:8000` | Where `/api/*` is proxied (see `next.config.ts`). Point this at the backend host in Docker/deploy. |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Public origin used for canonical, Open Graph and sitemap URLs. Set this at deploy time or links will point at localhost. |

## Layout notes

- `app/layout.tsx` is a **server** component so pages can export Next `metadata`
  (per-page titles, canonical, Open Graph) and ship real HTML. Client-side providers
  and the app shell live in `app/providers.tsx`.
- Each route has a small `layout.tsx` whose only job is its `metadata` export; the
  page components themselves are client components.
- `app/robots.ts` and `app/sitemap.ts` generate `/robots.txt` and `/sitemap.xml`.

## Auth

Signup/login hit `/api/auth/*` and store a bearer token in `localStorage`
(`grid_auth_token`), attached by `lib/api.ts` on every request.
