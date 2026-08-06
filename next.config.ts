import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone-сборка: в рантайм-образ попадает только нужное подмножество
  // node_modules, а не весь их объём — см. Dockerfile.
  output: "standalone",
};

export default nextConfig;
