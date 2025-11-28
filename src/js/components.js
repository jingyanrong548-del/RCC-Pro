// =====================================================================
// components.js: Apple-style UI 组件工厂
// 职责: 生成标准化的 HTML 字符串，用于构建结果面板
// =====================================================================

/**
 * 生成一个主要的 KPI 数据卡片 (用于显示 COP, 功率等核心指标)
 * @param {string} title - 标题 (如 "制冷量")
 * @param {string|number} value - 数值 (如 "125.5")
 * @param {string} unit - 单位 (如 "kW")
 * @param {string} [subtext] - 底部小字说明 (可选)
 * @param {string} [accentColor] - 强调色 'blue' | 'green' | 'orange' | 'default'
 */
export function createKpiCard(title, value, unit, subtext = '', accentColor = 'default') {
    const colorMap = {
        default: 'text-gray-900',
        blue: 'text-blue-600',
        green: 'text-emerald-600',
        orange: 'text-orange-600',
        teal: 'text-teal-600'
    };
    const textColor = colorMap[accentColor] || colorMap.default;

    return `
    <div class="bg-white/60 p-4 rounded-2xl border border-white/50 shadow-sm flex flex-col justify-between">
        <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">${title}</span>
        <div class="mt-2 flex items-baseline">
            <span class="text-3xl font-bold tracking-tight ${textColor}">${value}</span>
            <span class="ml-1 text-sm font-medium text-gray-500">${unit}</span>
        </div>
        ${subtext ? `<div class="mt-2 text-xs text-gray-400 font-medium">${subtext}</div>` : ''}
    </div>
    `;
}

/**
 * 生成一个详细数据行 (用于列表展示)
 * @param {string} label - 标签
 * @param {string} value - 数值文本
 * @param {boolean} [isHighlight] - 是否高亮背景
 */
export function createDetailRow(label, value, isHighlight = false) {
    const bgClass = isHighlight ? 'bg-blue-50/50 rounded-lg -mx-2 px-2 py-1' : 'py-1';
    return `
    <div class="flex justify-between items-center text-sm ${bgClass}">
        <span class="text-gray-500">${label}</span>
        <span class="font-medium font-mono text-gray-800">${value}</span>
    </div>
    `;
}

/**
 * 生成分节标题
 * @param {string} title 
 * @param {string} [icon] - Emoji 或简单的 SVG 图标字符串 (可选)
 */
export function createSectionHeader(title, icon = '') {
    return `
    <div class="flex items-center space-x-2 mb-3 mt-6 pb-2 border-b border-gray-100/80">
        ${icon ? `<span class="text-base grayscale opacity-80">${icon}</span>` : ''}
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest">${title}</h4>
    </div>
    `;
}

/**
 * 生成错误提示卡片
 * @param {string} message 
 */
export function createErrorCard(message) {
    return `
    <div class="p-4 rounded-2xl bg-red-50/80 border border-red-100 text-red-800 backdrop-blur-sm shadow-sm flex items-start gap-3">
        <svg class="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <div>
            <h3 class="text-sm font-bold">计算中断</h3>
            <p class="text-xs mt-1 opacity-90 leading-relaxed">${message}</p>
        </div>
    </div>
    `;
}

/**
 * 生成经济器对比胶囊 (Badge)
 * @param {number} percentage - 提升百分比
 */
export function createEcoBadge(percentage) {
    if (percentage <= 0) return '';
    return `
    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 ml-2">
        <svg class="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        提升 ${percentage.toFixed(1)}%
    </span>
    `;
}