import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  // Git worktrees sit beside a parent lockfile; pin Turbopack to this app.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
