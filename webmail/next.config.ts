import type { NextConfig } from "next";

const backendUrl =
  process.env.INTERNAL_BACKEND_URL ||
  (process.env.NODE_ENV === "production" ? "http://postarc-server:8080" : "http://127.0.0.1:8080");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/.well-known/jmap",
        destination: `${backendUrl}/.well-known/jmap`,
      },
    ];
  },
};

export default nextConfig;
