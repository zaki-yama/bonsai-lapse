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
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Bonsai Lapse",
        short_name: "BonsaiLapse",
        description: "盆栽の成長を記録してタイムラプスにするアプリ",
        lang: "ja",
        display: "standalone",
        orientation: "portrait",
        background_color: "#1a2416",
        theme_color: "#1a2416",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // API とアップロード済みメディアは Service Worker を通さない
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
