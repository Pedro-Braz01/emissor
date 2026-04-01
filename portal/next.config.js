/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Variáveis de ambiente públicas
  env: {
    NEXT_PUBLIC_APP_NAME: 'NFSe Emissor',
    NEXT_PUBLIC_APP_VERSION: '2.0.0',
  },
  
  // Headers de segurança
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
