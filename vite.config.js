import { defineConfig } from 'vite'

export default defineConfig({
  // omit
  server: {
    watch: {
        ignored: ['**/public/**']
    }
}
})