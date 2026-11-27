import type { NextConfig } from "next";

const scriptPolicy = process.env.NODE_ENV === "development"
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/data-governance", destination: "/data-governance/nudee-dashboard", permanent: false },
      { source: "/data-governance/requests/:path*", destination: "/data-governance/nudee-dashboard?section=requests", permanent: false },
      { source: "/data-governance/assets/:path*", destination: "/data-governance/nudee-dashboard?section=assets", permanent: false },
      { source: "/data-governance/controls/:path*", destination: "/data-governance/nudee-dashboard?section=controls", permanent: false },
      { source: "/data-governance/quality/:path*", destination: "/data-governance/nudee-dashboard?section=quality", permanent: false },
      { source: "/data-governance/privacy/:path*", destination: "/data-governance/nudee-dashboard?section=privacy", permanent: false },
      { source: "/data-governance/sharing/:path*", destination: "/data-governance/nudee-dashboard?section=sharing", permanent: false },
      { source: "/data-governance/reports/:path*", destination: "/data-governance/nudee-indicator?report=1", permanent: false },
    ];
  },
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
            process.env.NODE_ENV === "development"
              ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:* ws://127.0.0.1:*"
              : "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
            "worker-src 'self' blob:",
            ...(process.env.NODE_ENV === "development" ? [] : ["upgrade-insecure-requests"]),
          ].join("; "),
        },
      ],
    }];
  },
};

export default nextConfig;
