# Vercel 部署指南

## 步骤 1: 连接 GitHub 仓库到 Vercel

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 **"Add New..."** → **"Project"**
3. 选择 **"Import Git Repository"**
4. 在 GitHub 仓库列表中找到 `jingyanrong548-del/RCC-Pro`
5. 点击 **"Import"**

## 步骤 2: 配置项目设置

Vercel 会自动检测到 `vercel.json` 配置文件，项目设置应该如下：

- **Framework Preset**: Vite
- **Root Directory**: `./` (默认)
- **Build Command**: `npm run build` (自动检测)
- **Output Directory**: `dist` (自动检测)
- **Install Command**: `npm ci` (自动检测)

## 步骤 3: 环境变量（如果需要）

如果项目需要环境变量，在 Vercel 项目设置中添加：
- 进入项目 → **Settings** → **Environment Variables**
- 添加所需的变量

## 步骤 4: 部署

1. 点击 **"Deploy"** 按钮
2. Vercel 会自动：
   - 安装依赖 (`npm ci`)
   - 构建项目 (`npm run build`)
   - 部署到 CDN

## 步骤 5: 自动部署配置

部署成功后，Vercel 会：
- ✅ 自动为每次推送到 `main` 分支触发部署
- ✅ 为 Pull Request 创建预览部署
- ✅ 提供生产环境 URL 和预览 URL

## 注意事项

### CoolProp WASM 文件

确保 `public/coolprop.wasm` 文件已包含在仓库中，Vercel 会自动处理静态文件。

### 构建优化

项目已配置：
- WASM 文件的正确 MIME 类型
- 静态资源缓存策略
- SPA 路由重写规则

### 自定义域名（可选）

1. 进入项目 → **Settings** → **Domains**
2. 添加您的自定义域名
3. 按照提示配置 DNS 记录

## 故障排除

### 构建失败

如果构建失败，检查：
1. `package.json` 中的构建脚本
2. Node.js 版本（Vercel 默认使用 Node.js 18.x）
3. 构建日志中的错误信息

### WASM 文件加载失败

确保 `vercel.json` 中的 WASM 头部配置正确：
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Opener-Policy: same-origin`

## 快速链接

- [Vercel Dashboard](https://vercel.com/dashboard)
- [项目文档](https://vercel.com/docs)
- [GitHub 仓库](https://github.com/jingyanrong548-del/RCC-Pro)
