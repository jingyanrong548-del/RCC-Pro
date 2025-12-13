# Vercel 部署验证指南

## 第一步：获取部署 URL

在 Vercel 成功部署页面，您会看到：
- **访问链接**：通常在页面顶部或预览区域
- URL 格式：`https://oil-injected-compressor-calculator-pro.vercel.app` 或类似

**操作**：点击预览区域或访问链接，在新标签页中打开应用。

---

## 第二步：检查 WASM 文件加载速度

### 2.1 打开浏览器开发者工具

1. 在部署的应用页面，按 `F12`（Windows/Linux）或 `Cmd + Option + I`（Mac）
2. 切换到 **"Network"（网络）** 标签
3. 勾选 **"Disable cache"（禁用缓存）**（首次测试时）
4. 刷新页面（`F5` 或 `Cmd + R`）

### 2.2 查找 WASM 文件请求

1. 在 Network 标签中，找到 `coolprop.wasm` 文件
2. 点击该请求，查看详细信息

### 2.3 检查关键指标

**应该看到：**

✅ **加载时间（Time）**：
- **预期**：几秒到十几秒（而不是几小时）
- **理想**：5-10 秒内完成

✅ **文件大小（Size）**：
- 约 **6.6 MB**（显示为 6,600 KB 左右）

✅ **状态码（Status）**：
- `200 OK`（成功）

✅ **响应头（Response Headers）**：
- `Cache-Control: public, max-age=31536000, immutable`
- `Content-Type: application/wasm`

### 2.4 检查加载速度对比

**迁移前（GitHub Pages）**：
- ❌ 首次加载：几小时（有时）
- ❌ 后续访问：仍然很慢

**迁移后（Vercel）**：
- ✅ 首次加载：几秒到十几秒
- ✅ 后续访问：瞬时（从缓存加载）

---

## 第三步：检查控制台日志

### 3.1 打开控制台

1. 在开发者工具中，切换到 **"Console"（控制台）** 标签
2. 刷新页面

### 3.2 查看 CoolProp 加载日志

**应该看到以下日志：**

```
[CoolProp] Starting load sequence...
[CoolProp] Environment Base URL: /
[CoolProp] Requesting WASM at: /coolprop.wasm
[CoolProp] WASM initialized successfully.
CoolProp loaded successfully.
```

**如果看到错误**：
- ❌ `CoolProp 加载失败`：检查网络连接或 WASM 文件路径
- ❌ `404 Not Found`：WASM 文件未正确部署
- ❌ `CORS error`：跨域问题（Vercel 应该已处理）

---

## 第四步：验证应用功能

### 4.1 检查 UI 加载

✅ **页面元素**：
- 标题："Oil-injected Compressor Calculator"
- 两个标签页："制冷热泵" 和 "气体压缩"
- 表单输入框正常显示

### 4.2 检查流体信息显示

1. 在 "制冷热泵" 标签页，查看工质下拉菜单下方
2. **应该显示**：工质的 GWP、ODP、安全等级、临界温度等信息
3. **不应该显示**："Wait: Library Loading..." 或 "物性库加载失败"

### 4.3 测试计算功能

#### 测试模式 1：制冷热泵计算

1. 选择工质（如 R245fa）
2. 输入参数：
   - 运行转速：2900 RPM
   - 排量：437.5 cm³/rev
   - 蒸发温度：50°C
   - 冷凝温度：125°C
3. 点击 **"Calculate Performance"** 按钮
4. **应该看到**：计算结果正常显示，没有错误

#### 测试模式 2：气体压缩计算

1. 切换到 "气体压缩" 标签页
2. 选择气体（如 Air）
3. 输入参数：
   - 吸气压力：1.0 bar
   - 吸气温度：25°C
   - 排气压力：8.0 bar
4. 点击 **"Calculate Gas Compression"** 按钮
5. **应该看到**：计算结果正常显示

### 4.4 检查计算按钮状态

✅ **正常状态**：
- 按钮文字显示为 "Calculate Performance" 或 "Calculate Gas Compression"
- 按钮可以点击（不是禁用状态）

❌ **异常状态**：
- 按钮显示 "物性库加载失败"
- 按钮被禁用（灰色）

---

## 第五步：验证缓存策略

### 5.1 检查 HTTP 缓存头

1. 在 Network 标签中，找到 `coolprop.wasm` 请求
2. 点击请求，查看 **"Headers"（请求头）** 标签
3. 滚动到 **"Response Headers"（响应头）** 部分

**应该看到：**

```
Cache-Control: public, max-age=31536000, immutable
Content-Type: application/wasm
```

### 5.2 测试缓存效果

1. **首次访问**：
   - 清除浏览器缓存
   - 刷新页面
   - 记录 WASM 文件加载时间

2. **第二次访问**：
   - 不清除缓存
   - 刷新页面
   - **应该看到**：WASM 文件从缓存加载（显示 "disk cache" 或 "memory cache"）
   - **加载时间**：应该接近 0 秒

---

## 第六步：性能对比测试

### 6.1 记录关键指标

在 Network 标签中，记录以下数据：

| 指标 | 首次加载 | 缓存后加载 |
|------|---------|-----------|
| WASM 文件大小 | ~6.6 MB | ~6.6 MB |
| 加载时间 | ? 秒 | ? 秒 |
| 来源 | Network | Cache |
| 状态码 | 200 | 200 (from cache) |

### 6.2 对比迁移前后

**迁移前（GitHub Pages）**：
- 首次加载：几小时（有时）
- 缓存后：仍然很慢

**迁移后（Vercel）**：
- 首次加载：几秒到十几秒 ✅
- 缓存后：瞬时 ✅

---

## 第七步：测试 PWA 功能（可选）

### 7.1 检查 Service Worker

1. 在开发者工具中，切换到 **"Application"（应用）** 标签
2. 左侧菜单选择 **"Service Workers"**
3. **应该看到**：Service Worker 已注册并激活

### 7.2 测试离线功能

1. 在 Application 标签中，选择 **"Service Workers"**
2. 勾选 **"Offline"（离线）**
3. 刷新页面
4. **应该看到**：应用仍然可以正常使用（从缓存加载）

---

## 常见问题排查

### ❌ 问题 1：WASM 文件加载失败

**症状**：控制台显示 "CoolProp 加载失败"

**排查步骤**：
1. 检查 Network 标签，查看 WASM 请求的状态码
2. 如果是 404，检查 `vercel.json` 配置
3. 如果是 CORS 错误，检查响应头

### ❌ 问题 2：加载仍然很慢

**症状**：WASM 文件加载时间超过 30 秒

**排查步骤**：
1. 检查网络连接速度
2. 检查 Vercel 部署区域（应该在亚洲有节点）
3. 清除浏览器缓存后重试
4. 检查是否有其他网络问题

### ❌ 问题 3：计算功能不工作

**症状**：点击计算按钮没有反应或报错

**排查步骤**：
1. 检查控制台是否有错误信息
2. 确认 CoolProp 已成功加载（查看控制台日志）
3. 检查输入参数是否有效

---

## 验证成功标准

✅ **所有以下条件都满足时，验证成功：**

1. ✅ WASM 文件在 30 秒内加载完成
2. ✅ 控制台显示 "CoolProp loaded successfully"
3. ✅ 流体信息正常显示（不是 "Loading..."）
4. ✅ 计算按钮可以点击（不是禁用状态）
5. ✅ 计算功能正常工作，能返回结果
6. ✅ HTTP 响应头包含正确的缓存策略
7. ✅ 第二次访问时，WASM 从缓存加载（瞬时）

---

## 下一步

验证成功后：

1. **更新文档**：更新 README 或文档中的部署链接
2. **分享链接**：使用新的 Vercel URL 分享应用
3. **监控性能**：可以启用 Vercel Analytics 监控性能
4. **配置域名**（可选）：如果需要，可以配置自定义域名

---

**如果遇到任何问题，请记录错误信息并告诉我，我会帮您解决！**

