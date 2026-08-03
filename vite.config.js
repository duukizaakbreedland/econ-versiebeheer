import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// De app draait op GitHub Pages onder /econ-versiebeheer/, lokaal gewoon op /
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/econ-versiebeheer/' : '/',
  plugins: [react()],
}))
