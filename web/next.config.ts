import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  transpilePackages: ["@utter/shared"],
};

export default nextConfig;
