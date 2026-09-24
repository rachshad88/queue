import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/alpine.js'],
            refresh: true,
        }),
        tailwindcss(),
    ],
    build: {
        outDir: 'public/dist',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                assetFileNames: 'assets/module-CdqakSoB.css',
                entryFileNames: 'assets/rhu-alpine.[hash].js',
            },
        },
    },
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
