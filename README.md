# RCC Pro - 活塞压缩机计算器

**开启活塞压缩机计算** - 专业的 GEA Grasso 活塞压缩机性能计算工具

## 概述

RCC Pro 是一个基于 Web 的活塞压缩机性能计算应用，支持多种制冷循环模式和气体压缩场景。应用使用 CoolProp 物性库进行精确的热力学计算。

## 主要功能

### 制冷热泵模式
- **单级制冷/热泵** (Mode 2)
- **复叠循环** (Mode 4)
- **单机双级** (Mode 5)
- **双机双级** (Mode 6)
- **氨热泵** (Mode 7)

### 气体压缩模式
- **单级气体压缩** (Mode 3)
- **双级气体压缩** (Mode 3 Two-Stage)

## 技术特性

- ✅ 基于 GEA Grasso V 系列活塞压缩机数据
- ✅ 支持容积效率计算（基于余隙容积）
- ✅ 基于转速的扫气量线性插值
- ✅ 等熵效率计算
- ✅ 润滑系统油冷计算（仅摩擦热）
- ✅ 多语言支持（中文/英文）
- ✅ 响应式设计，支持移动端和桌面端
- ✅ 项目历史记录保存

## 压缩机数据库

支持 GEA Grasso 系列：
- Grasso 5HP (50 bar) - 支持 R744, R717
- Grasso V (25 bar) - 支持 R717
- Grasso V HP (39 bar Heat Pump) - 支持 R717
- Grasso V XHP (63 bar High Temp) - 支持 R717

## 技术栈

- **前端框架**: Vite + Vanilla JavaScript
- **物性库**: CoolProp (WebAssembly)
- **UI 框架**: Tailwind CSS
- **图表**: Chart.js
- **部署**: Vercel

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build
```

## 部署

项目已配置 Vercel 部署，支持自动构建和部署。

## 许可证

MIT License

## 版本

当前版本: RCC Pro v7.2.21

