# Vercel 部署快速指南

## 适用场景
适用于已经开发好的 Web 应用（Vite、React、Vue、Next.js 等），需要从 GitHub Pages 迁移到 Vercel，或首次部署到 Vercel。

---

## 快速部署流程

### 前置条件
- ✅ 项目已经在 GitHub 上有仓库
- ✅ 项目有 `package.json` 和构建脚本
- ✅ 项目可以正常构建（`npm run build`）

---

## 步骤 1：修改项目配置

### 1.1 修改 `vite.config.js`（Vite 项目）

**如果使用 Vite，检查并修改 `base` 配置：**

```javascript
export default defineConfig({
  // 改为根路径（Vercel 不需要子路径）
  base: '/',
  
  // ... 其他配置
});
```

**原配置（GitHub Pages）：**
```javascript
base: '/your-repo-name/'
```

**新配置（Vercel）：**
```javascript
base: '/'
```

### 1.2 创建 `vercel.json` 配置文件

在项目根目录创建 `vercel.json`：

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm ci",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)\\.wasm",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/wasm"
        },
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

**注意：**
- 如果输出目录不是 `dist`，修改 `outputDirectory`
- 如果构建命令不是 `npm run build`，修改 `buildCommand`
- 如果使用其他框架（Next.js、Nuxt 等），Vercel 会自动检测，可以简化配置

---

## 步骤 2：本地测试

### 2.1 构建项目

```bash
npm run build
```

### 2.2 预览构建结果

```bash
npm run preview
```

**检查：**
- ✅ 构建成功，没有错误
- ✅ 预览页面正常显示
- ✅ 资源路径正确（应该是 `/assets/...` 而不是 `/repo-name/assets/...`）

---

## 步骤 3：提交更改

```bash
# 添加所有更改
git add .

# 提交
git commit -m "Configure for Vercel deployment"

# 推送到 GitHub
git push
```

---

## 步骤 4：在 Vercel 部署

### 4.1 访问 Vercel

1. 访问：https://vercel.com
2. 使用 GitHub 账户登录
3. 点击 **"Add New..."** → **"Project"**

### 4.2 导入 GitHub 仓库

1. 在仓库列表中找到您的项目
2. 点击 **"Import"**

### 4.3 配置项目设置

**自动检测（推荐）：**
- Vercel 会自动检测框架和配置
- 确认设置是否正确：
  - **Framework Preset**: 自动检测（如 Vite、Next.js 等）
  - **Build Command**: `npm run build`
  - **Output Directory**: `dist`（或您的输出目录）
  - **Install Command**: `npm ci`

**手动配置（如果需要）：**
- 如果自动检测不正确，可以手动修改

### 4.4 部署

1. 点击 **"Deploy"** 按钮
2. 等待构建完成（通常 1-2 分钟）
3. 获得部署 URL（格式：`your-project.vercel.app`）

---

## 步骤 5：验证部署

### 5.1 检查部署状态

- 在 Vercel 控制台查看部署状态
- 确认状态为 **"Ready"**（绿色）

### 5.2 测试应用

1. 访问部署 URL
2. 检查：
   - ✅ 页面正常加载
   - ✅ 样式正确显示
   - ✅ 功能正常工作
   - ✅ 没有控制台错误

### 5.3 检查资源加载

1. 打开浏览器开发者工具（F12）
2. 切换到 **"Network"** 标签
3. 刷新页面
4. 检查：
   - ✅ 所有资源加载成功（状态码 200）
   - ✅ 没有 404 错误
   - ✅ 加载速度正常

---

## 步骤 6：清理（可选）

### 6.1 删除 GitHub Pages 相关脚本

如果 `package.json` 中有以下脚本，可以删除：

```json
{
  "scripts": {
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  }
}
```

**删除后：**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### 6.2 删除 GitHub Pages 依赖（可选）

```bash
npm uninstall gh-pages
```

---

## 完成！以后的工作流程

### 以后只需要：

```bash
# 修改代码
vim src/index.js

# 提交并推送
git add .
git commit -m "更新功能"
git push

# 完成！Vercel 自动部署（等待 1-2 分钟）
```

**无需：**
- ❌ `npm run build`（Vercel 自动构建）
- ❌ `npm run deploy`（不需要了）
- ❌ 手动操作（完全自动化）

---

## 常见问题

### Q: 构建失败怎么办？

**A:** 
1. 检查 Vercel 控制台的构建日志
2. 常见原因：
   - 依赖安装失败 → 检查 `package.json`
   - 构建命令错误 → 检查 `buildCommand`
   - 代码语法错误 → 本地先测试 `npm run build`

### Q: 样式丢失怎么办？

**A:** 
1. 检查 `vite.config.js` 中的 `base` 是否为 `/`
2. 检查资源路径是否正确
3. 清除浏览器缓存后重试
4. 检查 `vercel.json` 中的路由配置

### Q: 如何回退到之前的版本？

**A:** 
1. 在 Vercel 控制台
2. 进入 **"Deployments"** 页面
3. 找到之前的部署
4. 点击 **"..."** → **"Promote to Production"**

### Q: 可以同时使用 GitHub Pages 和 Vercel 吗？

**A:** 
- 技术上可以，但不推荐
- 需要维护两套配置
- 建议只使用 Vercel

---

## 不同框架的注意事项

### Vite 项目
- ✅ 修改 `vite.config.js` 中的 `base: '/'`
- ✅ 创建 `vercel.json` 配置文件

### Next.js 项目
- ✅ Vercel 自动检测，通常不需要 `vercel.json`
- ✅ 如果使用自定义配置，创建 `vercel.json`

### Vue CLI 项目
- ✅ 检查 `vue.config.js` 中的 `publicPath`
- ✅ 创建 `vercel.json` 配置文件

### React 项目（Create React App）
- ✅ 检查 `package.json` 中的 `homepage`
- ✅ 创建 `vercel.json` 配置文件

---

## 快速检查清单

部署前检查：
- [ ] `vite.config.js` 中 `base` 设置为 `/`
- [ ] 创建了 `vercel.json` 配置文件
- [ ] 本地构建成功（`npm run build`）
- [ ] 预览正常（`npm run preview`）
- [ ] 代码已推送到 GitHub

部署后检查：
- [ ] Vercel 部署状态为 "Ready"
- [ ] 应用页面正常加载
- [ ] 样式正确显示
- [ ] 功能正常工作
- [ ] 没有控制台错误

---

## 总结

**核心步骤：**
1. 修改 `base` 配置为 `/`
2. 创建 `vercel.json`
3. 本地测试构建
4. 提交并推送代码
5. 在 Vercel 导入并部署

**以后的工作：**
- 只需 `git push`，Vercel 自动部署

---

**需要帮助？** 参考以下文档：
- `VERCEL_DEPLOYMENT.md` - 详细部署指南
- `VERCEL_DEPLOYMENT_OPTIONS.md` - 部署方式对比
- `TROUBLESHOOTING.md` - 问题排查

