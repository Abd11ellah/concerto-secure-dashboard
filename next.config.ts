import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  images: {
    // The live product API uses Unsplash. An explicit allowlist prevents arbitrary image URLs.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
  },
};
export default config;
