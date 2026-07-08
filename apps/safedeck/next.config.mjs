/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "better-sqlite3",
      "playwright-core",
      "html-to-docx",
      "pdf-lib",
      "jszip",
    ],
  },
};

export default nextConfig;
