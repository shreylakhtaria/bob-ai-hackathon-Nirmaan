import type { NextConfig } from "next";

// Where the FastAPI backend lives. Same-origin "/api/*" calls from the browser are
// proxied here, so the frontend never needs CORS or a hardcoded absolute API URL.
// Override per environment (e.g. API_PROXY_TARGET=http://backend:8000 in Docker).
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiTarget}/api/:path*` }];
  },
};

export default nextConfig;
