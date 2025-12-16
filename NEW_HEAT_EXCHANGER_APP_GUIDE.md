# 新建换热器计算 App 开发指南

## 项目初始化提示语

```
我需要创建一个新的换热器（Heat Exchanger）计算 Web 应用，请帮我：

1. 项目初始化：
   - 使用 Vite + Vanilla JavaScript（或 Vue/React，根据需求）
   - 配置 Tailwind CSS 用于样式
   - 设置项目结构

2. CoolProp 物性库集成：
   - 参考 Oil-injected-Compressor-Calculator-pro 项目的实现方式
   - 创建 coolprop_loader.js 加载 WASM 文件
   - 配置正确的路径解析
   - 实现物性查询功能

3. 项目结构：
   - src/js/coolprop_loader.js - CoolProp 加载器
   - src/js/coolprop.js - CoolProp WASM 模块
   - src/js/main.js - 主入口
   - src/js/logic/ - 计算逻辑模块
   - public/coolprop.wasm - WASM 文件

4. Vercel 部署配置：
   - vite.config.js 中 base 设置为 '/'
   - 创建 vercel.json 配置文件
   - 配置 PWA（如果需要离线使用）

5. UI 设计：
   - 参考当前项目的 iOS 风格设计
   - 使用 glass-panel 样式
   - 响应式布局

项目需求：
- 应用名称：Heat Exchanger Calculator
- 主要功能：换热器热力计算
- 物性库：CoolProp
- 部署平台：Vercel
- 样式框架：Tailwind CSS

请提供完整的项目结构和关键代码示例。
```

---

## 详细开发提示语

### 阶段 1：项目初始化

```
创建一个新的换热器计算 Web 应用项目，要求：

1. 使用 Vite 作为构建工具
2. 使用 Tailwind CSS 进行样式设计
3. 项目结构参考 Oil-injected-Compressor-Calculator-pro：
   - public/ - 静态资源（包含 coolprop.wasm）
   - src/js/ - JavaScript 模块
   - src/css/ - 样式文件
   - index.html - 入口文件

4. 初始化配置：
   - package.json 包含必要的依赖
   - vite.config.js 配置 base: '/'
   - tailwind.config.js 配置
   - postcss.config.js 配置

5. 创建基础文件结构：
   - src/js/main.js - 应用主入口
   - src/js/coolprop_loader.js - CoolProp 加载器（参考现有项目）
   - src/js/logic/heat_exchanger.js - 换热器计算逻辑
   - src/css/style.css - 全局样式

请创建完整的项目骨架。
```

---

### 阶段 2：CoolProp 集成

```
集成 CoolProp 物性库到新项目中，要求：

1. 复制 CoolProp 文件：
   - 从 Oil-injected-Compressor-Calculator-pro 项目复制：
     * public/coolprop.wasm
     * src/js/coolprop.js
     * src/js/coolprop_loader.js

2. 修改 coolprop_loader.js：
   - 确保路径解析正确（使用 import.meta.env.BASE_URL）
   - 更新错误提示信息
   - 保持与现有项目相同的加载逻辑

3. 在主入口中加载 CoolProp：
   - 在 main.js 中使用 loadCoolProp() 函数
   - 等待 CoolProp 加载完成后再初始化计算模块
   - 处理加载失败的情况

4. 创建物性查询函数：
   - 封装常用的物性查询（温度、压力、焓、熵等）
   - 处理错误情况
   - 提供友好的错误提示

请提供完整的 CoolProp 集成代码。
```

---

### 阶段 3：换热器计算逻辑

```
实现换热器热力计算功能，要求：

1. 计算模块结构：
   - src/js/logic/heat_exchanger.js - 主计算模块
   - 支持多种换热器类型（管壳式、板式等）
   - 支持多种流动方式（顺流、逆流、交叉流）

2. 输入参数：
   - 热流体：入口温度、出口温度、流量、工质类型
   - 冷流体：入口温度、出口温度、流量、工质类型
   - 换热器参数：传热面积、传热系数等

3. 计算功能：
   - 使用 CoolProp 查询物性
   - 计算传热量
   - 计算对数平均温差（LMTD）
   - 计算传热系数
   - 计算压降（可选）

4. 输出结果：
   - 传热量
   - 对数平均温差
   - 传热系数
   - 效率
   - 压降

请提供计算逻辑的代码框架。
```

---

### 阶段 4：UI 设计

```
设计换热器计算应用的 UI，要求：

1. 参考 Oil-injected-Compressor-Calculator-pro 的设计风格：
   - iOS 风格的 glass-panel
   - 渐变背景
   - 圆角卡片设计
   - 响应式布局

2. 主要界面元素：
   - 标题栏：应用名称和版本
   - 输入区域：热流体参数、冷流体参数、换热器参数
   - 工质选择：下拉菜单（使用 CoolProp 支持的工质）
   - 计算按钮
   - 结果展示区域：图表和数值

3. 交互功能：
   - 工质选择后显示物性信息（GWP、临界参数等）
   - 实时验证输入参数
   - 计算结果可视化（P-h 图、T-Q 图等）
   - 结果导出功能（PDF/Excel）

4. 移动端适配：
   - 响应式设计
   - 移动端优化的输入界面
   - 底部结果面板（类似现有项目）

请提供 HTML 结构和样式代码。
```

---

### 阶段 5：部署配置

```
配置项目用于 Vercel 部署，要求：

1. vite.config.js：
   - base: '/' （根路径）
   - 配置 VitePWA 插件（如果需要离线使用）
   - 配置构建选项

2. vercel.json：
   - 构建命令：npm run build
   - 输出目录：dist
   - SPA 路由重写规则
   - WASM 文件缓存策略
   - 静态资源缓存策略

3. package.json：
   - 构建脚本：npm run build
   - 预览脚本：npm run preview
   - 不包含 gh-pages 相关脚本

4. .vercelignore：
   - 排除不需要部署的文件

请提供完整的部署配置文件。
```

---

## 完整项目初始化提示语（一键使用）

```
我需要创建一个新的换热器（Heat Exchanger）计算 Web 应用，请帮我完成以下工作：

【项目信息】
- 应用名称：Heat Exchanger Calculator
- 主要功能：换热器热力计算（传热量、LMTD、传热系数等）
- 技术栈：Vite + Vanilla JavaScript + Tailwind CSS + CoolProp
- 部署平台：Vercel
- 参考项目：Oil-injected-Compressor-Calculator-pro

【开发要求】

1. 项目初始化：
   - 使用 Vite 创建项目
   - 配置 Tailwind CSS
   - 创建项目目录结构（参考现有项目）

2. CoolProp 集成：
   - 复制 coolprop.wasm 和 coolprop.js 文件
   - 创建 coolprop_loader.js（参考现有实现）
   - 在主入口中加载 CoolProp
   - 实现物性查询封装函数

3. 计算逻辑：
   - 创建 heat_exchanger.js 计算模块
   - 实现传热量计算
   - 实现对数平均温差（LMTD）计算
   - 实现传热系数计算
   - 支持多种换热器类型和流动方式

4. UI 设计：
   - 参考现有项目的 iOS 风格设计
   - 创建输入表单（热流体、冷流体、换热器参数）
   - 工质选择下拉菜单（显示物性信息）
   - 结果展示区域（数值和图表）
   - 响应式布局

5. 部署配置：
   - vite.config.js：base: '/'
   - 创建 vercel.json 配置文件
   - 配置 PWA（可选）
   - 配置缓存策略

【避免的问题】
- CoolProp 路径解析错误（使用 import.meta.env.BASE_URL）
- 部署后样式丢失（确保 base 配置正确）
- WASM 文件加载慢（配置正确的缓存策略）
- 物性查询错误处理不完善

【参考文件】
- vite.config.js
- vercel.json
- src/js/coolprop_loader.js
- src/js/main.js
- index.html

请提供完整的项目代码和配置。
```

---

## 关键文件模板

### vite.config.js 模板

```javascript
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['coolprop.wasm', 'coolprop.js'],
      manifest: {
        name: 'Heat Exchanger Calculator',
        short_name: 'HX Calc',
        description: 'Heat Exchanger Thermal Calculation Tool',
        theme_color: '#f5f5f7',
        background_color: '#f5f5f7',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'coolprop-wasm-cache',
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
  
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
```

### vercel.json 模板

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)\\.wasm",
      "headers": [
        { "key": "Content-Type", "value": "application/wasm" },
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

### coolprop_loader.js 模板（关键部分）

```javascript
import Module from './coolprop.js';

export async function loadCoolProp() {
    try {
        let baseUrl = import.meta.env.BASE_URL;
        if (!baseUrl.endsWith('/')) baseUrl += '/';

        const moduleArgs = {
            locateFile: (path, scriptDirectory) => {
                if (path.endsWith('.wasm')) {
                    const fullPath = `${baseUrl}coolprop.wasm`;
                    return fullPath;
                }
                return scriptDirectory + path;
            }
        };

        const CP = await Module(moduleArgs);
        return CP;
    } catch (err) {
        throw new Error(`CoolProp 加载失败：${err.message}`);
    }
}
```

---

## 开发检查清单

### 项目初始化
- [ ] Vite 项目创建成功
- [ ] Tailwind CSS 配置完成
- [ ] 项目目录结构创建
- [ ] CoolProp 文件复制到正确位置

### CoolProp 集成
- [ ] coolprop_loader.js 创建并配置正确
- [ ] 路径解析使用 import.meta.env.BASE_URL
- [ ] 主入口正确加载 CoolProp
- [ ] 错误处理完善

### 计算逻辑
- [ ] 换热器计算模块创建
- [ ] 物性查询函数封装
- [ ] 计算结果验证
- [ ] 错误处理完善

### UI 设计
- [ ] HTML 结构创建
- [ ] Tailwind CSS 样式应用
- [ ] 响应式布局实现
- [ ] 交互功能实现

### 部署配置
- [ ] vite.config.js 配置正确（base: '/'）
- [ ] vercel.json 创建
- [ ] 本地构建测试通过
- [ ] 部署后验证通过

---

## 常见问题避免

### ❌ 避免的问题 1：CoolProp 路径错误

**错误：**
```javascript
const fullPath = `/Oil-injected-Compressor-Calculator-pro/coolprop.wasm`;
```

**正确：**
```javascript
const fullPath = `${baseUrl}coolprop.wasm`; // baseUrl 来自 import.meta.env.BASE_URL
```

### ❌ 避免的问题 2：base 配置错误

**错误：**
```javascript
base: '/heat-exchanger-calculator/'
```

**正确：**
```javascript
base: '/' // Vercel 使用根路径
```

### ❌ 避免的问题 3：忘记创建 vercel.json

**必须创建** `vercel.json` 文件，配置路由和缓存策略。

### ❌ 避免的问题 4：物性查询错误处理不完善

**错误：**
```javascript
const T = CP.PropsSI('T', 'P', P, 'H', H, fluid); // 可能抛出异常
```

**正确：**
```javascript
try {
    const T = CP.PropsSI('T', 'P', P, 'H', H, fluid);
} catch (err) {
    console.error('物性查询失败:', err);
    // 显示友好的错误提示
}
```

---

## 总结

**使用上面的提示语，可以：**
1. ✅ 快速初始化项目
2. ✅ 正确集成 CoolProp
3. ✅ 避免常见错误
4. ✅ 快速完成部署配置

**开发流程：**
1. 使用"完整项目初始化提示语"创建项目
2. 逐步实现功能
3. 参考现有项目的代码结构
4. 使用提供的模板文件
5. 按照检查清单验证

**部署流程：**
1. 本地测试构建
2. 提交到 GitHub
3. 在 Vercel 导入
4. 完成！

