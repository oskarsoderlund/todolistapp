import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables Docker-friendly standalone build (produces .next/standalone/server.js)
  output: "standalone",
  // better-sqlite3 is a native module — keep it external so Next doesn't try to bundle it.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
