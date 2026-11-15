import { defineConfig } from 'vite';
export default defineConfig({ base: './', optimizeDeps: { include: ['@tonejs/midi/dist/Midi.js', 'vexflow'] } });
