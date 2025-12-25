import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Network First for navigation (HTML pages)
        navigateFallback: null,
        // Network First for all assets - always try network, cache as fallback
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(js|css)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours for images
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /^https:\/\/.*\.(woff|woff2|ttf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days for fonts
              },
            },
          },
          {
            urlPattern: /^https:\/\/api\.mapbox\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mapbox-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              networkTimeoutSeconds: 5,
            },
          },
        ],
        // Clean up old caches
        cleanupOutdatedCaches: true,
        // Skip waiting - activate new SW immediately
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: false, // Use existing manifest.json in public folder
      devOptions: {
        enabled: false, // Disable in dev to avoid caching issues during development
      },
    }),
  ],

  server: {
    port: 3000,
    open: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mantine': ['@mantine/core', '@mantine/hooks', '@mantine/form', '@mantine/notifications', '@mantine/charts'],
          'vendor-map': ['mapbox-gl', 'react-map-gl', '@turf/turf'],
          'vendor-charts': ['recharts'],
        },
      },
    },
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@mantine/core'],
  },
});
