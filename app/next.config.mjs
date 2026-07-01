/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@supabase/supabase-js"],
  },
  async redirects() {
    return [
      { source: "/upload", destination: "/", permanent: false },
      { source: "/pain-points", destination: "/", permanent: false },
      { source: "/churn-risk", destination: "/", permanent: false },
      { source: "/clusters/:path*", destination: "/", permanent: false },
      { source: "/features", destination: "/", permanent: false },
      { source: "/roadmap", destination: "/", permanent: false },
      { source: "/admin/ingestion", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
