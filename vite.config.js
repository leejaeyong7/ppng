import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  // base: '/ppng/',
  // omit
  server: {
    watch: {
        ignored: ['**/public/**']
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ppng: resolve(__dirname, 'ppng.html'),
        blended_mvs_1: resolve(__dirname, 'presets', 'blended_mvs_1.html'),
        blended_mvs_2: resolve(__dirname, 'presets', 'blended_mvs_2.html'),
        blended_mvs_3: resolve(__dirname, 'presets', 'blended_mvs_3.html'),
        mipnerf_1: resolve(__dirname, 'presets', 'mipnerf_1.html'),
        mipnerf_2: resolve(__dirname, 'presets', 'mipnerf_2.html'),
        mipnerf_3: resolve(__dirname, 'presets', 'mipnerf_3.html'),
        nerf_1: resolve(__dirname, 'presets', 'nerf_1.html'),
        nerf_2: resolve(__dirname, 'presets', 'nerf_2.html'),
        nerf_3: resolve(__dirname, 'presets', 'nerf_3.html'),
        nsvf_1: resolve(__dirname, 'presets', 'nsvf_1.html'),
        nsvf_2: resolve(__dirname, 'presets', 'nsvf_2.html'),
        nsvf_3: resolve(__dirname, 'presets', 'nsvf_3.html'),
        tnt_1: resolve(__dirname, 'presets', 'tnt_1.html'),
        tnt_2: resolve(__dirname, 'presets', 'tnt_2.html'),
        tnt_3: resolve(__dirname, 'presets', 'tnt_3.html'),
      },
    },
  }
})