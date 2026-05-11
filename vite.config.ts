import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Bind to all network interfaces so the dev server is reachable from
    // other machines on the LAN (and from a phone) — useful for testing
    // online play across two devices.
    host: '0.0.0.0',
    port: 5173,
    strictPort: true
  }
});
