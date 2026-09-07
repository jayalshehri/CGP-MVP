import type { NextConfig } from "next";

const scriptPolicy = process.env.NODE_ENV === "development"
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'",
            "form-action 'self'", "object-src 'none'", "img-src 'self' data: blob:",
            "font-src 'self' data:", "style-src 'self' 'unsafe-inline'",
            scriptPolicy,
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
            "worker-src 'self' blob:", "upgrade-insecure-requests",
          ].join("; "),
        },
      ],
    }];
  },
};

export default nextConfig;
