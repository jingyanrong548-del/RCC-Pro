// =====================================================================
// charts.js: 可视化引擎 (v3.4 Label Formatter Fix)
// 职责: 修复 Label 格式化问题，确保所有点（包括ECO）都只显示数字名称
// =====================================================================

import * as echarts from 'echarts';

const chartInstances = {};

const COLORS = {
    primary: '#14B8A6',   // Teal (主循环)
    ecoLiquid: '#F97316', // Orange (ECO液路)
    ecoVapor: '#3B82F6',  // Blue (ECO气路)
    grid: '#E5E7EB',
    text: '#6B7280',
    bgTooltip: 'rgba(255, 255, 255, 0.95)'
};

function getChartInstance(domId) {
    const dom = document.getElementById(domId);
    if (!dom) return null;
    if (!chartInstances[domId]) {
        chartInstances[domId] = echarts.init(dom, null, { renderer: 'canvas' });
        window.addEventListener('resize', () => {
            chartInstances[domId] && chartInstances[domId].resize();
        });
    }
    return chartInstances[domId];
}

export function drawPHDiagram(domId, data) {
    const chart = getChartInstance(domId);
    if (!chart) return;

    const container = document.getElementById(domId);
    if (container && container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        chart.resize();
    }

    const { 
        mainPoints, 
        ecoLiquidPoints = [], 
        ecoVaporPoints = [],
        title = 'Thermodynamic Cycle',
        xLabel = 'Enthalpy (kJ/kg)',
        yLabel = 'Pressure (bar)'
    } = data;

    // Helper: Extract Y values for scaling
    const extractY = (arr) => arr.map(p => Array.isArray(p) ? p[1] : p.value[1]).filter(y => y > 0);
    const allY = [...extractY(mainPoints), ...extractY(ecoLiquidPoints), ...extractY(ecoVaporPoints)];
    
    let minY = 1, maxY = 100;
    if (allY.length > 0) {
        minY = Math.min(...allY) * 0.7;
        maxY = Math.max(...allY) * 1.3;
    }

    // [Critical Fix] 定义通用的 Label 样式对象
    // 确保 formatter 始终显示 param.name (即 "1", "2" 等)，而不是数值
    const labelStyle = {
        show: false, // 默认不显示，由数据点单独覆盖开启
        formatter: (param) => param.name, 
        color: '#111827',
        fontSize: 11,
        fontWeight: 'bold',
        fontFamily: 'Inter',
        backgroundColor: 'rgba(255,255,255,0.8)',
        borderRadius: 3,
        padding: [2, 4],
        distance: 6
    };

    const option = {
        title: {
            text: title,
            left: 'center',
            textStyle: { fontFamily: 'Inter, sans-serif', fontSize: 12, color: COLORS.text, fontWeight: 'normal' },
            top: 5
        },
        tooltip: {
            trigger: 'axis',
            backgroundColor: COLORS.bgTooltip,
            backdropFilter: 'blur(4px)',
            formatter: (params) => {
                let html = `<div class="font-bold mb-1 border-b pb-1 text-xs">${params[0].axisValueLabel} kJ/kg</div>`;
                params.forEach(item => {
                    const val = item.data.value ? item.data.value[1] : item.data[1];
                    const name = item.name ? `[${item.name}] ` : '';
                    if (val) {
                        html += `<div class="flex justify-between gap-3 text-xs mt-1">
                            <span>${item.marker} ${name}${item.seriesName}</span>
                            <span class="font-mono font-bold">${val.toFixed(2)} bar</span>
                        </div>`;
                    }
                });
                return html;
            }
        },
        grid: { top: 35, right: 40, bottom: 25, left: 55, show: false },
        xAxis: {
            type: 'value',
            name: xLabel,
            nameLocation: 'middle',
            nameGap: 25,
            axisLine: { show: false },
            splitLine: { show: true, lineStyle: { type: 'dashed', color: COLORS.grid } },
            axisLabel: { color: COLORS.text, fontSize: 10 },
            scale: true
        },
        yAxis: {
            type: 'log',
            name: yLabel,
            min: minY,
            max: maxY,
            axisLine: { show: false },
            splitLine: { show: true, lineStyle: { type: 'dashed', color: COLORS.grid } },
            axisLabel: { color: COLORS.text, fontSize: 10, formatter: v => v < 1 ? v.toFixed(2) : v.toFixed(0) },
            logBase: 10,
            minorSplitLine: { show: false }
        },
        series: [
            {
                name: 'Main Cycle',
                type: 'line',
                data: mainPoints,
                smooth: 0,
                symbol: 'circle',
                symbolSize: 6,
                // 主循环默认开启 Label
                label: { ...labelStyle, show: true }, 
                itemStyle: { color: COLORS.primary },
                lineStyle: { width: 2.5, color: COLORS.primary },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(20, 184, 166, 0.2)' },
                        { offset: 1, color: 'rgba(20, 184, 166, 0.0)' }
                    ])
                },
                z: 10
            },
            {
                name: 'Aux/Liquid',
                type: 'line',
                data: ecoLiquidPoints,
                smooth: 0,
                symbol: 'circle',
                symbolSize: 4,
                lineStyle: { width: 2, type: 'dashed', color: COLORS.ecoLiquid },
                itemStyle: { color: COLORS.ecoLiquid },
                // 辅助线默认关闭 Label，但在 modeX.js 中通过数据点属性强制开启时，必须应用正确的 formatter
                label: labelStyle, 
                z: 5
            },
            {
                name: 'Injection',
                type: 'line',
                data: ecoVaporPoints,
                smooth: 0,
                symbol: 'triangle',
                symbolSize: 5,
                itemStyle: { color: COLORS.ecoVapor },
                lineStyle: { width: 2, type: 'dotted', color: COLORS.ecoVapor },
                // 同上，确保补气点也使用 formatter
                label: labelStyle,
                z: 6
            }
        ],
        animationDuration: 500
    };

    chart.setOption(option);
}

export function resizeAllCharts() {
    Object.keys(chartInstances).forEach(id => chartInstances[id].resize());
}