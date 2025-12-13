# Vercel 部署工作流程

## 自动部署（推荐方式）

### ✅ Vercel 的自动部署流程

Vercel 已经连接到您的 GitHub 仓库，**每次推送到 `main` 分支都会自动触发部署**。

**工作流程：**
```
修改代码 → 提交到 Git → 推送到 GitHub → Vercel 自动部署
```

### 具体步骤

1. **修改代码**
   ```bash
   # 编辑您的文件
   # 例如：修改 src/js/main.js
   ```

2. **提交更改**
   ```bash
   git add .
   git commit -m "描述您的更改"
   ```

3. **推送到 GitHub**
   ```bash
   git push
   ```

4. **Vercel 自动部署**
   - Vercel 检测到推送
   - 自动开始构建（通常 1-2 分钟）
   - 自动部署到生产环境
   - 您会收到邮件通知（如果配置了）

### 查看部署状态

1. **在 Vercel 控制台查看**：
   - 访问：https://vercel.com
   - 进入您的项目
   - 在 "Deployments" 页面查看部署状态

2. **在 GitHub 查看**：
   - 每次部署会在 GitHub 仓库的 Actions 中显示（如果配置了）
   - 或者在 Vercel 控制台查看

---

## 对比：GitHub Pages vs Vercel

### GitHub Pages（旧方式）

**需要手动操作：**
```bash
npm run build          # 构建项目
npm run deploy          # 使用 gh-pages 部署
# 或者使用 GitHub Actions（自动）
```

**特点：**
- ❌ 需要手动运行部署命令
- ❌ 或者需要配置 GitHub Actions
- ✅ 免费托管

### Vercel（新方式）

**完全自动：**
```bash
git push                # 只需推送代码，Vercel 自动部署
```

**特点：**
- ✅ **完全自动化** - 推送即部署
- ✅ **更快的构建速度**
- ✅ **更好的 CDN 性能**
- ✅ **预览部署** - 每个 PR 都有预览链接
- ✅ **自动 HTTPS**
- ✅ 免费套餐足够个人项目使用

---

## 部署流程对比

### GitHub Pages 流程（旧）

```bash
# 1. 修改代码
vim src/js/main.js

# 2. 构建
npm run build

# 3. 部署（需要手动运行）
npm run deploy
# 或
gh-pages -d dist
```

### Vercel 流程（新）✨

```bash
# 1. 修改代码
vim src/js/main.js

# 2. 提交并推送（Vercel 自动构建和部署）
git add .
git commit -m "更新功能"
git push
# 完成！Vercel 会自动处理构建和部署
```

---

## 特殊场景

### 场景 1：只想本地测试，不部署

```bash
# 本地开发
npm run dev

# 本地预览构建结果
npm run build
npm run preview
```

### 场景 2：需要回退到之前的版本

1. 在 Vercel 控制台
2. 进入 "Deployments" 页面
3. 找到之前的部署
4. 点击 "..." 菜单
5. 选择 "Promote to Production"

### 场景 3：测试特定分支

Vercel 会自动为每个分支创建预览部署：
- 推送到 `feature/new-feature` 分支
- Vercel 自动创建预览部署
- 获得一个预览 URL（如：`oil-injected-compressor-calculator-git-feature-new-feature.vercel.app`）

### 场景 4：需要手动触发部署

1. 在 Vercel 控制台
2. 进入项目设置
3. 点击 "Redeploy" 按钮

---

## 部署检查清单

每次部署后，建议检查：

- [ ] 部署状态为 "Ready"（绿色）
- [ ] 应用页面正常加载
- [ ] 样式正确显示
- [ ] 功能正常工作
- [ ] WASM 文件加载速度正常

---

## 常见问题

### Q: 部署失败怎么办？

**A:** 检查构建日志：
1. 在 Vercel 控制台查看部署详情
2. 查看构建日志中的错误信息
3. 常见原因：
   - 构建命令错误
   - 依赖安装失败
   - 代码语法错误

### Q: 如何查看部署历史？

**A:** 
1. 在 Vercel 控制台
2. 进入项目的 "Deployments" 页面
3. 可以看到所有历史部署记录

### Q: 部署需要多长时间？

**A:** 
- 通常 1-2 分钟
- 取决于项目大小和依赖数量
- 可以在 Vercel 控制台实时查看进度

### Q: 可以同时部署到 GitHub Pages 和 Vercel 吗？

**A:** 可以，但不推荐：
- 需要维护两套配置
- 容易混淆
- 建议只使用 Vercel（性能更好）

---

## 最佳实践

1. **提交信息要清晰**：
   ```bash
   git commit -m "Fix: 修复计算错误"
   git commit -m "Feature: 添加新功能"
   ```

2. **推送前本地测试**：
   ```bash
   npm run build  # 确保构建成功
   ```

3. **使用分支开发**：
   - 在 `feature/xxx` 分支开发
   - 测试通过后合并到 `main`
   - Vercel 会为每个分支创建预览

4. **定期检查部署状态**：
   - 推送后等待 1-2 分钟
   - 检查 Vercel 控制台的部署状态

---

## 总结

**Vercel 部署流程更简单：**

✅ **只需 `git push`，Vercel 自动处理一切**
✅ **无需手动运行构建和部署命令**
✅ **更快的部署速度**
✅ **更好的性能**

**以后的工作流程：**
```
修改代码 → git commit → git push → 等待 1-2 分钟 → 完成！
```

比 GitHub Pages 简单多了！🎉

