import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // next dev/build is invoked from apps/console; repo root is two levels up.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: ["@repo/ui"],
};

export default nextConfig;
