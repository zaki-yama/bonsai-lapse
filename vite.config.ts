import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon-180x180.png", "favicon.ico"],
      manifest: {
        name: "Bonsai Lapse",
        short_name: "BonsaiLapse",
        description: "盆栽の成長を記録してタイムラプスにするアプリ",
        lang: "ja",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f6f6f3",
        theme_color: "#f6f6f3",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // API と Access ログイン入口は Service Worker を通さない
        navigateFallbackDenylist: [/^\/api\//, /^\/login/],
      },
    }),
  ],
});
