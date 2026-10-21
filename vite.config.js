// @ts-check

import { defineConfig, loadEnv } from 'vite';
import { createLeaderboardHandler } from './api/leaderboard.js';

export default defineConfig(({ mode }) => {
  const handler = createLeaderboardHandler({ env: { ...process.env, ...loadEnv(mode, process.cwd(), '') } });
  return {
    base: './',
    plugins: [{
      name: 'leaderboard-api',
      configureServer(server) { server.middlewares.use('/api/leaderboard', handler); },
      configurePreviewServer(server) { server.middlewares.use('/api/leaderboard', handler); },
    }],
    build: { outDir: 'dist', emptyOutDir: true },
  };
});
