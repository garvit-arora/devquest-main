import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

function nextConfig(phase: string): NextConfig {
  const fallbackBackendOrigin =
    phase === PHASE_DEVELOPMENT_SERVER
      ? "http://localhost:8000"
      : "https://devquest-bdayfba2arh9h6ch.canadacentral-01.azurewebsites.net";
  const backendOrigin = (process.env.DEVQUEST_BACKEND_ORIGIN || fallbackBackendOrigin).replace(/\/$/, "");

  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    transpilePackages: ["@devquest/animation-system", "@devquest/types"],
    output: "standalone",
    experimental: {
      optimizePackageImports: ["lucide-react", "recharts"],
    },
    async rewrites() {
      return [
        {
          source: "/api/:path*",
          destination: `${backendOrigin}/api/:path*`,
        },
        {
          source: "/v1/:path*",
          destination: `${backendOrigin}/v1/:path*`,
        },
        {
          source: "/webhooks/:path*",
          destination: `${backendOrigin}/webhooks/:path*`,
        },
      ];
    },
  };
}

export default nextConfig;
