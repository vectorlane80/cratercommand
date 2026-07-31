import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site from /<repo>/, so production builds need
  // asset URLs rooted there. The dev server keeps plain / so localhost
  // workflows are unaffected.
  base: command === 'build' ? '/cratercommand/' : '/',
  server: {
    // Bind to all network interfaces so the dev server is reachable from
    // other machines on the LAN (and from a phone) — useful for testing
    // online play across two devices.
    host: '0.0.0.0',
    port: 5173,
    strictPort: true
  }
}));
