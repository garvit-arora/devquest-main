import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

function nextConfig(phase: string): NextConfig {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    transpilePackages: ["@devquest/animation-system", "@devquest/types"],
    output: "standalone",
    experimental: {
      optimizePackageImports: ["lucide-react", "recharts"],
    },
  };
}

export default nextConfig;
