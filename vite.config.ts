import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function pagesFallback(): Plugin {
  return {
    name: 'pages-404',
    apply: 'build',
    closeBundle() {
      const base = '/nenocutter/';
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Nenocutter</title><script>(function(){var base=${JSON.stringify(base)};var path=location.pathname.indexOf(base)===0?location.pathname.slice(base.length):location.pathname.replace(/^\\//,'');var route=path.replace(/\\/?index\\.html$/,'').replace(/^\\//,'');var hash=route?'#/'+route:(location.hash||'#/');location.replace(base+(location.search||'')+hash);})();</script></head><body></body></html>`;
      fs.mkdirSync('dist', { recursive: true });
      fs.writeFileSync('dist/404.html', html);
    },
  };
}

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE ?? (command === 'serve' ? '/' : '/nenocutter/'),
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'embed.js', 'samples/*.svg', 'icons/*.png'],
      manifest: {
        name: 'Nenocutter',
        short_name: 'Nenocutter',
        description: 'Design cookie cutters in the browser and export free STL and 3MF files.',
        theme_color: '#f6efe4',
        background_color: '#fff8ee',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,ttf}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
    pagesFallback(),
  ],
  optimizeDeps: { exclude: ['manifold-3d'] },
  worker: { format: 'es' },
}));
