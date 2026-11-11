import type { NextConfig } from "next";

const backendUrl = process.env.INTERNAL_BACKEND_URL || "http://postarc-server:8080";

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
