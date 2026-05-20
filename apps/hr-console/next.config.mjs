/** @type {import('next').NextConfig} */
const config = {
  async rewrites() {
    return [
      { source: '/api/leave/:path*',    destination: 'http://localhost:3001/api/v1/:path*' },
      { source: '/api/workflow/:path*', destination: 'http://localhost:3002/api/v1/:path*' },
      { source: '/api/people/:path*',   destination: 'http://localhost:3003/api/v1/:path*' },
      { source: '/api/letters/:path*',  destination: 'http://localhost:3004/api/v1/:path*' },
      { source: '/api/payroll/:path*',  destination: 'http://localhost:3007/api/v1/:path*' },
      { source: '/api/integrations/:path*',   destination: 'http://localhost:3008/api/v1/:path*' },
      { source: '/api/workflow-sagas/:path*', destination: 'http://localhost:3009/api/v1/:path*' },
    ];
  },
};

export default config;
