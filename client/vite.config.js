import { defineConfig } from 'vite'

export default defineConfig({
    esbuild: {
        include: /\.(jsx|tsx)$/,  // JSX uniquement dans .jsx/.tsx, pas dans .js
    }
})