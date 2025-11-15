/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Substituir db.ts por db.postgres.ts em produção se POSTGRES_URL estiver configurado
    if (isServer && process.env.POSTGRES_URL) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@/lib/db": require("path").resolve(__dirname, "lib/db.postgres.ts"),
      };
    }

    // Ignorar módulo problemático do incremental delivery
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("@yaacovcr/transform");
      } else {
        config.externals = [config.externals, "@yaacovcr/transform"];
      }
    }

    return config;
  },
};

module.exports = nextConfig;
