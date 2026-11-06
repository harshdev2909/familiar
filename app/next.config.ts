import type { NextConfig } from "next";

const appUrl = new URL(process.env.APP_URL ?? "http://localhost:3000");

const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // The microphone is the only device capability Familiar uses.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(appUrl.protocol === "https:" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

/** Split deploy: the frontend proxies the API to a separate backend (same-origin cookies stay intact). */
const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Production builds type-check the app only; tests (which import contract artifacts) run under `pnpm typecheck`.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  async rewrites() {
    return backendUrl ? { beforeFiles: [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }], afterFiles: [], fallback: [] } : [];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Local dev serves portraits from localhost; production media is always on a public host.
    dangerouslyAllowLocalIP: appUrl.hostname === "localhost" || appUrl.hostname === "127.0.0.1",
    // Portraits are served from Vercel Blob in production and /api/media in development.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: appUrl.protocol.replace(":", "") as "http" | "https", hostname: appUrl.hostname, port: appUrl.port, pathname: "/api/media/**" },
    ],
  },
};

export default nextConfig;
