# 部署新 App 到 Vercel 的提示语

## 可以直接使用的提示语

```
我需要将另一个已开发好的 Web 应用部署到 Vercel。请帮我：

1. 检查并修改 vite.config.js（如果使用 Vite），将 base 从仓库路径改为根路径 '/'
2. 创建 vercel.json 配置文件，包含：
   - 构建命令和输出目录
   - SPA 路由重写规则
   - WASM 文件和静态资源的缓存策略 HTTP 头
3. 本地测试构建是否成功
4. 提供在 Vercel 平台导入和部署的步骤说明

项目信息：
- 框架：[Vite/Next.js/Vue/React 等]
- 输出目录：[dist/build/.next 等]
- GitHub 仓库：[仓库名称]

请按照之前迁移 Oil-injected-Compressor-Calculator-pro 项目的方式，提供详细的部署指导。
```

---

## 更详细的提示语（如果需要）

```
我需要将另一个已开发好的 Web 应用从 GitHub Pages 迁移到 Vercel 部署。

项目信息：
- 项目名称：[项目名称]
- 框架：[Vite/Next.js/Vue/React 等]
- GitHub 仓库：[仓库 URL]
- 当前部署方式：[GitHub Pages/本地/其他]
- 输出目录：[dist/build/.next 等]

请帮我完成以下工作：

1. 检查项目配置文件：
   - vite.config.js / next.config.js / vue.config.js 等
   - 确认 base/publicPath 配置
   - 检查构建脚本

2. 修改配置以适应 Vercel：
   - 将 base 路径改为根路径 '/'
   - 创建 vercel.json 配置文件
   - 配置路由重写规则（如果是 SPA）
   - 配置静态资源缓存策略

3. 本地验证：
   - 运行构建命令确保成功
   - 预览构建结果确认正常

4. 提供部署步骤：
   - 如何在 Vercel 导入 GitHub 仓库
   - 如何配置项目设置
   - 如何验证部署成功

5. 清理工作：
   - 删除不再需要的 GitHub Pages 相关脚本
   - 更新文档中的部署说明

请参考之前迁移 Oil-injected-Compressor-Calculator-pro 项目的经验，提供类似的详细指导。
```

---

## 最简洁版本（快速使用）

```
帮我将另一个已开发好的 Web 应用部署到 Vercel，参考之前迁移 Oil-injected-Compressor-Calculator-pro 项目的方式。

请：
1. 修改 vite.config.js 的 base 配置为 '/'
2. 创建 vercel.json 配置文件
3. 提供 Vercel 部署步骤说明

项目信息：
- 框架：[填写]
- 输出目录：[填写]
```

---

## 使用建议

- **第一次部署**：使用"更详细的提示语"
- **熟悉流程后**：使用"最简洁版本"
- **遇到问题**：使用"可以直接使用的提示语"，包含项目具体信息

