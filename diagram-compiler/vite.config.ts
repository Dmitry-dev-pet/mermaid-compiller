import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],

      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
        // Prevent multiple copies of Mermaid (and React) from being bundled.
        // This avoids runtime issues when dependencies import their own Mermaid version.
        dedupe: ['react', 'react-dom', 'mermaid'],
      }
    };
});
