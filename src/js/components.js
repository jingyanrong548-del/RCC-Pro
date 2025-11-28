// =====================================================================
// components.js: Apple-style UI 组件工厂 (v3.3 流量版)
// 职责: 生成标准化 HTML 片段，支持 5 列状态点详表
// =====================================================================

/**
 * 生成 KPI 核心指标卡片
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
    <div class="bg-white/60 p-4 rounded-2xl border border-white/50 shadow-sm flex flex-col justify-between transition-all hover:bg-white/80">
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
 * 生成详细数据行 (Key-Value List)
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
 */
export function createErrorCard(message) {
    return `
    <div class="p-4 rounded-2xl bg-red-50/80 border border-red-100 text-red-800 backdrop-blur-sm shadow-sm flex items-start gap-3 animate-fade-in">
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
 * 生成 ECO 提升率胶囊
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

/**
 * [New] 生成状态点数据表格 (State Points Table - 5 Columns)
 * @param {Array} points - 状态点对象数组 [{ name, desc, temp, press, enth, flow }]
 */
export function createStateTable(points) {
    if (!points || points.length === 0) return '';

    // 生成行
    const rows = points.map((p, index) => {
        // 斑马纹背景
        const bgClass = index % 2 === 0 ? 'bg-white/40' : 'bg-transparent';
        // 特殊标记：如果有点位名称包含 ECO，可以加点颜色提示 (可选)
        const rowStyle = p.name.includes('ECO') ? 'font-medium text-blue-900' : 'text-gray-600';

        return `
        <tr class="${bgClass} text-xs transition-colors hover:bg-white/60">
            <td class="py-2 pl-3 font-semibold text-gray-700 whitespace-nowrap">
                ${p.name}
                ${p.desc ? `<div class="text-[9px] text-gray-400 font-normal font-sans tracking-tight">${p.desc}</div>` : ''}
            </td>
            <td class="py-2 text-right font-mono ${rowStyle} tracking-tight">${p.temp}</td>
            <td class="py-2 text-right font-mono ${rowStyle} tracking-tight">${p.press}</td>
            <td class="py-2 text-right font-mono ${rowStyle} tracking-tight hidden sm:table-cell">${p.enth}</td> <td class="py-2 pr-3 text-right font-mono font-bold text-gray-800 tracking-tight">${p.flow}</td>
        </tr>
        `;
    }).join('');

    // 返回完整表格 HTML
    // 注意：表头添加了 "m (kg/s)"
    // 手机端通过 'hidden sm:table-cell' 隐藏焓值列，保证流量列可见
    return `
    <div class="overflow-x-auto rounded-xl border border-white/40 shadow-sm bg-gray-50/20 backdrop-blur-sm mt-4 no-scrollbar">
        <table class="min-w-full">
            <thead>
                <tr class="border-b border-gray-200/50 bg-gray-100/40 text-left text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                    <th class="py-2 pl-3">Point</th>
                    <th class="py-2 text-right">T(°C)</th>
                    <th class="py-2 text-right">P(bar)</th>
                    <th class="py-2 text-right hidden sm:table-cell">h(kJ)</th>
                    <th class="py-2 pr-3 text-right">m(kg/s)</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100/30">
                ${rows}
            </tbody>
        </table>
    </div>
    `;
}