/** @type {import('next').NextConfig} */
const config = {
  async rewrites() {
    return [
      {
        source: '/api/leave/:path*',
        destination: 'http://localhost:3001/api/v1/:path*',
      },
    ];
  },
};

export default config;
