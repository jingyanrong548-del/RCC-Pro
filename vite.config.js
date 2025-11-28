import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => {
  // 判断是本地开发还是生产构建
  const isProduction = command === 'build';

  return {
    // -------------------------------------------------------------------------
    // 1. 部署路径配置 (GitHub Pages 关键设置)
    // ⚠️ 请确保 '/Oil-injected-Compressor-Calculator-pro/' 与您的 GitHub 仓库名称完全一致
    //    例如：如果仓库地址是 github.com/User/my-app，则这里应填 '/my-app/'
    // -------------------------------------------------------------------------
    base: isProduction ? '/Oil-injected-Compressor-Calculator-pro/' : '/',

    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        // 确保 CoolProp 的核心文件被 PWA 缓存，离线也能计算
        includeAssets: ['coolprop.wasm', 'coolprop.js'],
        manifest: {
          name: 'Compressor Efficiency Pro',
          short_name: 'CompPro',
          description: 'Industrial Heat Pump & Gas Compressor Calculator (v3.0)',
          theme_color: '#f5f5f7', // 适配我们新的 iOS 灰色背景
          background_color: '#f5f5f7',
          display: 'standalone', // 像原生 App 一样全屏运行
          orientation: 'portrait',
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          // 允许缓存大文件 (CoolProp.wasm 约为 6MB+, 默认限制是 2MB)
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          cleanupOutdatedCaches: true
        }
      })
    ],
    server: {
      host: true, // 允许局域网访问 (方便手机调试)
      open: true
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
      assetsDir: 'assets',
      // 生产环境移除 console.log (可选，当前保留以便调试)
      // minify: 'terser', 
      // terserOptions: { compress: { drop_console: true } }
    }
  };
});