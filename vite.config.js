import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/naver-map-search': {
        target: 'https://map.naver.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/naver-map-search/, '/p/api/search'),
        headers: {
          Referer: 'https://map.naver.com/p/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      }
    }
  }
})

