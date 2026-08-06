import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // Smaller production image for Fly / Docker (see web/Dockerfile).
  output: "standalone",
};

export default nextConfig;
