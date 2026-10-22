import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js badge so it doesn't cover the bottom tab bar during demos.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
