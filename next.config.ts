import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Separate dev output avoids conflicting with another running dashboard.
  distDir: process.env.NODE_ENV === "development" && process.env.CHANGES_LOCAL_PREVIEW === "1" ? ".next-changes-preview" : ".next",
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
