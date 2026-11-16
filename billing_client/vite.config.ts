import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';

const sriImagesDir = path.resolve(__dirname, '../sri_images');
if (!fs.existsSync(sriImagesDir)) {
  fs.mkdirSync(sriImagesDir, { recursive: true });
}

const contentTypeFor = (file: string) => {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
};

const serveSriImages = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  const url = req.url || '';
  const match = url.match(/^(?:\/billing)?\/sri_images\/([^/?#]+)/);
  if (!match) {
    next();
    return;
  }
  const fileName = decodeURIComponent(match[1]);
  if (!/^[A-Za-z0-9._-]+$/.test(fileName)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const filePath = path.join(sriImagesDir, fileName);
  if (!filePath.startsWith(sriImagesDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    next();
    return;
  }
  res.setHeader('Content-Type', contentTypeFor(fileName));
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(filePath).pipe(res);
};

const sriImagesPlugin = (): Plugin => ({
  name: 'sri-images-static',
  configureServer(server: ViteDevServer) {
    server.middlewares.use(serveSriImages);
  },
  configurePreviewServer(server) {
    server.middlewares.use(serveSriImages);
  },
});

const publicBase = (raw: string | undefined, fallback: string) => {
  let base = (raw || fallback).trim() || fallback;
  if (!base.startsWith('/')) base = `/${base}`;
  if (base !== '/' && !base.endsWith('/')) base = `${base}/`;
  return base;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = publicBase(env.VITE_BASE, '/billing/');

  return {
    plugins: [react(), sriImagesPlugin()],
    base,
    envPrefix: 'VITE_',
    server: {
      port: 5174,
      host: true,
      open: base,
      proxy: {
        '/sri_images': {
          target: env.VITE_API_BASE_URL || 'http://localhost:9098',
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 5174,
      host: true,
    },
    build: {
      outDir: 'build',
      sourcemap: false,
      emptyOutDir: true,
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'react-redux',
        '@reduxjs/toolkit',
        'axios',
        'bootstrap',
      ],
    },
  };
});
