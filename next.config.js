/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // On Vercel: proxy /api/* to the machine behind Cloudflare Tunnel.
    // Browser stays same-origin → no CORS. Leave unset for local same-origin.
    const target = (process.env.API_PROXY_TARGET || '').replace(/\/$/, '');
    if (!target) return [];
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${target}/api/:path*`,
        },
      ],
    };
  },
};

module.exports = nextConfig;
