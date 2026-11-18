import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Nécessaire pour GitHub Pages : https://USER.github.io/ma-collection-pokemon/
  base: process.env.BASE_PATH || '/',
})
