/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // 1. 字体系统：优先使用 Apple 系统字体，其次是 Inter
      fontFamily: {
        sans: [
          'Inter', 
          '-apple-system', 
          'BlinkMacSystemFont', 
          '"SF Pro Text"', 
          '"Helvetica Neue"', 
          'sans-serif'
        ],
        mono: ['"SF Mono"', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      // 2. 色彩系统：扩展 Apple 风格的语义化颜色
      colors: {
        // iOS 系统级灰色 (用于背景层次)
        ios: {
          bg: '#F5F5F7',         // 系统背景灰
          surface: '#FFFFFF',    // 卡片表面白
          'text-primary': '#1D1D1F',   // 主要文字 (接近纯黑但不死黑)
          'text-secondary': '#86868B', // 次要文字 (金属灰)
          border: 'rgba(0, 0, 0, 0.04)', // 极淡的边框
        },
        // 您的品牌色 (保持 Teal/Cyan 基调，但微调饱和度以适应玻璃态)
        primary: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          400: '#2DD4BF',
          500: '#14B8A6', // 主色
          600: '#0D9488', // 激活态
          700: '#0F766E',
        }
      },
      // 3. 阴影系统：弥散阴影 (Diffuse Shadows)
      boxShadow: {
        // 玻璃卡片的基础阴影：轻微、发散
        'glass': '0 8px 30px rgba(0, 0, 0, 0.04)',
        // 悬浮状态：加深阴影
        'glass-hover': '0 20px 40px rgba(0, 0, 0, 0.08)',
        // 内部凹槽 (用于分段控制器背景)
        'inner-ios': 'inset 0 1px 2px rgba(0, 0, 0, 0.06)',
      },
      // 4. 扩展背景模糊 (Backdrop Blur)
      backdropBlur: {
        'xs': '2px',
      },
      // 5. 动画过渡 (模拟 iOS 弹簧手感)
      transitionTimingFunction: {
        'ios-spring': 'cubic-bezier(0.25, 0.8, 0.25, 1)',
      }
    },
  },
  plugins: [],
}