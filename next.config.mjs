/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permite leer el JSON de forecasts exportado desde Colab
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
