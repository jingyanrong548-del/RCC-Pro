# 快速验证步骤

## 访问链接
https://oil-injected-compressor-calculator.vercel.app/

## 验证步骤

### 1. 检查 WASM 文件加载速度（最重要）

1. 打开链接：https://oil-injected-compressor-calculator.vercel.app/
2. 按 `F12` 打开开发者工具
3. 切换到 **"Network"（网络）** 标签
4. 在过滤框中输入 `wasm`，只显示 WASM 文件
5. 刷新页面（`F5`）
6. 找到 `coolprop.wasm` 文件，查看加载时间

**预期结果**：
- ✅ 加载时间：5-30 秒（不再是几小时！）
- ✅ 文件大小：约 6.6 MB
- ✅ 状态码：200 OK

### 2. 检查控制台日志

1. 在开发者工具中，切换到 **"Console"（控制台）** 标签
2. 查看是否有以下日志：

**应该看到**：
```
[CoolProp] Starting load sequence...
[CoolProp] Environment Base URL: /
[CoolProp] Requesting WASM at: /coolprop.wasm
[CoolProp] WASM initialized successfully.
CoolProp loaded successfully.
```

**如果看到错误**：
- ❌ "CoolProp 加载失败" - 需要检查网络或配置
- ❌ 404 错误 - WASM 文件未找到

### 3. 检查应用状态

**当前状态**（从网页内容看）：
- 页面已加载 ✅
- 显示 "--- 加载中 ---" ⚠️（说明 CoolProp 正在加载）

**等待加载完成后，应该看到**：
- ✅ 工质信息正常显示（不是 "--- 加载中 ---"）
- ✅ 显示工质的 GWP、ODP、临界温度等信息
- ✅ 计算按钮可以点击（不是禁用状态）

### 4. 测试计算功能

1. 等待 CoolProp 加载完成（工质信息显示后）
2. 输入参数：
   - 运行转速：2900
   - 排量：437.5
   - 蒸发温度：50
   - 冷凝温度：125
3. 点击 **"Calculate Performance"** 按钮
4. **应该看到**：计算结果正常显示

### 5. 验证缓存策略

1. 在 Network 标签中，点击 `coolprop.wasm` 请求
2. 查看 **"Headers"** 标签
3. 滚动到 **"Response Headers"** 部分
4. **应该看到**：
   ```
   Cache-Control: public, max-age=31536000, immutable
   Content-Type: application/wasm
   ```

### 6. 测试第二次访问（验证缓存）

1. 关闭浏览器标签页
2. 重新打开链接
3. 在 Network 标签中查看 `coolprop.wasm`
4. **应该看到**：
   - 来源：`disk cache` 或 `memory cache`
   - 加载时间：接近 0 秒（瞬时加载）✅

## 性能对比

| 指标 | GitHub Pages（旧） | Vercel（新） |
|------|-------------------|-------------|
| 首次加载 | 几小时 ❌ | 几秒到几十秒 ✅ |
| 缓存后加载 | 仍然很慢 ❌ | 瞬时 ✅ |
| CDN 性能 | 一般 | 优秀 ✅ |

## 验证成功标准

✅ **所有以下条件都满足时，验证成功：**

1. ✅ WASM 文件在 30 秒内加载完成
2. ✅ 控制台显示 "CoolProp loaded successfully"
3. ✅ 工质信息正常显示（不是 "--- 加载中 ---"）
4. ✅ 计算功能正常工作
5. ✅ 第二次访问时，WASM 从缓存加载（瞬时）

## 如果遇到问题

### 问题 1：仍然显示 "--- 加载中 ---"
- **原因**：CoolProp 还在加载中
- **解决**：等待 10-30 秒，查看控制台日志

### 问题 2：WASM 加载很慢（超过 1 分钟）
- **原因**：网络问题或 Vercel 配置问题
- **解决**：检查 Network 标签中的错误信息

### 问题 3：计算按钮被禁用
- **原因**：CoolProp 加载失败
- **解决**：查看控制台错误信息，检查网络连接

