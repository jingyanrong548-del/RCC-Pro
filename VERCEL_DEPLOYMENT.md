# Vercel 部署指南

## 已完成的工作

✅ 修改了 `vite.config.js`：
- 将 base URL 从 `/Oil-injected-Compressor-Calculator-pro/` 改为 `/`
- 优化了 PWA 缓存策略，为 WASM 文件添加了长期缓存

✅ 创建了 `vercel.json` 配置文件：
- 配置了构建命令和输出目录
- 设置了 SPA 路由重写规则
- 为 WASM 文件配置了长期缓存 HTTP 头
- 为静态资源配置了缓存策略

✅ 更新了 `coolprop_loader.js`：
- 移除了 GitHub Pages 相关的错误提示
- 更新了错误信息，使其更通用

✅ 创建了 `.vercelignore` 文件：
- 排除了不需要部署的文件

✅ 本地构建测试通过：
- 构建成功，WASM 文件正确输出到 `dist/coolprop.wasm`

## 下一步：在 Vercel 平台部署

### 1. 访问 Vercel 并登录

1. 访问 [vercel.com](https://vercel.com)
2. 点击 "Sign Up" 或 "Log In"
3. 选择 "Continue with GitHub" 使用您的 GitHub 账户登录

### 2. 创建新项目

1. 登录后，点击右上角的 **"Add New..."** 或 **"New Project"**
2. 在项目列表中，找到并选择您的仓库：`Oil-injected-Compressor-Calculator-pro`
3. 点击 **"Import"**

### 3. 配置项目设置

Vercel 会自动检测到这是一个 Vite 项目，但请确认以下设置：

- **Framework Preset**: `Vite`（应该已自动检测）
- **Root Directory**: `./`（项目根目录）
- **Build Command**: `npm run build`（应该已自动填充）
- **Output Directory**: `dist`（应该已自动填充）
- **Install Command**: `npm ci`（推荐）或 `npm install`

### 4. 环境变量（当前不需要）

当前项目不需要环境变量，可以直接跳过这一步。

### 5. 部署

1. 点击 **"Deploy"** 按钮
2. Vercel 将开始构建和部署您的项目
3. 构建过程通常需要 1-2 分钟
4. 构建完成后，您会看到一个部署成功的页面

### 6. 获取部署 URL

部署成功后，您会看到：
- **Production URL**: `https://your-project-name.vercel.app`
- 每次推送到 GitHub 的 main 分支，Vercel 会自动重新部署

## 验证部署

### 1. 检查部署状态

1. 在 Vercel 控制台的 "Deployments" 页面，确认部署状态为 "Ready"
2. 点击部署，查看构建日志，确认没有错误

### 2. 测试应用功能

1. 打开部署的 URL
2. 打开浏览器开发者工具（F12）
3. 切换到 "Network" 标签
4. 刷新页面，观察：
   - `coolprop.wasm` 文件的加载时间（应该从几小时降低到几秒）
   - 检查响应头，确认 `Cache-Control` 头已设置
   - 检查文件大小（约 6.6MB）

### 3. 测试 PWA 功能

1. 在移动设备或桌面浏览器中打开应用
2. 检查是否可以添加到主屏幕
3. 测试离线功能（断开网络后刷新页面）

### 4. 性能对比

**迁移前（GitHub Pages）**：
- 首次加载 WASM：几小时（有时）
- 后续访问：仍然很慢

**迁移后（Vercel）**：
- 首次加载 WASM：几秒（利用全球 CDN）
- 后续访问：瞬时（浏览器缓存 + Service Worker）

## 自定义域名（可选）

如果需要使用自定义域名：

1. 在 Vercel 项目设置中，点击 "Domains"
2. 添加您的域名
3. 按照提示配置 DNS 记录
4. 等待 DNS 生效（通常几分钟到几小时）

## 自动部署

Vercel 已自动配置了：
- ✅ 每次推送到 `main` 分支时自动部署
- ✅ 每个 Pull Request 都会创建预览部署
- ✅ 自动 HTTPS 证书

## 回退方案

如果遇到问题，可以：

1. **保留 GitHub Pages**：修改 `vite.config.js` 中的 `base` 为 `/Oil-injected-Compressor-Calculator-pro/` 即可切换回 GitHub Pages
2. **查看构建日志**：在 Vercel 控制台查看详细的构建和部署日志
3. **联系支持**：Vercel 提供免费支持

## 常见问题

### Q: 构建失败怎么办？
A: 检查构建日志，通常是因为：
- Node.js 版本不兼容（Vercel 默认使用 Node.js 18）
- 依赖安装失败
- 构建命令错误

### Q: WASM 文件仍然加载慢？
A: 检查：
- 浏览器开发者工具中的网络请求
- 确认 `Cache-Control` 头已设置
- 清除浏览器缓存后重试

### Q: 如何更新应用？
A: 只需推送到 GitHub 的 `main` 分支，Vercel 会自动部署新版本。

## 技术支持

- Vercel 文档：https://vercel.com/docs
- Vercel 社区：https://github.com/vercel/vercel/discussions

---

**部署完成后，请更新您的 GitHub README 或文档中的链接，指向新的 Vercel URL。**

