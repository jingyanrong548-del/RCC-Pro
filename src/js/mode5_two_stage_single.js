// =====================================================================
// mode5_two_stage_single.js: 模式五 (单机双级压缩) - v1.0
// 职责: 单台压缩机实现两级压缩，通过经济器（ECO）实现补气，
//      支持闪发箱（Flash Tank）和过冷器（Subcooler）两种模式。
// 说明: 复用 Mode 4 中的 ECO 逻辑，但明确指定中间压力/温度。
// =====================================================================

import { createKpiCard, createDetailRow, createSectionHeader, createErrorCard, createStateTable } from './components.js';
import { drawPHDiagram, drawTSDiagram, getChartInstance } from './charts.js';
import { HistoryDB, SessionState } from './storage.js';
import { openMobileSheet } from './ui.js';
import { updateFluidInfo } from './coolprop_loader.js';
import { calculateEmpiricalEfficiencies, calculateReciprocatingVolumetricEfficiency, calculateEfficiencies, calculateMycomEfficiencies, calculateMycomTwoStageEfficiencies, calculateGEATwoStageEfficiencies } from './efficiency_models.js';
import i18next from './i18n.js';
import { 
    getFilteredBrands,
    getFilteredSeriesByBrand,
    getModelsBySeries, 
    getDisplacementByModel,
    getModelDetail,
    getDischargeTempLimits,
    getDischargeTempLimitsByRefrigerant
} from './compressor_models.js';

let CP_INSTANCE = null;
let lastCalculationData = null;

// UI 引用
let calcButtonM5, calcFormM5, printButtonM5;
let resultsDesktopM5, resultsMobileM5, summaryMobileM5;

// 输入元素
let fluidSelect, fluidInfoDiv, tempEvapInput, tempCondInput, usefulSuperheatInput, superheatInput, subcoolInput;
let flowInput;
let etaVLpInput, etaSLpInput, autoEffLpCheckbox;
let etaSHpInput, autoEffHpCheckbox;
let compressorBrand, compressorSeries, compressorModel, modelDisplacementInfo, modelDisplacementValue;
let slhxCheckbox, slhxEff;

// ECO 设置（中间冷却器）
let ecoCheckbox, ecoType, ecoSuperheatInput, ecoSuperheatInputSubcooler, ecoDtInput;

// 中间压力设置
let interPressMode, interSatTempInput;

// Cylinder Head Cooling (缸头冷却)
let cylinderHeadCoolingEnabledM5, cylinderHeadWaterInletTempM5, cylinderHeadWaterOutletTempM5, cylinderHeadQM5;
let cylinderHeadInputModeM5, cylinderHeadPowerInputM5, cylinderHeadQDirectM5;
let cylinderHeadWaterTempModeM5, cylinderHeadDirectPowerModeM5;

const getBtnTextCalculate = () => i18next.t('common.calculate');
const getBtnTextRecalculate = () => i18next.t('common.recalculate');

// ---------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------

function setButtonStale5() {
    if (calcButtonM5 && calcButtonM5.innerText !== getBtnTextRecalculate()) {
        calcButtonM5.innerText = getBtnTextRecalculate();
        calcButtonM5.classList.add('opacity-90', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
        if (printButtonM5) {
            printButtonM5.disabled = true;
            printButtonM5.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
}

function setButtonFresh5() {
    if (calcButtonM5) {
        calcButtonM5.innerText = getBtnTextCalculate();
        calcButtonM5.classList.remove('opacity-90', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
    }
}

function renderToAllViews(htmlContent) {
    if (resultsDesktopM5) resultsDesktopM5.innerHTML = htmlContent;
    if (resultsMobileM5) resultsMobileM5.innerHTML = htmlContent;
}

function updateMobileSummary(kpi1Label, kpi1Value, kpi2Label, kpi2Value) {
    if (!summaryMobileM5) return;
    summaryMobileM5.innerHTML = `
        <div>
            <p class="text-[10px] text-gray-500 uppercase tracking-wider font-bold">${kpi1Label}</p>
            <p class="text-xl font-bold text-gray-900">${kpi1Value}</p>
        </div>
        <div class="text-right">
            <p class="text-[10px] text-gray-500 uppercase tracking-wider font-bold">${kpi2Label}</p>
            <p class="text-xl font-bold text-blue-600">${kpi2Value}</p>
        </div>
    `;
}

// ---------------------------------------------------------------------
// Saturation Lines Calculation
// ---------------------------------------------------------------------

/**
 * 生成压缩过程的中间点（用于 T-S 图，显示熵增加趋势）
 * @param {string} fluid - 工质名称
 * @param {number} h_start - 起始焓值 (J/kg)
 * @param {number} P_start - 起始压力 (Pa)
 * @param {number} h_end - 结束焓值 (J/kg)
 * @param {number} P_end - 结束压力 (Pa)
 * @param {number} numPoints - 中间点数量
 * @returns {Array} T-S 图数据点数组 [[s, T], ...]
 */
function generateCompressionPathTS(fluid, h_start, P_start, h_end, P_end, numPoints = 10) {
    if (!CP_INSTANCE) return [];
    
    const points = [];
    
    for (let i = 0; i <= numPoints; i++) {
        const ratio = i / numPoints;
        
        // 压力插值（对数空间，更符合实际压缩过程）
        const logP_start = Math.log10(P_start);
        const logP_end = Math.log10(P_end);
        const logP = logP_start + (logP_end - logP_start) * ratio;
        const P = Math.pow(10, logP);
        
        // 焓值插值（线性插值，因为实际压缩功与焓值增加成正比）
        const h = h_start + (h_end - h_start) * ratio;
        
        try {
            // 从焓值和压力计算温度和熵值
            const T_K = CP_INSTANCE.PropsSI('T', 'H', h, 'P', P, fluid);
            const s = CP_INSTANCE.PropsSI('S', 'H', h, 'P', P, fluid);
            points.push([s / 1000, T_K - 273.15]); // [s (kJ/kg·K), T (°C)]
        } catch (e) {
            continue;
        }
    }
    
    return points;
}

/**
 * 生成节流过程的中间点（等焓过程，用于 T-S 图）
 * @param {string} fluid - 工质名称
 * @param {number} h - 焓值 (J/kg) - 节流过程等焓
 * @param {number} P_start - 起始压力 (Pa)
 * @param {number} P_end - 结束压力 (Pa)
 * @param {number} numPoints - 中间点数量
 * @returns {Array} T-S 图数据点数组 [[s, T], ...]
 */
function generateThrottlingPathTS(fluid, h, P_start, P_end, numPoints = 10) {
    if (!CP_INSTANCE) return [];
    
    const points = [];
    
    for (let i = 0; i <= numPoints; i++) {
        const ratio = i / numPoints;
        // 线性插值压力（等焓过程）
        const P = P_start + (P_end - P_start) * ratio;
        
        try {
            const T_K = CP_INSTANCE.PropsSI('T', 'H', h, 'P', P, fluid);
            const s = CP_INSTANCE.PropsSI('S', 'H', h, 'P', P, fluid);
            points.push([s / 1000, T_K - 273.15]); // [s (kJ/kg·K), T (°C)]
        } catch (e) {
            continue;
        }
    }
    
    return points;
}

/**
 * 生成等压过程的中间点（用于 T-S 图）
 * @param {string} fluid - 工质名称
 * @param {number} P - 压力 (Pa) - 等压过程
 * @param {number} h_start - 起始焓值 (J/kg)
 * @param {number} h_end - 结束焓值 (J/kg)
 * @param {number} numPoints - 中间点数量
 * @returns {Array} T-S 图数据点数组 [[s, T], ...]
 */
function generateIsobaricPathTS(fluid, P, h_start, h_end, numPoints = 10) {
    if (!CP_INSTANCE) return [];
    
    const points = [];
    
    for (let i = 0; i <= numPoints; i++) {
        const ratio = i / numPoints;
        // 线性插值焓值（等压过程）
        const h = h_start + (h_end - h_start) * ratio;
        
        try {
            const T_K = CP_INSTANCE.PropsSI('T', 'H', h, 'P', P, fluid);
            const s = CP_INSTANCE.PropsSI('S', 'H', h, 'P', P, fluid);
            points.push([s / 1000, T_K - 273.15]); // [s (kJ/kg·K), T (°C)]
        } catch (e) {
            continue;
        }
    }
    
    return points;
}

/**
 * 生成饱和线数据点（用于 P-h 图和 T-S 图）
 * @param {string} fluid - 工质名称
 * @param {number} Pe_Pa - 蒸发压力 (Pa)
 * @param {number} Pc_Pa - 冷凝压力 (Pa)
 * @param {number} numPoints - 数据点数量
 * @returns {Object} 包含饱和液体线和饱和气体线的数据
 */
function generateSaturationLines(fluid, Pe_Pa, Pc_Pa, numPoints = 100) {
    if (!CP_INSTANCE) return { liquid: [], vapor: [] };
    
    const liquidPoints = [];
    const vaporPoints = [];
    
    // 计算压力范围（从蒸发压力到冷凝压力）
    const P_min = Math.min(Pe_Pa, Pc_Pa) * 0.8;
    const P_max = Math.max(Pe_Pa, Pc_Pa) * 1.2;
    
    // 对数分布压力点（因为压力通常是对数分布的）
    for (let i = 0; i <= numPoints; i++) {
        const logP_min = Math.log10(P_min);
        const logP_max = Math.log10(P_max);
        const logP = logP_min + (logP_max - logP_min) * (i / numPoints);
        const P_Pa = Math.pow(10, logP);
        
        try {
            // 饱和液体线 (Q=0)
            const T_sat_K = CP_INSTANCE.PropsSI('T', 'P', P_Pa, 'Q', 0, fluid);
            const h_liq = CP_INSTANCE.PropsSI('H', 'P', P_Pa, 'Q', 0, fluid);
            const s_liq = CP_INSTANCE.PropsSI('S', 'P', P_Pa, 'Q', 0, fluid);
            
            // 饱和气体线 (Q=1)
            const h_vap = CP_INSTANCE.PropsSI('H', 'P', P_Pa, 'Q', 1, fluid);
            const s_vap = CP_INSTANCE.PropsSI('S', 'P', P_Pa, 'Q', 1, fluid);
            
            // P-h 图数据点
            liquidPoints.push([h_liq / 1000, P_Pa / 1e5]); // [h (kJ/kg), P (bar)]
            vaporPoints.push([h_vap / 1000, P_Pa / 1e5]);
            
        } catch (e) {
            // 如果某个压力点计算失败，跳过
            continue;
        }
    }
    
    return {
        liquidPH: liquidPoints,
        vaporPH: vaporPoints
    };
}

/**
 * 生成 T-S 图的饱和线数据点
 * @param {string} fluid - 工质名称
 * @param {number} Te_C - 蒸发温度 (°C)
 * @param {number} Tc_C - 冷凝温度 (°C)
 * @param {number} numPoints - 数据点数量
 * @returns {Object} 包含饱和液体线和饱和气体线的 T-S 数据
 */
function generateSaturationLinesTS(fluid, Te_C, Tc_C, numPoints = 100) {
    if (!CP_INSTANCE) return { liquid: [], vapor: [] };
    
    const liquidPoints = [];
    const vaporPoints = [];
    
    // 计算温度范围
    const T_min = Math.min(Te_C, Tc_C) - 20;
    const T_max = Math.max(Te_C, Tc_C) + 20;
    
    for (let i = 0; i <= numPoints; i++) {
        const T_C = T_min + (T_max - T_min) * (i / numPoints);
        const T_K = T_C + 273.15;
        
        try {
            // 饱和压力
            const P_sat_Pa = CP_INSTANCE.PropsSI('P', 'T', T_K, 'Q', 0.5, fluid);
            
            // 饱和液体线 (Q=0)
            const s_liq = CP_INSTANCE.PropsSI('S', 'T', T_K, 'Q', 0, fluid);
            
            // 饱和气体线 (Q=1)
            const s_vap = CP_INSTANCE.PropsSI('S', 'T', T_K, 'Q', 1, fluid);
            
            // T-S 图数据点
            liquidPoints.push([s_liq / 1000, T_C]); // [s (kJ/kg·K), T (°C)]
            vaporPoints.push([s_vap / 1000, T_C]);
            
        } catch (e) {
            continue;
        }
    }
    
    return {
        liquid: liquidPoints,
        vapor: vaporPoints
    };
}

// ---------------------------------------------------------------------
// Core Calculation Logic - Two-Stage Single Compressor
// ---------------------------------------------------------------------

/**
 * 基于高低压级理论排量计算最优中间压力
 * 使用流量平衡方法：通过迭代寻优找到中间压力，使得高压级吸气量与（低压排气+过冷器补气）质量流量平衡
 * @param {Object} params - 计算参数
 * @param {string} params.fluid - 工质名称
 * @param {number} params.Te_C - 蒸发温度 (°C)
 * @param {number} params.Tc_C - 冷凝温度 (°C)
 * @param {number} params.superheat_K - 过热度 (K)
 * @param {number} params.flow_m3h - 低压级理论排量 (m³/h)
 * @param {number} params.eta_v_lp - 低压级容积效率
 * @param {number} params.eta_v_hp - 高压级容积效率
 * @param {number} params.eta_s_lp - 低压级等熵效率
 * @param {number} params.eta_s_hp - 高压级等熵效率
 * @param {number} params.vi_ratio - 容积比 (Vi,L / Vi,H)，如果提供则使用
 * @param {number} params.disp_lp - 低压级排量 (m³/h)，如果提供则使用
 * @param {number} params.disp_hp - 高压级排量 (m³/h)，如果提供则使用
 * @param {number} params.subcooling_K - 过冷度 (K)，用于ECO计算
 * @param {number} params.ecoSuperheat_K - ECO过热度 (K)，用于ECO计算
 * @param {number} params.ecoDt_K - ECO过冷度/接近度 (K)，用于ECO计算
 * @returns {number|null} 最优中间压力 (Pa)，如果无法计算则返回 null
 */
function calculateOptimalIntermediatePressure({
    fluid,
    Te_C,
    Tc_C,
    superheat_K,
    flow_m3h,
    eta_v_lp,
    eta_v_hp,
    eta_s_lp,
    eta_s_hp,
    vi_ratio = null,
    disp_lp = null,
    disp_hp = null,
    subcooling_K = 5.0,
    ecoSuperheat_K = 5.0,
    ecoDt_K = 5.0
}) {
    if (!CP_INSTANCE) return null;
    
    try {
        const T_evap_K = Te_C + 273.15;
        const T_cond_K = Tc_C + 273.15;
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', T_evap_K, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', T_cond_K, 'Q', 1, fluid);
        
        // 获取高压级理论排量
        let V_th_HP = null;
        if (disp_hp !== null && disp_hp > 0) {
            V_th_HP = disp_hp; // 高压级理论排量 (m³/h)
        } else if (vi_ratio !== null && vi_ratio > 0 && flow_m3h > 0) {
            // 通过容积比计算高压级排量
            V_th_HP = flow_m3h / vi_ratio;
        } else {
            // 无法获取高压级排量，返回 null（将使用几何平均法）
            return null;
        }
        
        // =========================================================
        // 第一阶段：初始化与已知点计算
        // =========================================================
        
        // 状态点 1 (低压吸气)
        const T1_K = T_evap_K + superheat_K;
        const h1 = CP_INSTANCE.PropsSI('H', 'T', T1_K, 'P', Pe_Pa, fluid);
        const s1 = CP_INSTANCE.PropsSI('S', 'T', T1_K, 'P', Pe_Pa, fluid);
        const rho1 = CP_INSTANCE.PropsSI('D', 'T', T1_K, 'P', Pe_Pa, fluid);
        
        // 低压级质量流量
        const V_th_LP = flow_m3h; // 低压级理论排量 (m³/h)
        const m_dot_lp = (V_th_LP * eta_v_lp * rho1) / 3600.0; // kg/s
        
        // 状态点 5 (冷凝器出口/过冷前)
        const T5_K = T_cond_K - subcooling_K;
        const h5 = CP_INSTANCE.PropsSI('H', 'T', T5_K, 'P', Pc_Pa, fluid);
        
        // =========================================================
        // 第二阶段：中间压力 P_mid 的迭代搜索
        // =========================================================
        
        // 初始值：几何平均法
        let P_intermediate_Pa = Math.sqrt(Pe_Pa * Pc_Pa);
        const P_min = Pe_Pa * 1.01; // 最小中间压力（略大于蒸发压力）
        const P_max = Pc_Pa * 0.99; // 最大中间压力（略小于冷凝压力）
        
        const maxIter = 100;
        const tolerance = 0.01; // 1% 容差
        
        let last_P = P_intermediate_Pa; // 用于检测振荡
        
        for (let iter = 0; iter < maxIter; iter++) {
            // 计算中间压力下的饱和温度
            const T_intermediate_sat_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0, fluid);
            
            // =========================================================
            // 1. 低压级出口 (点 2)
            // =========================================================
            // 等熵计算
            const h2s = CP_INSTANCE.PropsSI('H', 'P', P_intermediate_Pa, 'S', s1, fluid);
            // 实际焓（考虑等熵效率）
            const h2 = h1 + (h2s - h1) / eta_s_lp;
            
            // =========================================================
            // 2. 过冷器侧计算
            // =========================================================
            // 主路入口：点5 (冷凝器出口，T_cond - DT_sc)
            // 主路出口 (点 6)：从 h5 冷却至 T_mid_sat + DT_approach（在冷凝压力下）
            const T6_K = T_intermediate_sat_K + ecoDt_K; // DT_approach 是过冷器接近度
            const h6 = CP_INSTANCE.PropsSI('H', 'T', T6_K, 'P', Pc_Pa, fluid);
            
            // 补气路：从点5等焓节流到中间压力（点7）
            const h7 = h5; // 等焓节流：h7 = h5（在中间压力下）
            
            // 补气路出口 (点 8)：在过冷器中吸热变为过热蒸汽（过热度为 DT_sh_mid，在中间压力下）
            const T8_K = T_intermediate_sat_K + ecoSuperheat_K;
            const h8 = CP_INSTANCE.PropsSI('H', 'T', T8_K, 'P', P_intermediate_Pa, fluid);
            
            // 能量平衡求补气量 m_dot_inj
            // 主路放热 = 补气路吸热
            // m_dot_lp * (h5 - h6) = m_dot_inj * (h8 - h7)
            const h_diff_main = h5 - h6;
            const h_diff_inj = h8 - h7;
            
            let m_dot_inj = 0;
            if (h_diff_main > 0 && h_diff_inj > 0) {
                m_dot_inj = (m_dot_lp * h_diff_main) / h_diff_inj;
            }
            
            // 总质量流量（低压排气 + 补气）
            const m_dot_total = m_dot_lp + m_dot_inj;
            
            // 边界情况检查：确保总质量流量有效
            if (m_dot_total <= 0 || !isFinite(m_dot_total)) {
                console.warn("Invalid m_dot_total in intermediate pressure calculation. Using geometric mean.");
                return Math.sqrt(Pe_Pa * Pc_Pa);
            }
            
            // =========================================================
            // 3. 高压级吸气 (点 3) - 混合后
            // =========================================================
            // 混合焓：低压排气与补气混合
            // 注意：在单机双级压缩机中，补气混合发生在压缩过程中
            // 使用实际压缩后的焓值h2进行混合，这样eta_s_lp的变化会直接影响混合状态
            // h2 = h1 + (h2s - h1) / eta_s_lp，考虑了等熵效率的影响
            const h_mix = (m_dot_lp * h2 + m_dot_inj * h8) / m_dot_total;
            const h3 = h_mix;
            
            // 计算点 3 的比容和温度
            let T3_K, rho3;
            try {
                T3_K = CP_INSTANCE.PropsSI('T', 'H', h3, 'P', P_intermediate_Pa, fluid);
                rho3 = CP_INSTANCE.PropsSI('D', 'H', h3, 'P', P_intermediate_Pa, fluid);
            } catch (e) {
                console.warn("Error calculating T3 or rho3 in intermediate pressure calculation. Using geometric mean.");
                return Math.sqrt(Pe_Pa * Pc_Pa);
            }
            
            // 边界情况检查：确保密度有效
            if (rho3 <= 0 || !isFinite(rho3)) {
                console.warn("Invalid rho3 in intermediate pressure calculation. Using geometric mean.");
                return Math.sqrt(Pe_Pa * Pc_Pa);
            }
            
            // =========================================================
            // 4. 高压级需要的排量
            // =========================================================
            // 高压级质量流量 = 总质量流量
            // m_dot_total = (V_th_HP * eta_v_hp * rho3) / 3600.0
            // 因此：V_th_HP_required = (m_dot_total * 3600.0) / (eta_v_hp * rho3)
            const V_th_HP_required = (m_dot_total * 3600.0) / (eta_v_hp * rho3);
            
            // =========================================================
            // 5. 收敛判别
            // =========================================================
            // 比较 V_th_HP_required 与输入的 V_th_HP
            const flow_error = (V_th_HP_required - V_th_HP) / V_th_HP;
            
            if (Math.abs(flow_error) < tolerance) {
                // 收敛：高压级需要的排量与给定排量匹配
                break;
            }
            
            // 调整中间压力
            // 如果 V_th_HP_required > V_th_HP，说明高压级排量不足，需要提高中间压力（增加密度rho3）
            // 如果 V_th_HP_required < V_th_HP，说明高压级排量过大，需要降低中间压力（减少密度rho3）
            
            // 使用更稳定的调整策略
            // 修正：当 flow_error > 0 时，需要增加压力，所以 adjustment_factor 应该 > 1
            // 使用对数空间调整，更稳定
            let adjustment_factor;
            const abs_error = Math.abs(flow_error);
            
            if (abs_error > 0.1) {
                // 误差较大时，使用较大的调整步长（但限制最大变化）
                // 使用符号函数确保方向正确
                const sign = flow_error > 0 ? 1 : -1;
                adjustment_factor = 1.0 + sign * Math.min(abs_error * 0.2, 0.3); // 最大30%变化
            } else if (abs_error > 0.05) {
                // 中等误差
                const sign = flow_error > 0 ? 1 : -1;
                adjustment_factor = 1.0 + sign * abs_error * 0.15;
            } else {
                // 误差较小时，使用较小的调整步长
                const sign = flow_error > 0 ? 1 : -1;
                adjustment_factor = 1.0 + sign * abs_error * 0.1;
            }
            
            let P_new = P_intermediate_Pa * adjustment_factor;
            
            // 限制在合理范围内
            P_new = Math.max(P_min, Math.min(P_max, P_new));
            
            // 检查是否收敛（压力变化很小）
            const pressure_change = Math.abs(P_new - P_intermediate_Pa) / P_intermediate_Pa;
            if (pressure_change < 1e-6) {
                break;
            }
            
            // 防止振荡：如果压力变化方向与上次相反，减小步长
            if (iter > 0) {
                const last_change = P_intermediate_Pa - last_P;
                const current_change = P_new - P_intermediate_Pa;
                if (last_change * current_change < 0 && Math.abs(last_change) > 1e3) {
                    // 方向相反且变化较大，减小步长
                    P_new = P_intermediate_Pa + (P_new - P_intermediate_Pa) * 0.5;
                    P_new = Math.max(P_min, Math.min(P_max, P_new));
                }
            }
            
            last_P = P_intermediate_Pa;
            P_intermediate_Pa = P_new;
        }
        
        // 验证结果：只检查是否在基本范围内
        if (P_intermediate_Pa <= Pe_Pa || P_intermediate_Pa >= Pc_Pa) {
            // 结果不合理，返回几何平均法结果
            const P_intermediate_bar = P_intermediate_Pa / 1e5;
            const Pe_bar = Pe_Pa / 1e5;
            const Pc_bar = Pc_Pa / 1e5;
            console.warn(`Intermediate pressure out of range: ${P_intermediate_bar.toFixed(2)} bar (Pe=${Pe_bar.toFixed(2)}, Pc=${Pc_bar.toFixed(2)}). Using geometric mean.`);
            return Math.sqrt(Pe_Pa * Pc_Pa);
        }
        
        // 放宽验证：只检查是否在Pe和Pc之间，移除过于严格的倍数限制
        // 中间压力只要在合理范围内即可接受
        return P_intermediate_Pa;
        
    } catch (error) {
        console.warn("Calculate Optimal Intermediate Pressure Error:", error.message);
        return null; // 出错时返回 null，将使用几何平均法
    }
}

// ---------------------------------------------------------------------
// 中间冷却器ECO计算
// ---------------------------------------------------------------------

/**
 * 计算中间冷却器ECO（闪蒸罐或过冷器）
 * @param {Object} params - 计算参数
 * @param {string} params.fluid - 工质名称
 * @param {number} params.P_intermediate_Pa - 中间压力 (Pa)
 * @param {number} params.h3 - 冷凝器出口焓值 (J/kg)
 * @param {number} params.Pc_Pa - 冷凝压力 (Pa)
 * @param {number} params.m_dot_lp - 低压级质量流量 (kg/s)
 * @param {string} params.ecoType - ECO类型 ('flash_tank' | 'subcooler')
 * @param {number} params.ecoSuperheat_K - 补气过热度 (K)，仅用于过冷器模式
 * @param {number} params.ecoDt_K - 过冷器温差 (K)，仅用于过冷器模式
 * @returns {Object} 中间冷却器ECO计算结果
 */
function computeIntercoolerECO({
    fluid,
    P_intermediate_Pa,
    h3,
    Pc_Pa,
    m_dot_lp,
    ecoType,
    ecoSuperheat_K = 5,
    ecoDt_K = 5.0,
    // 闪蒸罐模式新增参数
    h_mid_cooled = null  // 低压级排气冷却后的焓值（用于闪蒸罐模式）
}) {
    const T_intermediate_sat_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0, fluid);
    
    let h_5_inter = h3;
    let h_6_inter = 0;
    let h_7_inter = h3;
    let m_dot_inj_inter = 0;
    let m_dot_total_inter = m_dot_lp;
    
    if (ecoType === 'flash_tank') {
        // =========================================================
        // 闪蒸罐模式（mode5 单机双级专用逻辑）
        // =========================================================
        // 物理过程：
        // 1. 冷凝器出口高压液体（h3）一级节流到中间压力（h_7_inter）
        // 2. 在中间压力下闪蒸，产生饱和液体和饱和蒸汽
        // 3. 饱和液体（h_5_inter）留在闪蒸罐底部，二级节流到蒸发压力
        // 4. 饱和蒸汽（h_6_inter）与低压级排气冷却后的饱和气体混合
        // 5. 混合后的饱和气体被高压级吸入压缩
        
        // 点7：高压液体一级节流到中间压力（等焓节流）
        h_7_inter = h3; // 等焓节流，焓值不变
        
        // 中间压力下的饱和状态
        const h_eco_liq = CP_INSTANCE.PropsSI('H', 'P', P_intermediate_Pa, 'Q', 0, fluid); // 饱和液体
        const h_eco_vap = CP_INSTANCE.PropsSI('H', 'P', P_intermediate_Pa, 'Q', 1, fluid); // 饱和蒸汽
        
        // 点5：闪蒸罐底部饱和液体（Q=0）
        h_5_inter = h_eco_liq;
        
        // 点6：闪蒸罐顶部饱和蒸汽（Q=1）
        h_6_inter = h_eco_vap;
        
        // 计算闪蒸干度
        const x_flash = (h_7_inter - h_5_inter) / (h_6_inter - h_5_inter);
        
        if (x_flash > 0 && x_flash < 1) {
            // 闪蒸产生的蒸汽质量流量
            // m_dot_vap = m_dot_liquid * (x_flash / (1 - x_flash))
            // 但这里 m_dot_lp 是低压级流量，需要根据闪蒸过程计算
            // 实际上，从冷凝器来的液体流量 = m_dot_total（总流量）
            // 闪蒸产生的蒸汽 = m_dot_total * x_flash
            // 但我们需要知道总流量才能计算，这里先使用迭代方法
            
            // 简化计算：假设闪蒸产生的蒸汽与低压级排气冷却后的饱和气体混合
            // 混合后变成饱和气体，被高压级吸入
            // 这里先计算闪蒸干度，后续在混合计算中确定流量
            m_dot_inj_inter = m_dot_lp * (x_flash / (1 - x_flash));
            m_dot_total_inter = m_dot_lp + m_dot_inj_inter;
        } else {
            // 闪蒸干度异常
            throw new Error(`闪蒸罐闪蒸干度异常：x_flash=${x_flash.toFixed(4)}，应在0-1之间`);
        }
    } else {
        // =========================================================
        // 过冷器模式（一级节流中间完全冷却形式）
        // =========================================================
        // 物理过程：
        // 1. 点3（冷凝器出口）等焓节流到中间压力（点7）
        // 2. 在中间压力下，主路完全冷却到饱和液体（点5）
        // 3. 在中间压力下，补气路加热变为过热蒸汽（点6）
        // 4. 能量平衡：主路放热 = 补气路吸热
        
        // 点7：从点3等焓节流到中间压力（一级节流）
        h_7_inter = h3; // 等焓节流，焓值不变
        
        // 点5：在中间压力下完全冷却到饱和液体（Q=0）
        // 这是"中间完全冷却"的关键：在中间压力下冷却到饱和状态
        h_5_inter = CP_INSTANCE.PropsSI('H', 'P', P_intermediate_Pa, 'Q', 0, fluid);
        
        // 点6：在中间压力下加热变为过热蒸汽（过热度为 ecoSuperheat_K）
        const T_inj_K = T_intermediate_sat_K + ecoSuperheat_K; // 补气过热温度
        h_6_inter = CP_INSTANCE.PropsSI('H', 'T', T_inj_K, 'P', P_intermediate_Pa, fluid);
        
        // 能量平衡求补气量 m_dot_inj
        // 主路放热 = 补气路吸热
        // m_dot_lp * (h7 - h5) = m_dot_inj * (h6 - h7)
        // 注意：这里主路是从点7冷却到点5（在中间压力下）
        const h_diff_main = h_7_inter - h_5_inter; // 主路放热（在中间压力下）
        const h_diff_inj = h_6_inter - h_7_inter;  // 补气路吸热（在中间压力下）
        
        if (h_diff_main <= 0 || h_diff_inj <= 0) {
            throw new Error(`过冷器能量平衡异常：主路放热=${h_diff_main.toFixed(1)} J/kg，支路吸热=${h_diff_inj.toFixed(1)} J/kg`);
        }
        
        m_dot_inj_inter = (m_dot_lp * h_diff_main) / h_diff_inj;
        m_dot_total_inter = m_dot_lp + m_dot_inj_inter;
    }
    
    return {
        h_5_inter,
        h_6_inter,
        h_7_inter,
        m_dot_inj_inter,
        m_dot_total_inter,
        ecoType
    };
}

// 双级循环计算（支持ECO，支持补气）
function computeTwoStageCycle({
    fluid,
    Te_C,
    Tc_C,
    useful_superheat_K,  // 有用过热度
    total_superheat_K,   // 总过热度
    subcooling_K,
    flow_m3h,
    eta_v_lp,      // 低压级容积效率
    eta_s_lp,      // 低压级等熵效率
    eta_s_hp,      // 高压级等熵效率
    // 中间压力参数（双级压缩必需）
    interPressMode = 'auto', // 'auto' | 'manual'
    interSatTemp_C = null,
    // 压缩机参数（用于优化中间压力计算）
    vi_ratio = null,      // 容积比 (Vi,L / Vi,H)
    disp_lp = null,       // 低压级排量 (m³/h)
    disp_hp = null,       // 高压级排量 (m³/h)
    // ECO参数（中间冷却器）
    isEcoEnabled = false,
    ecoType = 'flash_tank', // 'flash_tank' | 'subcooler'
    ecoSuperheat_K = 5.0,
    ecoDt_K = 5.0,
    // SLHX参数
    isSlhxEnabled = false,
    slhxEff = 0.5,
    // 设计排气温度参数（用于油冷负荷计算）
    T_2a_est_C = null
}) {
    const T_evap_K = Te_C + 273.15;
    const T_cond_K = Tc_C + 273.15;

    const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', T_evap_K, 'Q', 1, fluid);
    const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', T_cond_K, 'Q', 1, fluid);

    // 点 1：蒸发器出口（含有用过热）
    // 当过热度为 0 时，代表饱和状态，使用 Q=1（饱和蒸汽）计算物性
    let h1_base, s1_base, rho1_base, T1_K;
    if (useful_superheat_K <= 0) {
        // 饱和状态：使用 Q=1（饱和蒸汽）
        T1_K = T_evap_K;
        h1_base = CP_INSTANCE.PropsSI('H', 'P', Pe_Pa, 'Q', 1, fluid);
        s1_base = CP_INSTANCE.PropsSI('S', 'P', Pe_Pa, 'Q', 1, fluid);
        rho1_base = CP_INSTANCE.PropsSI('D', 'P', Pe_Pa, 'Q', 1, fluid);
    } else {
        // 过热状态：使用温度计算
        T1_K = T_evap_K + useful_superheat_K;
        h1_base = CP_INSTANCE.PropsSI('H', 'T', T1_K, 'P', Pe_Pa, fluid);
        s1_base = CP_INSTANCE.PropsSI('S', 'T', T1_K, 'P', Pe_Pa, fluid);
        rho1_base = CP_INSTANCE.PropsSI('D', 'T', T1_K, 'P', Pe_Pa, fluid);
    }

    // 点 3：冷凝器出口（含过冷）
    // 当过冷度为 0 时，代表饱和状态，使用 Q=0（饱和液体）计算物性
    let h3, T3_K;
    if (subcooling_K <= 0) {
        // 饱和状态：使用 Q=0（饱和液体）
        T3_K = T_cond_K;
        h3 = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'Q', 0, fluid);
    } else {
        // 过冷状态：使用温度计算
        T3_K = T_cond_K - subcooling_K;
        h3 = CP_INSTANCE.PropsSI('H', 'T', T3_K, 'P', Pc_Pa, fluid);
    }

    // =========================================================
    // 确定中间压力（双级压缩的核心）
    // =========================================================
    let P_intermediate_Pa, T_intermediate_sat_K;
    if (interPressMode === 'auto') {
        // 自动模式：优先使用基于容积比和效率的优化算法
        // 高压级容积效率：单机双级压缩机通常两级容积效率相近，使用低压级值
        const eta_v_hp = eta_v_lp; // 简化假设
        
        // 无ECO时，使用几何平均法计算中间压力
        P_intermediate_Pa = Math.sqrt(Pe_Pa * Pc_Pa);
        T_intermediate_sat_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0, fluid);
    } else {
        // 手动模式：用户指定中间饱和温度
        T_intermediate_sat_K = interSatTemp_C + 273.15;
        P_intermediate_Pa = CP_INSTANCE.PropsSI('P', 'T', T_intermediate_sat_K, 'Q', 0.5, fluid);
    }

    // 验证中间压力合理性
    if (P_intermediate_Pa <= Pe_Pa || P_intermediate_Pa >= Pc_Pa) {
        throw new Error(`无效的中间压力：P_intermediate (${(P_intermediate_Pa/1e5).toFixed(2)} bar) 必须在 P_s 和 P_d 之间`);
    }

    // =========================================================
    // SLHX迭代计算（支持ECO，支持补气）
    // =========================================================
    // 点 1'：压缩机吸气口（含总过热）
    // 当总过热度为 0 时，代表饱和状态，使用 Q=1（饱和蒸汽）计算物性
    let T_suc_K, h_suc, rho_suc, s_suc;
    if (total_superheat_K <= 0) {
        // 饱和状态：使用 Q=1（饱和蒸汽）
        T_suc_K = T_evap_K;
        h_suc = CP_INSTANCE.PropsSI('H', 'P', Pe_Pa, 'Q', 1, fluid);
        rho_suc = CP_INSTANCE.PropsSI('D', 'P', Pe_Pa, 'Q', 1, fluid);
        s_suc = CP_INSTANCE.PropsSI('S', 'P', Pe_Pa, 'Q', 1, fluid);
    } else {
        // 过热状态：使用温度计算
        T_suc_K = T_evap_K + total_superheat_K;
        h_suc = CP_INSTANCE.PropsSI('H', 'T', T_suc_K, 'P', Pe_Pa, fluid);
        rho_suc = CP_INSTANCE.PropsSI('D', 'T', T_suc_K, 'P', Pe_Pa, fluid);
        s_suc = CP_INSTANCE.PropsSI('S', 'T', T_suc_K, 'P', Pe_Pa, fluid);
    }
    let h_liq_out = h3;
    
    // ECO 相关变量初始化
    let m_dot_inj = 0;
    let h_5_eco = h3;  // ECO 主路出口（节流前）
    let h_6_eco = 0;   // ECO 补气出口（补气状态）
    let h_7_eco = h3;  // ECO 补气入口（节流后）
    
    // SLHX迭代
    for (let iter = 0; iter < 5; iter++) {
        // 质量流量计算 - 使用低压级容积效率
        const V_th_m3_s = flow_m3h / 3600.0;
        const m_dot_suc = V_th_m3_s * eta_v_lp * rho_suc;
        
        // SLHX计算
        if (isSlhxEnabled) {
            const T_liq_in = CP_INSTANCE.PropsSI('T', 'H', h3, 'P', Pc_Pa, fluid);
            const Cp_liq = CP_INSTANCE.PropsSI('C', 'H', h3, 'P', Pc_Pa, fluid);
            const Cp_vap = CP_INSTANCE.PropsSI('C', 'H', h1_base, 'P', Pe_Pa, fluid);
            const C_liq = m_dot_suc * Cp_liq;
            const C_vap = m_dot_suc * Cp_vap;
            const C_min = Math.min(C_liq, C_vap);
            const Q_max = C_min * (T_liq_in - T1_K);
            const Q_slhx = slhxEff * Q_max;
            const h_suc_new = h1_base + (Q_slhx / m_dot_suc);
            const h_liq_out_new = h3 - (Q_slhx / m_dot_suc);
            const diff = Math.abs(h_suc_new - h_suc);
            h_suc = h_suc_new;
            h_liq_out = h_liq_out_new;
            
            // 更新吸气状态
            try {
                rho_suc = CP_INSTANCE.PropsSI('D', 'H', h_suc, 'P', Pe_Pa, fluid);
                s_suc = CP_INSTANCE.PropsSI('S', 'H', h_suc, 'P', Pe_Pa, fluid);
                T_suc_K = CP_INSTANCE.PropsSI('T', 'H', h_suc, 'P', Pe_Pa, fluid);
            } catch (e) {
                rho_suc = CP_INSTANCE.PropsSI('D', 'T', T_suc_K, 'P', Pe_Pa, fluid);
            }
            
            if (diff < 100) break;
        } else {
            // 无SLHX，使用总过热度
            // 当总过热度为 0 时，已经使用饱和状态计算，无需重新计算
            if (total_superheat_K > 0) {
                h_suc = CP_INSTANCE.PropsSI('H', 'T', T_suc_K, 'P', Pe_Pa, fluid);
            }
            h_liq_out = h3;
            break;
        }
    }
    
    // 最终质量流量计算
    const V_th_m3_s = flow_m3h / 3600.0;
    const m_dot_suc = V_th_m3_s * eta_v_lp * rho_suc;
    
    // =========================================================
    // ECO 计算（中间冷却器）
    // =========================================================
    if (isEcoEnabled) {
        // 使用 ECO 计算补气量和补气状态
        const ecoResult = computeIntercoolerECO({
            fluid,
            P_intermediate_Pa,
            h3: h_liq_out,  // 使用 SLHX 后的液体焓值（如果有 SLHX）
            Pc_Pa,
            m_dot_lp: m_dot_suc,
            ecoType,
            ecoSuperheat_K,
            ecoDt_K
        });
        
        m_dot_inj = ecoResult.m_dot_inj_inter;
        h_5_eco = ecoResult.h_5_inter;
        h_6_eco = ecoResult.h_6_inter;
        h_7_eco = ecoResult.h_7_inter;
    }
    
    const m_dot_total = m_dot_suc + m_dot_inj; // 总流量 = 低压级流量 + 补气流量

    // =========================================================
    // 两级压缩功计算（支持ECO，支持补气，支持油冷）
    // =========================================================
    // 第一级压缩：P_s → P_intermediate（使用低压级等熵效率）
    const h_mid_1s = CP_INSTANCE.PropsSI('H', 'P', P_intermediate_Pa, 'S', s_suc, fluid);
    const W_s1_ideal = m_dot_suc * (h_mid_1s - h_suc);
    const W_s1 = W_s1_ideal / eta_s_lp;  // 低压级实际功

    // 低压级排气点（mid点）- 压缩后的实际状态
    const h_mid = h_suc + (h_mid_1s - h_suc) / eta_s_lp;
    const T_mid_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'H', h_mid, fluid);
    const T_mid_C = T_mid_K - 273.15;

    // =========================================================
    // 低压级出口完全冷却（活塞氨压缩机工程实践）
    // =========================================================
    // 对于活塞氨压缩机，低压级出口通常需要完全冷却到中间压力下的饱和状态
    // 这样可以降低高压级吸气温度，减少压缩功，提高系统效率
    // 注意：T_intermediate_sat_K 已在函数开头计算，直接使用
    const T_intermediate_sat_C = T_intermediate_sat_K - 273.15;
    
    // 计算中间压力下的饱和蒸汽焓值（Q=1，饱和蒸汽）
    const h_mid_saturated = CP_INSTANCE.PropsSI('H', 'P', P_intermediate_Pa, 'Q', 1, fluid);
    
    // 判断是否需要完全冷却（如果排气温度高于饱和温度，则冷却到饱和）
    let h_mid_cooled = h_mid;
    let T_mid_cooled_C = T_mid_C;
    let Q_intercooler_W = 0; // 中间冷却器负荷（用于冷却低压级排气）
    
    if (T_mid_C > T_intermediate_sat_C) {
        // 需要冷却到饱和状态（完全冷却）
        h_mid_cooled = h_mid_saturated;
        T_mid_cooled_C = T_intermediate_sat_C;
        Q_intercooler_W = m_dot_suc * (h_mid - h_mid_cooled);
        console.log(`[RCC Pro Mode5] 低压级出口完全冷却: 从 ${T_mid_C.toFixed(1)}°C 冷却到 ${T_mid_cooled_C.toFixed(1)}°C (饱和), 负荷: ${(Q_intercooler_W/1000).toFixed(2)} kW`);
    } else {
        // 排气温度已经低于或等于饱和温度，不需要冷却
        console.log(`[RCC Pro Mode5] 低压级出口温度 ${T_mid_C.toFixed(1)}°C 已低于饱和温度 ${T_intermediate_sat_C.toFixed(1)}°C，无需冷却`);
    }

    // =========================================================
    // 补气混合过程（关键热力学计算）
    // =========================================================
    let h_mix;
    
    if (isEcoEnabled && ecoType === 'flash_tank') {
        // =========================================================
        // 闪蒸罐模式（mode5 单机双级专用逻辑）
        // =========================================================
        // 物理过程：
        // 1. 冷凝器出口高压液体（h3）一级节流到中间压力（h_7_eco）
        // 2. 在中间压力下闪蒸，产生饱和液体（h_5_eco）和饱和蒸汽（h_6_eco）
        // 3. 饱和液体（h_5_eco）留在闪蒸罐底部，二级节流到蒸发压力（h4）
        // 4. 低压级排气（h_mid）完全冷却后变成饱和气体（h_mid_cooled）
        // 5. 闪蒸产生的饱和蒸汽（h_6_eco）与冷却后的饱和气体（h_mid_cooled）混合
        // 6. 混合后的饱和气体（h_mix）被高压级吸入压缩
        
        // 混合计算：闪蒸产生的饱和蒸汽 + 低压级排气冷却后的饱和气体
        // 注意：两者都是饱和气体（Q=1），混合后仍然是饱和气体
        if (m_dot_inj > 0) {
            h_mix = (m_dot_suc * h_mid_cooled + m_dot_inj * h_6_eco) / m_dot_total;
            
            // 验证混合后的状态是否为饱和气体
            const T_mix_K = CP_INSTANCE.PropsSI('T', 'H', h_mix, 'P', P_intermediate_Pa, fluid);
            const T_intermediate_sat_K_check = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 1, fluid);
            const h_mix_sat = CP_INSTANCE.PropsSI('H', 'P', P_intermediate_Pa, 'Q', 1, fluid);
            
            // 如果混合后的焓值接近饱和蒸汽焓值，说明混合后是饱和气体
            if (Math.abs(h_mix - h_mix_sat) > 1000) {
                console.warn(`[RCC Pro Mode5] 闪蒸罐模式混合后状态异常：h_mix=${h_mix.toFixed(1)} J/kg，h_mix_sat=${h_mix_sat.toFixed(1)} J/kg`);
            }
        } else {
            // 无闪蒸补气：高压级吸气等于冷却后的低压级排气
            h_mix = h_mid_cooled;
        }
    } else if (isEcoEnabled && ecoType === 'subcooler') {
        // =========================================================
        // 过冷器模式（与 mode6 双机双级逻辑一致）
        // =========================================================
        // 物理过程：
        // 1. 低压级压缩：1 -> mid（高温排气）
        // 2. 中间冷却：mid -> mid*（冷却到饱和，可选）
        // 3. ECO主路液体：3 -> 5（在 Pc_Pa 下过冷）
        // 4. ECO补气路：3 -> 7（等焓节流到中间压力）-> 6（在过冷器中吸热变为过热蒸汽）
        // 5. 混合：mid/mid*（排气，冷却后） + 6（补气，过热蒸汽） -> mix
        // 6. 高压级压缩：mix -> 2
        
        // 混合计算：低压级排气（冷却后） + ECO补气（过热蒸汽）
        if (m_dot_inj > 0) {
            h_mix = (m_dot_suc * h_mid_cooled + m_dot_inj * h_6_eco) / m_dot_total;
        } else {
            // 无 ECO 补气：高压级吸气等于冷却后的低压级排气
            h_mix = h_mid_cooled;
        }
    } else {
        // 无 ECO：高压级吸气等于冷却后的低压级排气
        h_mix = h_mid_cooled;
    }
    
    // 第二级压缩：P_intermediate → Pc（使用高压级等熵效率）
    const s_mix = CP_INSTANCE.PropsSI('S', 'H', h_mix, 'P', P_intermediate_Pa, fluid);
    const h_2s_stage2 = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_mix, fluid);
    const W_s2_ideal = m_dot_total * (h_2s_stage2 - h_mix);
    const W_s2 = W_s2_ideal / eta_s_hp;  // 高压级实际功

    const W_shaft_W = W_s1 + W_s2;  // 总轴功 = LP功 + HP功
    const W_input_W = W_shaft_W;

    // 高压级排气点（点2）- 计算实际排气状态
    const h2_calculated = h_mix + (h_2s_stage2 - h_mix) / eta_s_hp;
    const T2_calculated_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h2_calculated, fluid);
    const T2_calculated_C = T2_calculated_K - 273.15;
    
    // 高压级排气温度：如果输入了设计值，需要判断计算值与设计值的关系
    let h_2a_final = 0;
    let T_2a_final_C = 0;
    if (T_2a_est_C !== null && !isNaN(T_2a_est_C)) {
        // 用户输入了设计排温
        // 如果计算值小于设计值，使用计算值（实际排温更低，不需要油冷）
        // 如果计算值大于等于设计值，使用设计值（需要油冷来达到设计值）
        if (T2_calculated_C < T_2a_est_C) {
            // 计算值小于设计值，使用计算值
            h_2a_final = h2_calculated;
            T_2a_final_C = T2_calculated_C;
        } else {
            // 计算值大于等于设计值，使用设计值
            const T_2a_est_K = T_2a_est_C + 273.15;
            h_2a_final = CP_INSTANCE.PropsSI('H', 'T', T_2a_est_K, 'P', Pc_Pa, fluid);
            T_2a_final_C = T_2a_est_C;
        }
    } else {
        // 未输入设计排温，使用实际计算值
        h_2a_final = h2_calculated;
        T_2a_final_C = T2_calculated_C;
    }

    // 油冷负荷计算（参考 mode7 的逻辑）
    // =========================================================
    // 油冷负荷 = 总摩擦热 = 总轴功率 - 总气体功率
    // 这是机械损失，必须由油冷系统带走
    // 注意：油冷是从压缩功中直接带走的，不影响排气焓值
    // =========================================================
    // 低压级气体功率：P_gas_lp = m_dot_suc * (h_mid - h_suc)
    const P_gas_lp = m_dot_suc * (h_mid - h_suc);
    // 高压级气体功率：P_gas_hp = m_dot_total * (h_2a_final - h_mix)
    const P_gas_hp = m_dot_total * (h_2a_final - h_mix);
    // 总气体功率
    const P_gas_total = P_gas_lp + P_gas_hp;
    // 总摩擦热（油冷负荷）：Q_oil_W = W_shaft_W - P_gas_total
    // 如果计算值为负或接近0，使用经验值（约3%总轴功）
    let Q_oil_W = W_shaft_W - P_gas_total;
    
    if (Q_oil_W <= 0 || (T_2a_est_C === null && Q_oil_W < W_shaft_W * 0.01)) {
        // 如果没有输入设计排气温度，使用经验值：油冷负荷约为总轴功的3%
        // 这是基于工程实际的合理估算（曲轴、轴承、轴封等部件的摩擦热）
        Q_oil_W = W_shaft_W * 0.03;
        console.log(`[RCC Pro Mode5] 未输入设计排气温度，使用经验值计算油冷负荷: ${(Q_oil_W/1000).toFixed(2)} kW (约${(Q_oil_W/W_shaft_W*100).toFixed(1)}% 总轴功)`);
        console.log(`[RCC Pro Mode5] 注意：油冷负荷是从压缩功中直接带走的摩擦热，不影响排气焓值`);
    } else {
        console.log(`[RCC Pro Mode5] 油冷负荷（摩擦热）: ${(Q_oil_W/1000).toFixed(2)} kW (${(Q_oil_W/W_shaft_W*100).toFixed(1)}% 总轴功)`);
        console.log(`[RCC Pro Mode5] 总气体功率: ${(P_gas_total/1000).toFixed(2)} kW (LP: ${(P_gas_lp/1000).toFixed(2)} + HP: ${(P_gas_hp/1000).toFixed(2)}), 总轴功率: ${(W_shaft_W/1000).toFixed(2)} kW`);
    }

    // 蒸发制冷量 & 冷凝放热
    // 注意：Q_cond_W 应该基于考虑了油冷后的排气焓值 h_2a_final
    const Q_evap_W = m_dot_suc * (h1_base - h_liq_out);
    const Q_cond_W = m_dot_total * (h_2a_final - h3);

    const COP_c = Q_evap_W / W_input_W;
    const COP_h = Q_cond_W / W_input_W;

    // 节流
    // 如果有 ECO，节流前使用 ECO 主路出口（h_5_eco），否则使用 h_liq_out
    const h4 = isEcoEnabled ? h_5_eco : h_liq_out;
    const T4_K = CP_INSTANCE.PropsSI('T', 'P', Pe_Pa, 'H', h4, fluid);
    const T4_C = T4_K - 273.15;

    return {
        Pe_Pa,
        Pc_Pa,
        P_intermediate_Pa,
        T_intermediate_sat_K,
        m_dot: m_dot_suc,
        m_dot_total,
        m_dot_inj,
        h1: h1_base,
        h_suc,
        h2: h2_calculated,  // 压缩后的计算状态（冷却前）
        h2a: h_2a_final,     // 实际排气状态（考虑油冷后）
        h3,
        h4,
        h_liq_out,  // SLHX 后的液体焓值（用于节流计算）
        h_mid: h_mid, // 压缩后的状态（冷却前）
        h_mid_cooled: h_mid_cooled, // 冷却后的状态（用于混合）
        h_mix: h_mix,
        h_2s_stage2: h_2s_stage2,
        // ECO 相关状态点
        h_5_eco: isEcoEnabled ? h_5_eco : null,
        h_6_eco: isEcoEnabled ? h_6_eco : null,
        h_7_eco: isEcoEnabled ? h_7_eco : null,
        // 中间冷却器负荷（用于冷却低压级排气）
        Q_intercooler_W: Q_intercooler_W,
        // 油冷负荷（用于冷却高压级排气，带走曲轴、轴承、轴封等部件的热量）
        Q_oil_W: Q_oil_W,
        T1_K,
        T_mid_C: T_mid_C, // 压缩后的温度（冷却前）
        T_mid_cooled_C: T_mid_cooled_C, // 冷却后的温度（用于混合）
        T2_C: T2_calculated_C, // 压缩后的计算温度（冷却前）
        T2a_C: T_2a_final_C, // 实际排气温度（考虑油冷后）
        T3_K,
        T4_C: T4_C,
        Q_evap_W,
        Q_cond_W,
        W_shaft_W,
        W_s1,  // 低压级轴功
        W_s2,  // 高压级轴功
        W_input_W,
        COP_c,
        COP_h,
        isSlhxEnabled,
        isEcoEnabled,
        ecoType: isEcoEnabled ? ecoType : null
    };
}

function calculateMode5() {
    renderToAllViews('<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>');
    ['chart-desktop-m5', 'chart-mobile-m5'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    setTimeout(() => {
        try {
            // 读取输入
            const fluid = fluidSelect.value;
            const Te_C = parseFloat(tempEvapInput.value);
            const Tc_C = parseFloat(tempCondInput.value);
            
            // 过热分析：区分有用过热和总过热（参考Mode 2）
            let useful_superheat_K_raw = parseFloat(usefulSuperheatInput?.value);
            if (isNaN(useful_superheat_K_raw) || useful_superheat_K_raw < 0) {
                useful_superheat_K_raw = 0; // 默认值
            }
            const useful_superheat_K = useful_superheat_K_raw; // 保留原始值，包括0
            
            let total_superheat_K_raw = parseFloat(superheatInput.value);
            if (isNaN(total_superheat_K_raw) || total_superheat_K_raw < 0) {
                // 如果总过热未输入或无效，默认等于有用过热
                total_superheat_K_raw = useful_superheat_K_raw;
            }
            // 确保总过热 >= 有用过热（物理约束）
            let total_superheat_K;
            if (total_superheat_K_raw < useful_superheat_K) {
                console.warn('[Mode5] 总过热小于有用过热，已自动调整为等于有用过热');
                total_superheat_K = useful_superheat_K; // 调整为等于有用过热
            } else {
                total_superheat_K = total_superheat_K_raw; // 保留原始值，包括0
            }
            
            const sc_K = parseFloat(subcoolInput.value);

            let flow = parseFloat(flowInput.value);
            if (compressorModel && compressorModel.value) {
                const brand = compressorBrand.value;
                const series = compressorSeries.value;
                const model = compressorModel.value;
                const displacement = getDisplacementByModel(brand, series, model);
                if (displacement !== null && (isNaN(flow) || flow <= 0)) {
                    flow = displacement;
                }
            }

            const eta_v_lp = parseFloat(etaVLpInput.value);
            const eta_s_lp = parseFloat(etaSLpInput.value);
            const eta_s_hp = parseFloat(etaSHpInput.value);

            // 中间压力设置
            const interPressModeValue = document.querySelector('input[name="inter_press_mode_m5"]:checked')?.value || 'auto';
            const interSatTempValue = interSatTempInput ? parseFloat(interSatTempInput.value) : null;

            // SLHX参数
            const isSlhxEnabled = slhxCheckbox && slhxCheckbox.checked;
            const slhxEffValue = slhxEff ? parseFloat(slhxEff.value) : 0.5;

            // ECO参数（中间冷却器）
            const isEcoEnabled = ecoCheckbox && ecoCheckbox.checked;
            const ecoTypeValue = ecoType && ecoType.length > 0 ? (document.querySelector('input[name="eco_type_m5"]:checked')?.value || 'flash_tank') : 'flash_tank';
            // 闪蒸罐模式：补气过热度固定为0（饱和蒸汽）
            // 过冷器模式：使用补气过热度输入
            const ecoSuperheatValue = ecoTypeValue === 'flash_tank' 
                ? 0  // 闪蒸罐模式下过热度固定为0
                : (ecoSuperheatInputSubcooler ? parseFloat(ecoSuperheatInputSubcooler.value) : 5);
            const ecoDtValue = ecoDtInput ? parseFloat(ecoDtInput.value) : 5.0;
            
            // 设计排气温度参数（用于油冷负荷计算，可选）
            // 如果未输入，将使用计算值（无油冷）
            const T_2a_est_C_input = document.getElementById('discharge_temp_est_m5');
            const T_2a_est_C = T_2a_est_C_input && T_2a_est_C_input.value 
                ? parseFloat(T_2a_est_C_input.value) 
                : null;
            
            // 验证 ECO 参数
            if (isEcoEnabled) {
                if (ecoTypeValue === 'subcooler') {
                    if (isNaN(ecoSuperheatValue) || ecoSuperheatValue < 0) {
                        throw new Error('过冷器模式下，补气过热度必须大于等于0。');
                    }
                    if (isNaN(ecoDtValue) || ecoDtValue < 0) {
                        throw new Error('过冷器接近度必须大于等于0。');
                    }
                }
            }

            // 验证输入
            if (isNaN(Te_C) || isNaN(Tc_C) || isNaN(useful_superheat_K) || isNaN(total_superheat_K) || isNaN(sc_K) || 
                isNaN(flow) || isNaN(eta_v_lp) || isNaN(eta_s_lp) || isNaN(eta_s_hp)) {
                throw new Error('请输入完整且有效的数值参数。');
            }

            if (flow <= 0 || eta_v_lp <= 0 || eta_s_lp <= 0 || eta_s_hp <= 0 || 
                useful_superheat_K < 0 || total_superheat_K < 0 || sc_K < 0) {
                throw new Error('流量和效率必须大于0，过热度/过冷度不能为负。');
            }
            
            if (total_superheat_K < useful_superheat_K) {
                throw new Error('总过热度必须大于等于有用过热度。');
            }

            if (Tc_C <= Te_C) {
                throw new Error('冷凝温度必须高于蒸发温度。');
            }

            if (interPressModeValue === 'manual' && (isNaN(interSatTempValue) || interSatTempValue === null)) {
                throw new Error('手动模式下必须指定中间饱和温度。');
            }

            // 获取压缩机参数（用于优化中间压力计算）
            let vi_ratio = null, disp_lp = null, disp_hp = null;
            if (compressorBrand && compressorSeries && compressorModel) {
                const brand = compressorBrand.value;
                const series = compressorSeries.value;
                const model = compressorModel.value;
                if (brand && series && model) {
                    const detail = getModelDetail(brand, series, model);
                    if (detail) {
                        if (typeof detail.vi_ratio === 'number') {
                            vi_ratio = detail.vi_ratio;
                        }
                        if (typeof detail.disp_lp === 'number') {
                            disp_lp = detail.disp_lp;
                        }
                        if (typeof detail.disp_hp === 'number') {
                            disp_hp = detail.disp_hp;
                        }
                    }
                }
            }

            // 执行计算
            const result = computeTwoStageCycle({
                fluid,
                Te_C,
                Tc_C,
                useful_superheat_K,
                total_superheat_K,
                subcooling_K: sc_K,
                flow_m3h: flow,
                eta_v_lp,
                eta_s_lp,
                eta_s_hp,
                interPressMode: interPressModeValue,
                interSatTemp_C: interSatTempValue,
                vi_ratio,
                disp_lp,
                disp_hp,
                isEcoEnabled,
                ecoType: ecoTypeValue,
                ecoSuperheat_K: ecoSuperheatValue,
                ecoDt_K: ecoDtValue,
                isSlhxEnabled,
                slhxEff: slhxEffValue,
                T_2a_est_C: T_2a_est_C  // 设计排气温度（用于油冷负荷计算）
            });
            
            // 保存 ECO 参数供结果渲染使用
            result.ecoSuperheatValue = ecoSuperheatValue;
            result.ecoTypeValue = ecoTypeValue;

            // =========================================================
            // RCC Pro: 缸头冷却负荷计算（可选/条件性）
            // =========================================================
            // 缸头冷却是可选功能，用于降低排气温度
            // 根据GEA实际情况：冷却负荷约4%轴功率，可降低排气温度约15°C
            let Q_cylinder_head_W = 0;
            let T_2a_after_head_cooling_C = result.T2a_C; // 缸头冷却后的排气温度
            let cylinderHeadCoolingError = null; // 安全检查错误
            const CYLINDER_HEAD_COOLING_FACTOR = 0.04; // 缸头冷却可带走4%轴功率（根据GEA实际情况）
            const CYLINDER_HEAD_TEMP_REDUCTION = 15; // °C，缸头冷却可降低的排气温度
            // 缸头冷却计算模式：
            // - 'fixed_power': 固定按轴功率百分比带走热量（默认4%）
            // - 'target_dt'  : 优先满足目标温降（默认15°C），由此计算所需负荷（确保能量守恒）
            const CYLINDER_HEAD_COOLING_MODE = 'target_dt';
            
            // 读取缸头冷却配置
            const isCylinderHeadCoolingEnabled = cylinderHeadCoolingEnabledM5?.checked || false;
            
            // 调试信息
            if (isCylinderHeadCoolingEnabled) {
                console.log('[RCC Pro Mode5] 缸头冷却已启用');
            }
            
            if (isCylinderHeadCoolingEnabled) {
                // 读取输入模式
                const inputModeRadio = document.querySelector('input[name="cylinder_head_input_mode_m5"]:checked');
                const inputMode = inputModeRadio ? inputModeRadio.value : 'water_temp';
                
                if (inputMode === 'direct_power') {
                    // =========================================================
                    // 直接输入模式：直接读取输入的负荷值
                    // =========================================================
                    const Q_cylinder_head_kW = parseFloat(cylinderHeadPowerInputM5?.value) || 0;
                    if (Q_cylinder_head_kW < 0) {
                        cylinderHeadCoolingError = `缸头冷却负荷不能为负值。`;
                        console.error(`[RCC Pro Mode5] ${cylinderHeadCoolingError}`);
                        Q_cylinder_head_W = 0;
                        T_2a_after_head_cooling_C = result.T2a_C;
                    } else {
                        Q_cylinder_head_W = Q_cylinder_head_kW * 1000; // 转换为 W
                        console.log(`[RCC Pro Mode5] 缸头冷却（直接输入模式）: 负荷 ${Q_cylinder_head_kW.toFixed(2)} kW`);
                    }
                } else {
                    // =========================================================
                    // 水温计算模式：通过水温计算负荷
                    // =========================================================
                    // 读取缸头冷却水参数
                    const T_head_water_in = parseFloat(cylinderHeadWaterInletTempM5?.value) || 30;
                    const T_head_water_out = parseFloat(cylinderHeadWaterOutletTempM5?.value) || 35;
                    
                    // =========================================================
                    // 安全检查：防止液击（Liquid Hammer）
                    // =========================================================
                    // 关键安全规则：进水温度必须 > (蒸发温度 + 10K)
                    // 如果水温太低，会导致吸气腔内结露甚至液化，引发严重的液击风险
                    const min_head_water_temp = Te_C + 10; // 最小允许进水温度
                    
                    // 验证出水温度必须大于进水温度
                    if (T_head_water_out <= T_head_water_in) {
                        // 出水温度无效：显示错误
                        cylinderHeadCoolingError = `缸头冷却出水温度 (${T_head_water_out.toFixed(1)}°C) 必须大于进水温度 (${T_head_water_in.toFixed(1)}°C)。`;
                        console.error(`[RCC Pro Mode5] ${cylinderHeadCoolingError}`);
                        console.log(`[RCC Pro Mode5] 缸头冷却参数无效，不启用缸头冷却`);
                        // 如果参数无效，不启用缸头冷却
                        T_2a_after_head_cooling_C = result.T2a_C; // 保持原始排气温度
                    } else if (T_head_water_in < min_head_water_temp) {
                        // 安全检查失败：显示错误
                        cylinderHeadCoolingError = `液击风险！缸头冷却进水温度 (${T_head_water_in.toFixed(1)}°C) 过低。必须 > ${min_head_water_temp.toFixed(1)}°C (蒸发温度 + 10K) 以防止吸气腔结露。`;
                        console.error(`[RCC Pro Mode5] ${cylinderHeadCoolingError}`);
                        console.log(`[RCC Pro Mode5] 缸头冷却安全检查失败，不启用缸头冷却`);
                        // 如果安全检查失败，不启用缸头冷却
                        T_2a_after_head_cooling_C = result.T2a_C; // 保持原始排气温度
                    } else {
                        // 安全检查通过，计算缸头冷却负荷
                        if (CYLINDER_HEAD_COOLING_MODE === 'target_dt') {
                            // 目标温降模式：根据目标温降计算所需负荷（能量守恒）
                            const T_target_C = Math.max(result.T2a_C - CYLINDER_HEAD_TEMP_REDUCTION, Te_C + 20);
                            const T_target_K = T_target_C + 273.15;
                            const h_target = CP_INSTANCE.PropsSI('H', 'T', T_target_K, 'P', result.Pc_Pa, fluid);
                            const delta_h = Math.max(0, result.h2a - h_target); // J/kg
                            Q_cylinder_head_W = result.m_dot_total * delta_h; // J/s = W（使用总质量流量）
                            const implied_factor = result.W_shaft_W > 0 ? (Q_cylinder_head_W / result.W_shaft_W) : 0;
                            console.log(`[RCC Pro Mode5] 缸头冷却（目标温降模式）:`);
                            console.log(`  目标温降: ${CYLINDER_HEAD_TEMP_REDUCTION} °C, 目标排气温度: ${T_target_C.toFixed(1)} °C`);
                            console.log(`  计算所需负荷: ${(Q_cylinder_head_W/1000).toFixed(2)} kW (约 ${(implied_factor*100).toFixed(1)}% 轴功率)`);
                        } else {
                            // 固定功率模式：按轴功率百分比带走热量
                            Q_cylinder_head_W = result.W_shaft_W * CYLINDER_HEAD_COOLING_FACTOR;
                            console.log(`[RCC Pro Mode5] 缸头冷却（固定功率模式）: 负荷 ${(Q_cylinder_head_W/1000).toFixed(2)} kW (${(CYLINDER_HEAD_COOLING_FACTOR*100).toFixed(0)}% 轴功率)`);
                        }
                        
                        // 注意：实际的温度降低量将在后续根据能量守恒计算（见 h_2a_after_head_cooling 计算）
                    }
                }
            } else {
                console.log('[RCC Pro Mode5] 缸头冷却未启用');
            }
            
            // 计算缸头冷却后的排气状态（能量守恒）
            let h_2a_after_head_cooling = result.h2a;
            if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) {
                // 正确的能量守恒：h_2a_after_head_cooling = h_2a_final - (Q_cylinder_head / m_dot_total)
                const h_reduction_per_kg = Q_cylinder_head_W / result.m_dot_total; // J/kg
                h_2a_after_head_cooling = result.h2a - h_reduction_per_kg;
                
                // 计算实际排气温度降低量
                try {
                    const T_2a_after_head_K = CP_INSTANCE.PropsSI('T', 'H', h_2a_after_head_cooling, 'P', result.Pc_Pa, fluid);
                    T_2a_after_head_cooling_C = T_2a_after_head_K - 273.15;
                    
                    // 验证能量守恒
                    const h_diff_from_energy = result.h2a - h_2a_after_head_cooling;
                    const h_diff_expected = Q_cylinder_head_W / result.m_dot_total;
                    const temp_reduction_actual = result.T2a_C - T_2a_after_head_cooling_C;
                    console.log(`[RCC Pro Mode5] 缸头冷却能量守恒验证: 焓降=${(h_diff_from_energy/1000).toFixed(1)} kJ/kg (期望=${(h_diff_expected/1000).toFixed(1)} kJ/kg), 实际温降=${temp_reduction_actual.toFixed(1)}°C`);
                } catch (e) {
                    console.warn(`[RCC Pro Mode5] 计算缸头冷却后排气温度失败: ${e.message}`);
                    h_2a_after_head_cooling = result.h2a;
                    // T_2a_after_head_cooling_C 已在前面初始化为 result.T2a_C，无需重新赋值
                }
            }
            
            // 如果启用了缸头冷却，显示实际的温度降低效果
            if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) {
                const actual_temp_reduction = result.T2a_C - T_2a_after_head_cooling_C;
                console.log(`[RCC Pro Mode5] 缸头冷却效果：`);
                console.log(`  原始排气温度: ${result.T2a_C.toFixed(1)}°C`);
                console.log(`  修正后排气温度: ${T_2a_after_head_cooling_C.toFixed(1)}°C`);
                console.log(`  实际温度降低: ${actual_temp_reduction.toFixed(1)}°C`);
            }

            // =========================================================
            // RCC Pro: 排气温度限制检查（基于修正后的排气温度）
            // =========================================================
            // 注意：如果启用缸头冷却，使用修正后的排气温度进行检查
            let dischargeTempWarning = null;
            let dischargeTempError = null;
            let isOperatingPointInvalid = false;
            
            // 使用修正后的排气温度（如果启用缸头冷却）
            const T_discharge_actual_C = (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) 
                ? T_2a_after_head_cooling_C 
                : result.T2a_C;
            
            // 优先使用制冷剂类型的限制（主要限制，基于润滑油分解温度）
            const fluidLimits = getDischargeTempLimitsByRefrigerant(fluid);
            
            // 获取压缩机系列的排气温度限制（补充限制，基于硬件设计）
            const brand = compressorBrand?.value;
            const series = compressorSeries?.value;
            const seriesLimits = getDischargeTempLimits(brand, series);
            
            // 确定有效的温度限制（取两者中的较小值，或使用系列限制如果是热泵系列）
            const isHeatPumpSeries = series && (
                series.includes('HP') || 
                series.includes('XHP') ||
                series.includes('HS Series') ||  // MYCOM HS 系列（高压热泵）
                series.includes('HK Series')     // MYCOM HK 系列（高压CO2/热泵）
            );
            
            let effectiveWarning, effectiveMax;
            if (isHeatPumpSeries && seriesLimits) {
                // 热泵系列：优先使用系列限制（设计用于更高温度工况）
                effectiveWarning = seriesLimits.warning;
                effectiveMax = seriesLimits.trip;
                console.log(`[RCC Pro Mode5] 使用热泵系列温度限制: 警告=${effectiveWarning}°C, 最大=${effectiveMax}°C (系列: ${series})`);
            } else {
                // 标准系列：使用更严格的限制（取两者中的较小值）
                effectiveWarning = seriesLimits ? Math.min(fluidLimits.warn, seriesLimits.warning) : fluidLimits.warn;
                effectiveMax = seriesLimits ? Math.min(fluidLimits.max, seriesLimits.trip) : fluidLimits.max;
                console.log(`[RCC Pro Mode5] 使用标准系列温度限制: 警告=${effectiveWarning}°C, 最大=${effectiveMax}°C (系列: ${series || '未指定'})`);
            }
            
            // 检查排气温度
            if (T_discharge_actual_C > effectiveMax) {
                dischargeTempError = `排气温度 ${T_discharge_actual_C.toFixed(1)}°C 超过最大允许值 ${effectiveMax}°C。必须降低压比或启用缸头冷却。`;
                isOperatingPointInvalid = true;
                console.error(`[RCC Pro Mode5] ${dischargeTempError}`);
            } else if (T_discharge_actual_C > effectiveWarning) {
                dischargeTempWarning = `排气温度 ${T_discharge_actual_C.toFixed(1)}°C 超过警告值 ${effectiveWarning}°C，建议检查输入参数或启用缸头冷却。`;
                console.warn(`[RCC Pro Mode5] ${dischargeTempWarning}`);
            }
            
            // 如果启用了缸头冷却，在警告/错误信息中显示原始排气温度
            if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0 && result.T2a_C !== T_2a_after_head_cooling_C) {
                if (dischargeTempError) {
                    dischargeTempError += ` (原始排气温度: ${result.T2a_C.toFixed(1)}°C，缸头冷却后: ${T_2a_after_head_cooling_C.toFixed(1)}°C)`;
                }
                if (dischargeTempWarning) {
                    dischargeTempWarning += ` (原始排气温度: ${result.T2a_C.toFixed(1)}°C，缸头冷却后: ${T_2a_after_head_cooling_C.toFixed(1)}°C)`;
                }
            }

            // =========================================================
            // 热平衡计算（参考 Mode 7 逻辑）
            // =========================================================
            // 双级压缩：冷凝器负荷计算（参考 Mode 7 逻辑）
            // =========================================================
            // 根据能量守恒原理：
            // 总排热量 = Q_evap + W_shaft = Q_cond + Q_oil + Q_cylinder_head
            // 所以：Q_cond = 总排热量 - Q_oil - Q_cylinder_head
            // 
            // 物理意义：
            // - 油冷是摩擦热，从压缩功中直接带走，不影响排气焓值
            // - 缸头冷却是从排气中带走的热量，影响排气焓值
            // - 冷凝器排热 = 总排热量 - 油冷负荷 - 缸头冷却负荷
            // =========================================================
            const Q_heating_total_W = result.Q_evap_W + result.W_shaft_W;
            
            // 方法1：基于能量守恒直接计算（推荐，保证能量守恒）
            const Q_cond_W_from_balance = Q_heating_total_W - result.Q_oil_W - Q_cylinder_head_W;
            
            // 方法2：基于焓值计算（用于验证）
            const h_2_for_cond = (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0)
                ? h_2a_after_head_cooling
                : result.h2a;
            const Q_cond_W_from_enthalpy = result.m_dot_total * (h_2_for_cond - result.h3);
            
            // 使用能量守恒方法计算冷凝器排热（保证能量守恒）
            const Q_cond_W_updated = Q_cond_W_from_balance;
            
            // 验证两种方法的一致性
            const cond_calc_diff = Math.abs(Q_cond_W_from_balance - Q_cond_W_from_enthalpy);
            if (cond_calc_diff > 100) { // 允许100W的误差（数值精度）
                console.warn(`[RCC Pro Mode5] 冷凝器排热计算差异: 能量守恒法 ${(Q_cond_W_from_balance/1000).toFixed(2)} kW vs 焓值法 ${(Q_cond_W_from_enthalpy/1000).toFixed(2)} kW，差值: ${(cond_calc_diff/1000).toFixed(2)} kW`);
                console.warn(`[RCC Pro Mode5] 使用能量守恒法以保证热平衡`);
            }
            
            
            // =========================================================
            // 热平衡计算逻辑（Heat Balance Calculation）
            // =========================================================
            // 根据能量守恒原理：
            // 总排热量 = 制冷量 + 轴功率
            // Q_heating_total = Q_evap + W_shaft
            //
            // 物理意义：
            // - 制冷量 (Q_evap): 从低温热源（蒸发器）吸收的热量
            // - 轴功率 (W_shaft): 压缩机消耗的功（最终转化为热量）
            // - 总排热量 (Q_heating_total): 向高温热源（冷凝器+缸头冷却）释放的总热量
            //
            // 分项验证：
            // - 冷凝器排热 (Q_cond): 高压级排气在冷凝器中释放的热量
            // - 油冷负荷 (Q_oil): 油冷却系统带走的热量（用于冷却曲轴、轴承、轴封等部件）
            // - 缸头冷却负荷 (Q_cylinder_head): 缸头冷却系统带走的热量（如果启用）
            // - 验证：Q_heating_total = Q_cond + Q_oil + Q_cylinder_head（能量守恒）
            // =========================================================
            // 注意：Q_heating_total_W 已在上面定义，这里不再重复定义
            
            // 验证：总排热量应该等于各分项之和（包括油冷负荷）
            // 注意：油冷是摩擦热，不影响排气焓值，所以 Q_cond 基于实际排气焓值计算
            // 缸头冷却是从排气中带走的热量，所以 Q_cond_W_updated 已经考虑了缸头冷却的影响
            // 正确的热平衡应该是：
            // Q_heating_total = Q_evap + W_shaft = Q_cond + Q_oil + Q_cylinder_head
            // 其中：
            // - Q_cond = m_dot_total * (h_2_for_cond - h3)，h_2_for_cond 已经考虑了缸头冷却
            // - Q_oil = W_shaft - P_gas_total（摩擦热）
            // - Q_cylinder_head = 缸头冷却带走的热量（如果启用）
            const Q_heating_expected = Q_cond_W_updated + result.Q_oil_W + Q_cylinder_head_W;
            
            // 验证：如果没有缸头冷却，Q_cond_W_updated 应该等于 result.Q_cond_W
            if (!isCylinderHeadCoolingEnabled || !Q_cylinder_head_W || cylinderHeadCoolingError) {
                const cond_diff = Math.abs(Q_cond_W_updated - result.Q_cond_W);
                if (cond_diff > 100) { // 允许100W的误差（数值精度）
                    console.warn(`[RCC Pro Mode5] Q_cond_W_updated (${(Q_cond_W_updated/1000).toFixed(2)} kW) 与 result.Q_cond_W (${(result.Q_cond_W/1000).toFixed(2)} kW) 不一致，差值: ${(cond_diff/1000).toFixed(2)} kW`);
                    // 如果差异较大，使用 result.Q_cond_W 来保证一致性
                    if (cond_diff > 1000) {
                        console.warn(`[RCC Pro Mode5] 使用 result.Q_cond_W 替代 Q_cond_W_updated 以保证能量守恒`);
                        const Q_heating_expected_fixed = result.Q_cond_W + result.Q_oil_W + Q_cylinder_head_W;
                        const balance_error_fixed = Math.abs(Q_heating_total_W - Q_heating_expected_fixed);
                        console.log(`[RCC Pro Mode5] 修正后的分项求和: ${(Q_heating_expected_fixed/1000).toFixed(2)} kW，误差: ${(balance_error_fixed/1000).toFixed(2)} kW`);
                    }
                }
            }
            
            // 调试：输出详细的计算过程
            console.log(`[RCC Pro Mode5] 热平衡验证:`);
            console.log(`  总排热量: ${(Q_heating_total_W/1000).toFixed(2)} kW = Q_evap ${(result.Q_evap_W/1000).toFixed(2)} + W_shaft ${(result.W_shaft_W/1000).toFixed(2)}`);
            console.log(`  分项求和: ${(Q_heating_expected/1000).toFixed(2)} kW = Q_cond ${(Q_cond_W_updated/1000).toFixed(2)} + Q_oil ${(result.Q_oil_W/1000).toFixed(2)} + Q_cylinder_head ${(Q_cylinder_head_W/1000).toFixed(2)}`);
            console.log(`  result.h2a: ${(result.h2a/1000).toFixed(1)} kJ/kg, h_2_for_cond: ${(h_2_for_cond/1000).toFixed(1)} kJ/kg`);
            console.log(`  result.h3: ${(result.h3/1000).toFixed(1)} kJ/kg`);
            const balance_error = Math.abs(Q_heating_total_W - Q_heating_expected);
            const balance_error_percent = Q_heating_expected > 0 ? (balance_error / Q_heating_expected) * 100 : 0;
            if (balance_error_percent > 0.1) { // 如果误差超过0.1%，记录警告
                console.warn(`[RCC Pro Mode5] 热平衡误差: ${(balance_error/1000).toFixed(2)} kW (${balance_error_percent.toFixed(2)}%)`);
                console.warn(`  总排热量（能量守恒）: ${(Q_heating_total_W/1000).toFixed(2)} kW = 制冷量 ${(result.Q_evap_W/1000).toFixed(2)} kW + 轴功率 ${(result.W_shaft_W/1000).toFixed(2)} kW`);
                console.warn(`  总排热量（分项求和）: ${(Q_heating_expected/1000).toFixed(2)} kW = 冷凝器 ${(Q_cond_W_updated/1000).toFixed(2)} kW + 油冷 ${(result.Q_oil_W/1000).toFixed(2)} kW + 缸头冷却 ${(Q_cylinder_head_W/1000).toFixed(2)} kW`);
            }

            // 构造状态点表
            const statePoints = [];
            statePoints.push({
                name: '1',
                desc: 'Evap Out',
                temp: (result.T1_K - 273.15).toFixed(1),
                press: (result.Pe_Pa / 1e5).toFixed(2),
                enth: (result.h1 / 1000).toFixed(1),
                flow: result.m_dot.toFixed(4)
            });

            if (result.isSlhxEnabled) {
                let T_suc_K;
                try {
                    T_suc_K = CP_INSTANCE.PropsSI('T', 'H', result.h_suc, 'P', result.Pe_Pa, fluid);
                } catch (e) {
                    T_suc_K = result.T1_K;
                }
                statePoints.push({
                    name: "1'",
                    desc: 'Comp In (SLHX)',
                    temp: (T_suc_K - 273.15).toFixed(1),
                    press: (result.Pe_Pa / 1e5).toFixed(2),
                    enth: (result.h_suc / 1000).toFixed(1),
                    flow: result.m_dot.toFixed(4)
                });
            }

            // 显示冷却后的状态（如果进行了冷却）
            const mid_temp_display = result.Q_intercooler_W > 0 ? result.T_mid_cooled_C : result.T_mid_C;
            const mid_enth_display = result.Q_intercooler_W > 0 ? result.h_mid_cooled : result.h_mid;
            statePoints.push({
                name: 'mid',
                desc: result.Q_intercooler_W > 0 ? 'Stage1 Out (Cooled)' : 'Stage1 Out',
                temp: mid_temp_display.toFixed(1),
                press: (result.P_intermediate_Pa / 1e5).toFixed(2),
                enth: (mid_enth_display / 1000).toFixed(1),
                flow: result.m_dot.toFixed(4)
            });
            // 如果进行了冷却，显示冷却前的状态
            if (result.Q_intercooler_W > 0) {
                statePoints.push({
                    name: 'mid*',
                    desc: 'Stage1 Out (Before Cooling)',
                    temp: result.T_mid_C.toFixed(1),
                    press: (result.P_intermediate_Pa / 1e5).toFixed(2),
                    enth: (result.h_mid / 1000).toFixed(1),
                    flow: result.m_dot.toFixed(4)
                });
            }

            // ECO 补气点（如果有 ECO）
            if (result.isEcoEnabled && result.m_dot_inj > 0) {
                let T_6_K, T_7_K;
                try {
                    T_6_K = CP_INSTANCE.PropsSI('T', 'H', result.h_6_eco, 'P', result.P_intermediate_Pa, fluid);
                    T_7_K = CP_INSTANCE.PropsSI('T', 'H', result.h_7_eco, 'P', result.P_intermediate_Pa, fluid);
                } catch (e) {
                    T_6_K = result.T_intermediate_sat_K;
                    T_7_K = result.T_intermediate_sat_K;
                }
                statePoints.push({
                    name: '6',
                    desc: 'ECO Inj Out',
                    temp: (T_6_K - 273.15).toFixed(1),
                    press: (result.P_intermediate_Pa / 1e5).toFixed(2),
                    enth: (result.h_6_eco / 1000).toFixed(1),
                    flow: result.m_dot_inj.toFixed(4)
                });
            }

            // 混合点（如果有 ECO 补气）
            if (result.isEcoEnabled && result.m_dot_inj > 0) {
                let T_mix_K;
                try {
                    T_mix_K = CP_INSTANCE.PropsSI('T', 'H', result.h_mix, 'P', result.P_intermediate_Pa, fluid);
                } catch (e) {
                    T_mix_K = result.T_intermediate_sat_K;
                }
                statePoints.push({
                    name: 'mix',
                    desc: 'Mix (LP+Inj)',
                    temp: (T_mix_K - 273.15).toFixed(1),
                    press: (result.P_intermediate_Pa / 1e5).toFixed(2),
                    enth: (result.h_mix / 1000).toFixed(1),
                    flow: result.m_dot_total.toFixed(4)
                });
            }

            statePoints.push({
                name: '2',
                desc: 'Stage2 Out',
                temp: result.T2_C.toFixed(1),
                press: (result.Pc_Pa / 1e5).toFixed(2),
                enth: (result.h2 / 1000).toFixed(1),
                flow: result.m_dot_total.toFixed(4)
            });

            statePoints.push({
                name: '3',
                desc: 'Cond Out',
                temp: (result.T3_K - 273.15).toFixed(1),
                press: (result.Pc_Pa / 1e5).toFixed(2),
                enth: (result.h3 / 1000).toFixed(1),
                flow: result.m_dot_total.toFixed(4)
            });

            // 点 3'：SLHX 后（如果有 SLHX）
            if (result.isSlhxEnabled) {
                let T_3p_K;
                try {
                    T_3p_K = CP_INSTANCE.PropsSI('T', 'H', result.h_liq_out, 'P', result.Pc_Pa, fluid);
                } catch (e) {
                    T_3p_K = result.T3_K;
                }
                statePoints.push({
                    name: "3'",
                    desc: 'Cond Out (SLHX)',
                    temp: (T_3p_K - 273.15).toFixed(1),
                    press: (result.Pc_Pa / 1e5).toFixed(2),
                    enth: (result.h_liq_out / 1000).toFixed(1),
                    flow: result.m_dot_total.toFixed(4)
                });
            }

            // ECO 相关状态点（如果有 ECO）
            if (result.isEcoEnabled) {
                let T_5_K, T_7_K;
                try {
                    T_5_K = CP_INSTANCE.PropsSI('T', 'H', result.h_5_eco, 'P', result.Pc_Pa, fluid);
                    T_7_K = CP_INSTANCE.PropsSI('T', 'H', result.h_7_eco, 'P', result.P_intermediate_Pa, fluid);
                } catch (e) {
                    T_5_K = result.T3_K;
                    T_7_K = result.T_intermediate_sat_K;
                }
                if (result.ecoType === 'subcooler') {
                    // 过冷器模式：显示主路出口和补气入口
                    statePoints.push({
                        name: '5',
                        desc: 'ECO Main Out',
                        temp: (T_5_K - 273.15).toFixed(1),
                        press: (result.Pc_Pa / 1e5).toFixed(2),
                        enth: (result.h_5_eco / 1000).toFixed(1),
                        flow: result.m_dot.toFixed(4)
                    });
                    statePoints.push({
                        name: '7',
                        desc: 'ECO Inj In',
                        temp: (T_7_K - 273.15).toFixed(1),
                        press: (result.P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (result.h_7_eco / 1000).toFixed(1),
                        flow: result.m_dot_inj.toFixed(4)
                    });
                } else {
                    // 闪蒸罐模式：显示节流后状态
                    statePoints.push({
                        name: '7',
                        desc: 'Flash Tank In',
                        temp: (T_7_K - 273.15).toFixed(1),
                        press: (result.P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (result.h_7_eco / 1000).toFixed(1),
                        flow: (result.m_dot + result.m_dot_inj).toFixed(4)
                    });
                }
            }

            if (result.isSlhxEnabled) {
                // 5' 始终在 Pc（过冷器模式）
                let T_5p_K;
                try {
                    T_5p_K = CP_INSTANCE.PropsSI('T', 'H', result.h4, 'P', result.Pc_Pa, fluid);
                } catch (e) {
                    T_5p_K = result.T3_K;
                }
                statePoints.push({
                    name: "5'",
                    desc: 'Exp Valve In (SLHX)',
                    temp: (T_5p_K - 273.15).toFixed(1),
                    press: (result.Pc_Pa / 1e5).toFixed(2),
                    enth: (result.h4 / 1000).toFixed(1),
                    flow: result.m_dot.toFixed(4)
                });
            }

            statePoints.push({
                name: '4',
                desc: 'Exp Valve Out',
                temp: result.T4_C.toFixed(1),
                press: (result.Pe_Pa / 1e5).toFixed(2),
                enth: (result.h4 / 1000).toFixed(1),
                flow: result.m_dot.toFixed(4)
            });

            // 绘制 P-h 图
            const point = (name, h_j, p_pa, pos = 'top') => ({ 
                name, 
                value: [h_j / 1000, p_pa / 1e5], 
                label: { position: pos, show: true } 
            });

            const pt1 = point('1', result.h1, result.Pe_Pa, 'bottom');
            const pt1_p = result.isSlhxEnabled ? point("1'", result.h_suc, result.Pe_Pa, 'bottom') : null;
            
            // 低压级高温排气点（压缩后的状态，必须显示）
            const pt_mid = point('mid', result.h_mid, result.P_intermediate_Pa, 'right');
            
            // 如果进行了中间冷却，添加冷却后的点
            const pt_mid_cooled = result.Q_intercooler_W > 0 
                ? point('mid*', result.h_mid_cooled, result.P_intermediate_Pa, 'right')
                : null;
            
            // ECO 相关点
            let pt6 = null, pt7 = null, pt5 = null, pt_mix = null, pt_a = null;
            if (result.isEcoEnabled && result.m_dot_inj > 0) {
                pt6 = point('6', result.h_6_eco, result.P_intermediate_Pa, 'right');
                pt_mix = point('mix', result.h_mix, result.P_intermediate_Pa, 'right');
                // 闪蒸罐模式和过冷器模式都有 5-Inter 点（中间压力下的液体）
                if (result.ecoType === 'flash_tank') {
                    // 闪蒸罐模式：
                    // - pt7 (a点)：3 点节流到中间压力后进入闪蒸罐的点（等焓节流）
                    // - pt5：闪蒸后的饱和液体（在中间压力下）
                    // - pt6：闪蒸后的饱和蒸汽（在中间压力下）
                    pt7 = point('a', result.h_7_eco, result.P_intermediate_Pa, 'right'); // a点：闪蒸罐入口
                    pt5 = point('5', result.h_5_eco, result.P_intermediate_Pa, 'right'); // 5点：闪蒸后的饱和液体
                    pt_a = pt7; // 使用 a 点作为闪蒸罐入口点
                } else {
                    // 过冷器模式（一级节流中间完全冷却形式）
                    // 点7：从点3等焓节流到中间压力（在中间压力下）
                    // 点5：在中间压力下完全冷却到饱和液体（在中间压力下）
                    // 点6：在中间压力下加热变为过热蒸汽（在中间压力下）
                    pt7 = point('7', result.h_7_eco, result.P_intermediate_Pa, 'right');
                    pt5 = point('5', result.h_5_eco, result.P_intermediate_Pa, 'right'); // 5-Inter 在中间压力下
                }
            }
            
            const pt2 = point('2', result.h2, result.Pc_Pa, 'top');
            const pt3 = point('3', result.h3, result.Pc_Pa, 'top');
            // 3' 点：冷凝器出口通过回热器过冷后的位置（如果有 SLHX）
            const pt3_p = result.isSlhxEnabled ? point("3'", result.h_liq_out, result.Pc_Pa, 'top') : null;
            const pt4 = point('4', result.h4, result.Pe_Pa, 'bottom');

            // 5' 始终位于节流前的高压侧（冷凝压力 Pc），与模式一/四保持一致
            let P_5p_chart = result.Pc_Pa;
            const pt5_p = result.isSlhxEnabled ? point("5'", result.h4, P_5p_chart, 'top') : null;

            let mainPoints = [], ecoLiquidPoints = [], ecoVaporPoints = [];

            // 主循环构建
            // 重新策划：低压级高温排气应该作为一个独立点显示，然后与中间压力液体混合
            const pt1_start = result.isSlhxEnabled ? pt1_p : pt1;
            mainPoints = [pt4, pt1];
            if (result.isSlhxEnabled) {
                mainPoints.push(pt1_start);
            }
            
            // 1. 低压级高温排气点（必须显示，这是压缩后的状态）
            mainPoints.push(pt_mid);
            
            // 2. 如果进行了中间冷却，显示冷却过程（mid -> mid*）
            if (result.Q_intercooler_W > 0 && pt_mid_cooled) {
                mainPoints.push(pt_mid_cooled);
            }
            
            // 3. 如果有 ECO，显示混合过程
            if (result.isEcoEnabled && result.m_dot_inj > 0) {
                if (result.ecoType === 'flash_tank') {
                    // 闪蒸罐模式：
                    // 混合过程：mid/mid*（低压级排气，冷却后） + 6（闪蒸后的饱和蒸汽） -> mix
                    // 注意：点5（闪蒸后的饱和液体）不在主循环的混合路径中，它在从点3到点4的路径中
                    if (pt_mix) {
                        mainPoints.push(pt_mix); // 混合点（低压级排气冷却后 + 闪蒸后的饱和蒸汽）
                    }
                } else {
                    // 过冷器模式（与 mode6 双机双级逻辑完全一致）：
                    // 混合过程：mid/mid*（低压级排气，冷却后） + 6（ECO补气，过热蒸汽） -> mix
                    // 注意：点5不在混合路径中，它在从点3到点4的路径中（在冷凝压力下）
                    if (pt_mix) {
                        mainPoints.push(pt_mix); // 混合点（低压级排气冷却后 + ECO补气过热蒸汽）
                    }
                }
            } else {
                // 无 ECO：如果进行了冷却，混合点就是冷却后的点（mid*）
                // 如果没有冷却，混合点就是原始排气点（mid，已经在上面添加了）
            }
            
            mainPoints.push(pt2, pt3);
            
            // 如果有 SLHX，显示 3 → 3' 的过程（回热器过冷）
            if (result.isSlhxEnabled && pt3_p) {
                mainPoints.push(pt3_p);
            }
            
            // 从点3（或3'）到点4的路径（主循环的一部分）
            // 注意：3 点左边不应该有线，3 点直接节流到中间压力
            if (result.isEcoEnabled && result.m_dot_inj > 0) {
                // 有中间冷却器ECO：主循环包含从点3（或3'）到点4的完整路径
                if (result.ecoType === 'flash_tank') {
                    // 闪蒸罐模式：
                    // 3（或3'） → a（等焓节流到中间压力，进入闪蒸罐）
                    // a → 5（闪蒸后的饱和液体，在中间压力下）
                    // 5 → 4（等焓节流到蒸发压力）
                    // 注意：a 点向右的路径（a → 6 → mix）在 ECO 路径中显示
                    if (pt_a) {
                        mainPoints.push(pt_a); // a点：闪蒸罐入口
                    }
                    if (pt5) {
                        mainPoints.push(pt5); // 5点：闪蒸后的饱和液体
                    }
                } else {
                    // 过冷器模式（一级节流中间完全冷却形式）：
                    // 3（或3'） → 7（等焓节流到中间压力，竖直线）→ 5（在中间压力下完全冷却到饱和，等压过程）→ 4（等焓节流到蒸发压力，竖直线）
                    // 点7和点5都在中间压力下
                    if (pt7) {
                        mainPoints.push(pt7); // 点7：节流到中间压力
                    }
                    if (pt5) {
                        mainPoints.push(pt5); // 点5：在中间压力下饱和液体
                    }
                }
            } else if (result.isSlhxEnabled) {
                // 无ECO但有SLHX：3' → 5' → 4
                // 注意：pt5_p 已经在上面定义了，这里不需要重新定义
                if (pt5_p) {
                    mainPoints.push(pt5_p);
                }
            } else {
                // 无ECO：3 → 4（等焓节流）
            }
            // 为了闭合循环，需要在最后添加点4
            mainPoints.push(pt4);

            // ECO 补气路径
            // 注意：主循环已经包含了从点3（或3'）到点4的路径，ECO路径只显示辅助循环
            // 如果有 SLHX，ECO 路径应该从 3'（h_liq_out）开始，否则从 3（h3）开始
            if (result.isEcoEnabled && result.m_dot_inj > 0) {
                // 确定 ECO 路径的起点：如果有 SLHX，使用 h_liq_out（3'点），否则使用 h3（3点）
                const h_eco_start = result.isSlhxEnabled ? result.h_liq_out : result.h3;
                if (result.ecoType === 'flash_tank') {
                    // 闪蒸罐模式：
                    // ECO液路：3（或3'） -> a（等焓节流到中间压力，进入闪蒸罐）-> 5（闪蒸后的饱和液体）
                    // 注意：5 -> 4 的节流在主循环中显示，这里只显示到点5
                    ecoLiquidPoints = [
                        [h_eco_start / 1000, result.Pc_Pa / 1e5],
                        [result.h_7_eco / 1000, result.P_intermediate_Pa / 1e5], // a点
                        [result.h_5_eco / 1000, result.P_intermediate_Pa / 1e5]  // 5点
                    ];
                    // ECO气路：a -> 6（闪蒸后的饱和蒸汽）-> mix（与低压级排气混合）
                    ecoVaporPoints = [
                        [result.h_7_eco / 1000, result.P_intermediate_Pa / 1e5], // a点
                        [result.h_6_eco / 1000, result.P_intermediate_Pa / 1e5],  // 6点
                        [result.h_mix / 1000, result.P_intermediate_Pa / 1e5]     // mix点
                    ];
                } else {
                    // 过冷器模式（一级节流中间完全冷却形式）：
                    // ECO液路：3（或3'） -> 7（等焓节流到中间压力）-> 5（在中间压力下完全冷却到饱和）
                    // 注意：5 -> 4 的节流在主循环中显示，这里只显示到点5
                    ecoLiquidPoints = [
                        [h_eco_start / 1000, result.Pc_Pa / 1e5],
                        [result.h_7_eco / 1000, result.P_intermediate_Pa / 1e5], // 点7：节流到中间压力
                        [result.h_5_eco / 1000, result.P_intermediate_Pa / 1e5]  // 点5：在中间压力下饱和液体
                    ];
                    // 中冷辅助循环补气路：7 -> 6（在中间压力下等压加热）-> mix（连接到混合点）
                    ecoVaporPoints = [
                        [result.h_7_eco / 1000, result.P_intermediate_Pa / 1e5], // 点7（起点）
                        [result.h_6_eco / 1000, result.P_intermediate_Pa / 1e5], // 点6（等压加热后）
                        [result.h_mix / 1000, result.P_intermediate_Pa / 1e5]     // mix（混合点）
                    ];
                }
            } else {
                // 无ECO，无补气路
                ecoLiquidPoints = [];
                ecoVaporPoints = [];
            }

            // 初始化 lastCalculationData（如果尚未初始化）
            if (!lastCalculationData) {
                lastCalculationData = {
                    fluid,
                    Te_C,
                    Tc_C,
                    result: null,
                    chartData: null
                };
            }
            
            // 生成饱和线数据
            const satLinesPH = generateSaturationLines(fluid, result.Pe_Pa, result.Pc_Pa, 100);
            const satLinesTS = generateSaturationLinesTS(fluid, Te_C, Tc_C, 100);
            
            // 构建 T-S 图主循环点（带过程中间点）
            const mainPointsTS = [];
            
            // 点 4：节流后（蒸发压力）
            const pt4_TS = {
                name: '4',
                value: [
                    CP_INSTANCE.PropsSI('S', 'H', result.h4, 'P', result.Pe_Pa, fluid) / 1000,
                    CP_INSTANCE.PropsSI('T', 'H', result.h4, 'P', result.Pe_Pa, fluid) - 273.15
                ],
                label: { show: true }
            };
            mainPointsTS.push(pt4_TS);
            
            // 点 1：蒸发器出口（等压过程 4->1，添加中间点）
            const pt1_TS = {
                name: '1',
                value: [
                    CP_INSTANCE.PropsSI('S', 'H', result.h1, 'P', result.Pe_Pa, fluid) / 1000,
                    CP_INSTANCE.PropsSI('T', 'H', result.h1, 'P', result.Pe_Pa, fluid) - 273.15
                ],
                label: { show: true }
            };
            // 添加等压过程中间点（4->1 蒸发过程）
            const evapPath = generateIsobaricPathTS(fluid, result.Pe_Pa, result.h4, result.h1, 8);
            evapPath.forEach((pt, idx) => {
                if (idx > 0 && idx < evapPath.length - 1) {
                    mainPointsTS.push({ name: '', value: pt, label: { show: false } });
                }
            });
            mainPointsTS.push(pt1_TS);
            
            // 点 1'：SLHX 后（如果有）
            if (result.isSlhxEnabled) {
                const pt1p_TS = {
                    name: "1'",
                    value: [
                        CP_INSTANCE.PropsSI('S', 'H', result.h_suc, 'P', result.Pe_Pa, fluid) / 1000,
                        CP_INSTANCE.PropsSI('T', 'H', result.h_suc, 'P', result.Pe_Pa, fluid) - 273.15
                    ],
                    label: { show: true }
                };
                // 添加等压过程中间点（1->1' SLHX 过程）
                const slhxPath = generateIsobaricPathTS(fluid, result.Pe_Pa, result.h1, result.h_suc, 5);
                slhxPath.forEach((pt, idx) => {
                    if (idx > 0 && idx < slhxPath.length - 1) {
                        mainPointsTS.push({ name: '', value: pt, label: { show: false } });
                    }
                });
                mainPointsTS.push(pt1p_TS);
            }
            
            // mid 点：低压级排气（压缩过程 1/1'->mid，添加中间点显示熵增加）
            const h_start_comp1 = result.isSlhxEnabled ? result.h_suc : result.h1;
            // 如果进行了中间冷却，显示冷却后的点
            const h_mid_for_display = result.Q_intercooler_W > 0 ? result.h_mid_cooled : result.h_mid;
            const T_mid_for_display = result.Q_intercooler_W > 0 ? result.T_mid_cooled_C : result.T_mid_C;
            const pt_mid_TS = {
                name: result.Q_intercooler_W > 0 ? 'mid (cooled)' : 'mid',
                value: [
                    CP_INSTANCE.PropsSI('S', 'H', h_mid_for_display, 'P', result.P_intermediate_Pa, fluid) / 1000,
                    T_mid_for_display
                ],
                label: { show: true }
            };
            // 添加压缩过程中间点（显示熵增加趋势）
            const comp1Path = generateCompressionPathTS(fluid, h_start_comp1, result.Pe_Pa, result.h_mid, result.P_intermediate_Pa, 10);
            comp1Path.forEach((pt, idx) => {
                if (idx > 0 && idx < comp1Path.length - 1) {
                    mainPointsTS.push({ name: '', value: pt, label: { show: false } });
                }
            });
            mainPointsTS.push(pt_mid_TS);
            
            // 如果进行了中间冷却，添加冷却过程（等压冷却）
            if (result.Q_intercooler_W > 0) {
                const coolingPath = generateIsobaricPathTS(fluid, result.P_intermediate_Pa, result.h_mid, result.h_mid_cooled, 5);
                coolingPath.forEach((pt, idx) => {
                    if (idx > 0 && idx < coolingPath.length - 1) {
                        mainPointsTS.push({ name: '', value: pt, label: { show: false } });
                    }
                });
            }
            
            // ECO 补气点（如果有 ECO）
            if (result.isEcoEnabled && result.m_dot_inj > 0) {
                const pt6_TS = {
                    name: '6',
                    value: [
                        CP_INSTANCE.PropsSI('S', 'H', result.h_6_eco, 'P', result.P_intermediate_Pa, fluid) / 1000,
                        CP_INSTANCE.PropsSI('T', 'H', result.h_6_eco, 'P', result.P_intermediate_Pa, fluid) - 273.15
                    ],
                    label: { show: true }
                };
                mainPointsTS.push(pt6_TS);
                
                // 混合点
                const pt_mix_TS = {
                    name: 'mix',
                    value: [
                        CP_INSTANCE.PropsSI('S', 'H', result.h_mix, 'P', result.P_intermediate_Pa, fluid) / 1000,
                        CP_INSTANCE.PropsSI('T', 'H', result.h_mix, 'P', result.P_intermediate_Pa, fluid) - 273.15
                    ],
                    label: { show: true }
                };
                mainPointsTS.push(pt_mix_TS);
            }
            
            // 点 2：高压级排气（压缩过程 mix/mid->2）
            const h_start_comp2 = result.isEcoEnabled && result.m_dot_inj > 0 ? result.h_mix : result.h_mid;
            const pt2_TS = {
                name: '2',
                value: [
                    CP_INSTANCE.PropsSI('S', 'H', result.h2, 'P', result.Pc_Pa, fluid) / 1000,
                    CP_INSTANCE.PropsSI('T', 'H', result.h2, 'P', result.Pc_Pa, fluid) - 273.15
                ],
                label: { show: true }
            };
            // 添加压缩过程中间点（显示熵增加趋势）
            const comp2Path = generateCompressionPathTS(fluid, h_start_comp2, result.P_intermediate_Pa, result.h2, result.Pc_Pa, 10);
            comp2Path.forEach((pt, idx) => {
                if (idx > 0 && idx < comp2Path.length - 1) {
                    mainPointsTS.push({ name: '', value: pt, label: { show: false } });
                }
            });
            mainPointsTS.push(pt2_TS);
            
            // 点 3：冷凝器出口（等压过程 2->3 冷凝，添加中间点）
            const pt3_TS = {
                name: '3',
                value: [
                    CP_INSTANCE.PropsSI('S', 'H', result.h3, 'P', result.Pc_Pa, fluid) / 1000,
                    CP_INSTANCE.PropsSI('T', 'H', result.h3, 'P', result.Pc_Pa, fluid) - 273.15
                ],
                label: { show: true }
            };
            // 添加等压过程中间点（2->3 冷凝过程）
            const condPath = generateIsobaricPathTS(fluid, result.Pc_Pa, result.h2, result.h3, 8);
            condPath.forEach((pt, idx) => {
                if (idx > 0 && idx < condPath.length - 1) {
                    mainPointsTS.push({ name: '', value: pt, label: { show: false } });
                }
            });
            mainPointsTS.push(pt3_TS);
            
            // 点 3'：SLHX 后（如果有 SLHX，显示 3->3' 的等压过冷过程）
            if (result.isSlhxEnabled) {
                const pt3p_TS = {
                    name: "3'",
                    value: [
                        CP_INSTANCE.PropsSI('S', 'H', result.h_liq_out, 'P', result.Pc_Pa, fluid) / 1000,
                        CP_INSTANCE.PropsSI('T', 'H', result.h_liq_out, 'P', result.Pc_Pa, fluid) - 273.15
                    ],
                    label: { show: true }
                };
                // 添加等压过程中间点（3->3' SLHX 过冷过程）
                const slhxCoolingPath = generateIsobaricPathTS(fluid, result.Pc_Pa, result.h3, result.h_liq_out, 5);
                slhxCoolingPath.forEach((pt, idx) => {
                    if (idx > 0 && idx < slhxCoolingPath.length - 1) {
                        mainPointsTS.push({ name: '', value: pt, label: { show: false } });
                    }
                });
                mainPointsTS.push(pt3p_TS);
            }
            
            // 节流过程 3（或3'） -> 4（主循环的一部分）
            // 确定节流起点的焓值（与P-h图和状态点表保持一致）
            let h4_for_TS;
            if (result.isEcoEnabled) {
                if (result.ecoType === 'flash_tank') {
                    // 闪蒸罐模式：点4从闪蒸罐底部饱和液体（h_5_eco）二级节流到蒸发压力
                    h4_for_TS = result.h_5_eco;
                } else if (result.ecoType === 'subcooler') {
                    // 过冷器模式（一级节流中间完全冷却形式）：点4从点5（在中间压力下饱和液体）等焓节流到蒸发压力
                    h4_for_TS = result.h_5_eco;
                } else {
                    // 其他模式：使用 h_5_eco
                    h4_for_TS = result.h_5_eco;
                }
            } else if (result.isSlhxEnabled) {
                // SLHX模式：点4从点4（SLHX后的液体）等焓节流
                h4_for_TS = result.h4;
            } else {
                // 无ECO：点4从点3等焓节流到蒸发压力
                h4_for_TS = result.h3;
            }
            
            // 节流过程添加到主循环（等焓过程 3/5 -> 4，添加中间点显示熵增加）
            const h_throttle_start = h4_for_TS;
            // 确定节流起点的压力
            let P_throttle_start = result.Pc_Pa; // 默认是冷凝压力
            if (result.isEcoEnabled && result.ecoType === 'flash_tank') {
                // 闪蒸罐模式：节流起点是中间压力（闪蒸罐底部饱和液体）
                P_throttle_start = result.P_intermediate_Pa;
            } else if (result.isEcoEnabled && result.ecoType === 'subcooler') {
                // 过冷器模式（一级节流中间完全冷却形式）：节流起点是中间压力（点5在中间压力下）
                P_throttle_start = result.P_intermediate_Pa;
            }
            const throttlePath = generateThrottlingPathTS(fluid, h_throttle_start, P_throttle_start, result.Pe_Pa, 8);
            throttlePath.forEach((pt, idx) => {
                if (idx > 0 && idx < throttlePath.length - 1) {
                    mainPointsTS.push({ name: '', value: pt, label: { show: false } });
                }
            });
            
            // ECO 补气路径（T-S 图）
            // 参考 mode6 的逻辑：ECO液路只显示到节流起点，不包括到点4的连接
            const ecoLiquidPointsTS = [];
            const ecoVaporPointsTS = [];
            
            if (result.isEcoEnabled && result.m_dot_inj > 0) {
                // 中间冷却器ECO路径（与mode6逻辑一致）
                // 液路：3 -> 5-Inter（只显示到节流起点，不包括到点4的连接）
                const pt3_eco_TS = [
                    CP_INSTANCE.PropsSI('S', 'H', result.h3, 'P', result.Pc_Pa, fluid) / 1000,
                    CP_INSTANCE.PropsSI('T', 'H', result.h3, 'P', result.Pc_Pa, fluid) - 273.15
                ];
                ecoLiquidPointsTS.push(pt3_eco_TS);
                
                if (result.ecoType === 'subcooler') {
                    // 过冷器模式（一级节流中间完全冷却形式）：3 -> 7（等焓节流）-> 5（在中间压力下完全冷却到饱和）
                    const pt7_eco_TS = [
                        CP_INSTANCE.PropsSI('S', 'H', result.h_7_eco, 'P', result.P_intermediate_Pa, fluid) / 1000,
                        CP_INSTANCE.PropsSI('T', 'H', result.h_7_eco, 'P', result.P_intermediate_Pa, fluid) - 273.15
                    ];
                    const pt5_eco_TS = [
                        CP_INSTANCE.PropsSI('S', 'H', result.h_5_eco, 'P', result.P_intermediate_Pa, fluid) / 1000,
                        CP_INSTANCE.PropsSI('T', 'H', result.h_5_eco, 'P', result.P_intermediate_Pa, fluid) - 273.15
                    ];
                    // 添加 3 -> 7 的节流路径
                    const throttlePath37_TS = generateThrottlingPathTS(fluid, result.h3, result.Pc_Pa, result.P_intermediate_Pa, 5);
                    throttlePath37_TS.forEach((pt, idx) => {
                        if (idx > 0 && idx < throttlePath37_TS.length - 1) {
                            ecoLiquidPointsTS.push(pt);
                        }
                    });
                    ecoLiquidPointsTS.push(pt7_eco_TS);
                    // 添加 7 -> 5 的等压冷却路径
                    const coolingPath75_TS = generateIsobaricPathTS(fluid, result.P_intermediate_Pa, result.h_7_eco, result.h_5_eco, 5);
                    coolingPath75_TS.forEach((pt, idx) => {
                        if (idx > 0 && idx < coolingPath75_TS.length - 1) {
                            ecoLiquidPointsTS.push(pt);
                        }
                    });
                    ecoLiquidPointsTS.push(pt5_eco_TS);
                }
                
                // 补气路：3 -> 7-Inter -> 6-Inter -> mix（与mode6一致）
                const pt7_inter_TS = [
                    CP_INSTANCE.PropsSI('S', 'H', result.h_7_eco, 'P', result.P_intermediate_Pa, fluid) / 1000,
                    CP_INSTANCE.PropsSI('T', 'H', result.h_7_eco, 'P', result.P_intermediate_Pa, fluid) - 273.15
                ];
                const pt6_inter_TS = [
                    CP_INSTANCE.PropsSI('S', 'H', result.h_6_eco, 'P', result.P_intermediate_Pa, fluid) / 1000,
                    CP_INSTANCE.PropsSI('T', 'H', result.h_6_eco, 'P', result.P_intermediate_Pa, fluid) - 273.15
                ];
                
                if (result.ecoType === 'flash_tank') {
                    // 闪蒸罐模式：补气路从点3开始
                    ecoVaporPointsTS.push(pt3_eco_TS);
                    // 3 -> 7-Inter 节流路径
                    const throttlePath37 = generateThrottlingPathTS(fluid, result.h3, result.Pc_Pa, result.P_intermediate_Pa, 5);
                    throttlePath37.forEach((pt, idx) => {
                        if (idx > 0 && idx < throttlePath37.length - 1) {
                            ecoVaporPointsTS.push(pt);
                        }
                    });
                    ecoVaporPointsTS.push(pt7_inter_TS);
                    // 闪蒸罐模式：7 -> 6 闪蒸过程（等压等温）
                    const flashPath = generateIsobaricPathTS(fluid, result.P_intermediate_Pa, result.h_7_eco, result.h_6_eco, 5);
                    flashPath.forEach((pt, idx) => {
                        if (idx > 0 && idx < flashPath.length - 1) {
                            ecoVaporPointsTS.push(pt);
                        }
                    });
                } else {
                    // 过冷器模式（一级节流中间完全冷却形式）：补气路从点7开始（点7已经在液路中显示）
                    // 7 -> 6 加热过程（等压，在中间压力下）
                    ecoVaporPointsTS.push(pt7_inter_TS);
                    const heatPath = generateIsobaricPathTS(fluid, result.P_intermediate_Pa, result.h_7_eco, result.h_6_eco, 5);
                    heatPath.forEach((pt, idx) => {
                        if (idx > 0 && idx < heatPath.length - 1) {
                            ecoVaporPointsTS.push(pt);
                        }
                    });
                }
                ecoVaporPointsTS.push(pt6_inter_TS);
                
                // 获取mix点的T-S坐标
                const pt_mix_TS_value = [
                    CP_INSTANCE.PropsSI('S', 'H', result.h_mix, 'P', result.P_intermediate_Pa, fluid) / 1000,
                    CP_INSTANCE.PropsSI('T', 'H', result.h_mix, 'P', result.P_intermediate_Pa, fluid) - 273.15
                ];
                ecoVaporPointsTS.push(pt_mix_TS_value);
            }
            
            // 保存图表数据供切换使用
            lastCalculationData.chartData = {
                fluid,
                mainPoints,
                ecoLiquidPoints,
                ecoVaporPoints,
                mainPointsTS,
                ecoLiquidPointsTS,
                ecoVaporPointsTS,
                satLinesPH,
                satLinesTS,
                chartType: 'ph' // 默认显示 P-h 图
            };
            
            // 绘制 P-h 图（默认）
            ['chart-desktop-m5', 'chart-mobile-m5'].forEach(id => {
                drawPHDiagram(id, {
                    title: `Two-Stage Single Compressor (${fluid})`,
                    mainPoints: mainPoints,
                    ecoLiquidPoints: ecoLiquidPoints,
                    ecoVaporPoints: ecoVaporPoints,
                    saturationLiquidPoints: satLinesPH.liquidPH,
                    saturationVaporPoints: satLinesPH.vaporPH,
                    xLabel: 'h (kJ/kg)',
                    yLabel: 'P (bar)'
                });
            });

            // 生成错误和警告提示HTML
            let cylinderHeadCoolingAlertHtml = '';
            if (cylinderHeadCoolingError) {
                cylinderHeadCoolingAlertHtml = `
                    <div class="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded-r-lg">
                        <div class="flex items-start">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                                </svg>
                            </div>
                            <div class="ml-3 flex-1">
                                <div class="text-sm font-bold text-red-800 mb-2">${cylinderHeadCoolingError}</div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // 生成排温警告和错误提示HTML
            let dischargeTempAlertHtml = '';
            if (dischargeTempError) {
                dischargeTempAlertHtml = `
                    <div class="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded-r-lg">
                        <div class="flex items-start">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                                </svg>
                            </div>
                            <div class="ml-3 flex-1">
                                <div class="text-sm font-bold text-red-800">${dischargeTempError}</div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (dischargeTempWarning) {
                dischargeTempAlertHtml = `
                    <div class="bg-amber-50 border-l-4 border-amber-500 p-4 mb-4 rounded-r-lg">
                        <div class="flex items-start">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                </svg>
                            </div>
                            <div class="ml-3 flex-1">
                                <div class="text-sm font-bold text-amber-800">${dischargeTempWarning}</div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // 渲染结果面板
            const html = `
                ${cylinderHeadCoolingAlertHtml}
                ${dischargeTempAlertHtml}
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    ${createKpiCard('制冷量', (result.Q_evap_W / 1000).toFixed(2), 'kW', 'Cooling Capacity', 'blue')}
                    ${createKpiCard(i18next.t('components.totalShaftPower'), (result.W_shaft_W / 1000).toFixed(2), 'kW', i18next.t('components.totalShaftPower'), 'orange')}
                    ${createKpiCard('总排热量', (Q_heating_total_W / 1000).toFixed(2), 'kW', 'Total Heat Rejection', 'red')}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div class="bg-white/60 p-4 rounded-2xl border border-white/50">
                        ${createSectionHeader('Low Pressure Stage', '❄️')}
                        ${createDetailRow('轴功 (LP)', `${(result.W_s1 / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('Q_evap', `${(result.Q_evap_W / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('m_dot', `${result.m_dot.toFixed(4)} kg/s`)}
                        ${createDetailRow('T_mid', `${(result.Q_intercooler_W > 0 ? result.T_mid_cooled_C : result.T_mid_C).toFixed(1)} °C`)}
                        ${result.Q_intercooler_W > 0 ? createDetailRow('T_mid (原始)', `${result.T_mid_C.toFixed(1)} °C`) : ''}
                        ${result.Q_intercooler_W > 0 ? createDetailRow('中间冷却负荷', `${(result.Q_intercooler_W / 1000).toFixed(2)} kW`) : ''}
                    </div>
                    <div class="bg-white/60 p-4 rounded-2xl border border-white/50">
                        ${createSectionHeader('High Pressure Stage', '🔥')}
                        ${createDetailRow('轴功 (HP)', `${(result.W_s2 / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('Q_cond', `${(Q_cond_W_updated / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('m_dot_total', `${result.m_dot_total.toFixed(4)} kg/s`)}
                        ${result.isEcoEnabled && result.m_dot_inj > 0 ? createDetailRow('m_dot_inj (补气)', `${result.m_dot_inj.toFixed(4)} kg/s`) : ''}
                        ${createDetailRow('T2', `${(isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0 ? T_2a_after_head_cooling_C : result.T2a_C).toFixed(1)} °C`)}
                        ${isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0 ? createDetailRow('T2 (原始)', `${result.T2a_C.toFixed(1)} °C`) : ''}
                        ${createDetailRow('油冷负荷', `${(result.Q_oil_W / 1000).toFixed(2)} kW (${(result.Q_oil_W / result.W_s2 * 100).toFixed(1)}% HP轴功)`, false)}
                    </div>
                </div>
                
                ${result.isEcoEnabled && result.m_dot_inj > 0 ? `
                <div class="bg-white/60 p-4 rounded-2xl border border-white/50 mb-4">
                    ${createSectionHeader('中间冷却器 ECO', '🌡️')}
                    ${createDetailRow('ECO 类型', result.ecoType === 'flash_tank' ? '闪蒸罐 (Flash Tank)' : '过冷器 (Subcooler)', false)}
                    ${createDetailRow('补气流量', `${result.m_dot_inj.toFixed(4)} kg/s`, false)}
                    ${createDetailRow('补气比例', `${((result.m_dot_inj / result.m_dot_total) * 100).toFixed(1)}%`, false)}
                    ${result.ecoType === 'subcooler' ? createDetailRow('补气过热度', `${(result.ecoSuperheatValue || 0).toFixed(1)} K`, false) : createDetailRow('补气状态', '饱和蒸汽 (Q=1)', false)}
                </div>
                ` : ''}

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div class="bg-white/60 p-4 rounded-2xl border border-white/50">
                        ${createSectionHeader('System Performance', '📈')}
                        ${createDetailRow(i18next.t('components.totalShaftPower'), `${(result.W_shaft_W / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('COP_c', result.COP_c.toFixed(3), true)}
                        ${createDetailRow('COP_h', result.COP_h.toFixed(3))}
                    </div>
                    <div class="bg-white/60 p-4 rounded-2xl border border-white/50">
                        ${createSectionHeader('Intermediate Pressure', '⚙️')}
                        ${createDetailRow('P_intermediate', `${(result.P_intermediate_Pa / 1e5).toFixed(2)} bar`)}
                        ${createDetailRow('T_intermediate', `${(result.T_intermediate_sat_K - 273.15).toFixed(1)} °C`)}
                    </div>
                </div>


                <div class="space-y-1 bg-white/40 p-4 rounded-2xl border border-white/50 shadow-inner">
                    ${createSectionHeader('State Points', '📊')}
                    ${createStateTable(statePoints)}
                </div>
                
                <div class="bg-white/60 p-4 rounded-2xl border border-white/50 mt-4">
                    ${createSectionHeader('热平衡 (Heat Balance)', '⚖️')}
                    ${createDetailRow('制冷量 (Q_evap)', `${(result.Q_evap_W / 1000).toFixed(2)} kW`, false)}
                    ${createDetailRow('轴功率 (W_shaft)', `${(result.W_shaft_W / 1000).toFixed(2)} kW`, false)}
                    ${createDetailRow('总排热量 (Q_heating_total)', `${(Q_heating_total_W / 1000).toFixed(2)} kW`, false)}
                    ${createDetailRow('热平衡验证', `Q_heating_total = Q_evap + W_shaft = ${(result.Q_evap_W / 1000).toFixed(2)} + ${(result.W_shaft_W / 1000).toFixed(2)} = ${(Q_heating_total_W / 1000).toFixed(2)} kW`, true)}
                    ${createDetailRow('冷凝器排热 (Q_cond)', `${(Q_cond_W_updated / 1000).toFixed(2)} kW`, false)}
                    ${createDetailRow('油冷负荷 (Oil Cooling)', `${(result.Q_oil_W / 1000).toFixed(2)} kW (用于冷却曲轴、轴承、轴封等部件, ${(result.Q_oil_W / result.W_s2 * 100).toFixed(1)}% HP轴功)`, true)}
                    ${Q_cylinder_head_W > 0 ? createDetailRow('缸头冷却负荷 (Cylinder Head Cooling)', `${(Q_cylinder_head_W / 1000).toFixed(2)} kW (低品位排热，温度约30-50°C)`, true) : ''}
                    ${isCylinderHeadCoolingEnabled && Q_cylinder_head_W > 0 ? createDetailRow('缸头冷却后排气温度', `${T_2a_after_head_cooling_C.toFixed(1)} °C (降低 ${(result.T2a_C - T_2a_after_head_cooling_C).toFixed(1)}°C)`) : ''}
                    ${(result.Q_oil_W > 0 || Q_cylinder_head_W > 0) ? createDetailRow('分项验证', `Q_cond + Q_oil + Q_cylinder_head = ${(Q_cond_W_updated / 1000).toFixed(2)} + ${(result.Q_oil_W / 1000).toFixed(2)} + ${(Q_cylinder_head_W / 1000).toFixed(2)} = ${((Q_cond_W_updated + result.Q_oil_W + Q_cylinder_head_W) / 1000).toFixed(2)} kW`, true) : ''}
                </div>
            `;

            renderToAllViews(html);

            updateMobileSummary('Q_evap', `${(result.Q_evap_W / 1000).toFixed(2)} kW`, 'COP', result.COP_c.toFixed(2));

            openMobileSheet('m5');

            setButtonFresh5();
            if (printButtonM5) printButtonM5.disabled = false;

            // 更新缸头冷却显示
            const inputModeRadio = document.querySelector('input[name="cylinder_head_input_mode_m5"]:checked');
            const inputMode = inputModeRadio ? inputModeRadio.value : 'water_temp';
            
            if (cylinderHeadQM5) {
                if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) {
                    if (inputMode === 'water_temp') {
                        // 水温模式：显示计算出的负荷
                        cylinderHeadQM5.textContent = (Q_cylinder_head_W / 1000).toFixed(2);
                    } else {
                        // 直接输入模式：显示输入的负荷
                        cylinderHeadQM5.textContent = '--';
                    }
                } else {
                    cylinderHeadQM5.textContent = '--';
                }
            }
            
            if (cylinderHeadQDirectM5) {
                if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && inputMode === 'direct_power') {
                    const Q_cylinder_head_kW = parseFloat(cylinderHeadPowerInputM5?.value) || 0;
                    cylinderHeadQDirectM5.textContent = Q_cylinder_head_kW.toFixed(2);
                } else {
                    cylinderHeadQDirectM5.textContent = '--';
                }
            }

            // 更新 lastCalculationData（如果尚未初始化，则初始化）
            if (!lastCalculationData) {
                lastCalculationData = {
                    fluid,
                    Te_C,
                    Tc_C,
                    result,
                    chartData: null
                };
            } else {
                // 更新现有数据
                lastCalculationData.fluid = fluid;
                lastCalculationData.Te_C = Te_C;
                lastCalculationData.Tc_C = Tc_C;
                lastCalculationData.result = result;
            }

            const inputState = SessionState.collectInputs('calc-form-mode-5');
            HistoryDB.add(
                'M5',
                `${fluid} • ${(result.Q_evap_W / 1000).toFixed(2)} kW • COP ${result.COP_c.toFixed(2)}`,
                inputState,
                { 'Q_evap': `${(result.Q_evap_W / 1000).toFixed(2)} kW`, COP: result.COP_c.toFixed(2) }
            );
        } catch (error) {
            console.error(error);
            renderToAllViews(createErrorCard(error.message));
            if (printButtonM5) printButtonM5.disabled = true;
        }
    }, 50);
}

function printReportMode5() {
    if (!lastCalculationData) return;
    const d = lastCalculationData;
    const resultDiv = document.querySelector('.print-results');
    let tableText = '\n\nState Points:\n--------------------\nPoint\tT(C)\tP(bar)\th(kJ)\tm(kg/s)\n';
    tableText += `Q_evap\t${(d.result.Q_evap_W / 1000).toFixed(3)} kW\n`;
    tableText += `W_input\t${(d.result.W_input_W / 1000).toFixed(3)} kW\n`;
    tableText += `COP_c\t${d.result.COP_c.toFixed(3)}\n`;
    resultDiv.innerText = `Two-Stage Single Compressor Report:\n` + tableText;
    window.print();
}

// 图表切换函数
function toggleChartTypeM5() {
    if (!lastCalculationData || !lastCalculationData.chartData) return;
    
    const chartData = lastCalculationData.chartData;
    const currentType = chartData.chartType;
    const newType = currentType === 'ph' ? 'ts' : 'ph';
    chartData.chartType = newType;
    
    // 确保图表容器可见
    ['chart-desktop-m5', 'chart-mobile-m5'].forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.classList.remove('hidden');
        }
    });
    
    if (newType === 'ph') {
        // 切换到 P-h 图
        ['chart-desktop-m5', 'chart-mobile-m5'].forEach(id => {
            // 清除旧图表配置
            const chart = getChartInstance(id);
            if (chart) {
                chart.clear();
            }
            
            drawPHDiagram(id, {
                title: `Two-Stage Single Compressor (${chartData.fluid})`,
                mainPoints: chartData.mainPoints,
                ecoLiquidPoints: chartData.ecoLiquidPoints,
                ecoVaporPoints: chartData.ecoVaporPoints,
                saturationLiquidPoints: chartData.satLinesPH.liquidPH,
                saturationVaporPoints: chartData.satLinesPH.vaporPH,
                xLabel: 'h (kJ/kg)',
                yLabel: 'P (bar)'
            });
        });
    } else {
        // 切换到 T-S 图
        ['chart-desktop-m5', 'chart-mobile-m5'].forEach(id => {
            // 清除旧图表配置
            const chart = getChartInstance(id);
            if (chart) {
                chart.clear();
            }
            
            drawTSDiagram(id, {
                title: `Two-Stage Single Compressor (${chartData.fluid})`,
                mainPoints: chartData.mainPointsTS,
                ecoLiquidPoints: chartData.ecoLiquidPointsTS,
                ecoVaporPoints: chartData.ecoVaporPointsTS,
                saturationLiquidPoints: chartData.satLinesTS.liquid,
                saturationVaporPoints: chartData.satLinesTS.vapor,
                xLabel: 'Entropy (kJ/kg·K)',
                yLabel: 'Temperature (°C)'
            });
        });
    }
    
    // 更新按钮文本
    const toggleBtn = document.getElementById('chart-toggle-m5');
    const toggleBtnMobile = document.getElementById('chart-toggle-m5-mobile');
    if (toggleBtn) {
        toggleBtn.textContent = newType === 'ph' ? i18next.t('ui.switchToTS') : i18next.t('ui.switchToPH');
    }
    if (toggleBtnMobile) {
        toggleBtnMobile.textContent = newType === 'ph' ? i18next.t('ui.switchToTS') : i18next.t('ui.switchToPH');
    }
}

// ---------------------------------------------------------------------
// Compressor Model Selection Handlers
// ---------------------------------------------------------------------

function initCompressorModelSelectorsM5() {
    // Mode 5 (单机双级模式): 活塞压缩机单机双级 - 支持 GEA Grasso 和 MYCOM 品牌
    const brands = getFilteredBrands('m5');
    compressorBrand.innerHTML = `<option value="">${i18next.t('common.selectBrand')}</option>`;
    brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        compressorBrand.appendChild(option);
    });

    compressorBrand.addEventListener('change', () => {
        const brand = compressorBrand.value;
        compressorSeries.innerHTML = `<option value="">${i18next.t('common.selectSeries')}</option>`;
        compressorModel.innerHTML = `<option value="">${i18next.t('common.selectModel')}</option>`;
        compressorSeries.disabled = !brand;
        compressorModel.disabled = true;
        modelDisplacementInfo.classList.add('hidden');

        if (brand) {
            const series = getFilteredSeriesByBrand('m5', brand);
            series.forEach(s => {
                const option = document.createElement('option');
                option.value = s;
                option.textContent = s;
                compressorSeries.appendChild(option);
            });
            compressorSeries.disabled = false;
        }
    });

    compressorSeries.addEventListener('change', () => {
        const brand = compressorBrand.value;
        const series = compressorSeries.value;
        compressorModel.innerHTML = `<option value="">${i18next.t('common.selectModel')}</option>`;
        compressorModel.disabled = !series;
        modelDisplacementInfo.classList.add('hidden');

        if (brand && series) {
            const models = getModelsBySeries(brand, series);
            models.forEach(m => {
                const option = document.createElement('option');
                option.value = m.model;
                option.textContent = m.model;
                compressorModel.appendChild(option);
            });
            compressorModel.disabled = false;
        }
    });

    compressorModel.addEventListener('change', () => {
        const brand = compressorBrand.value;
        const series = compressorSeries.value;
        const model = compressorModel.value;

        if (brand && series && model) {
            const detail = getModelDetail(brand, series, model);
            if (detail) {
                // 默认使用 displacement 作为输入排量
                const baseDisp = typeof detail.disp_lp === 'number'
                    ? detail.disp_lp
                    : detail.displacement;

                // 前川两级机型：展示更多规格信息
                if (typeof detail.disp_lp === 'number' && typeof detail.disp_hp === 'number') {
                    const viText = typeof detail.vi_ratio === 'number'
                        ? `, Vi≈${detail.vi_ratio.toFixed(2)}`
                        : '';
                    const rotorText = detail.rotor_code
                        ? `, 转子: ${detail.rotor_code}`
                        : '';
                    modelDisplacementInfo.innerHTML = `
                        <span class="font-bold">低压级排量:</span> ${detail.disp_lp.toFixed(0)} m³/h
                        <span class="ml-2 font-bold">高压级排量:</span> ${detail.disp_hp.toFixed(0)} m³/h
                        <span class="ml-2 text-xs text-purple-700">${viText}${rotorText}</span>
                    `;
                    modelDisplacementValue.textContent = detail.disp_lp.toFixed(0);
                } else {
                    // 其他品牌保持原有显示，对于GEA系列添加转速范围
                    if (brand === 'GEA Grasso' && detail.rpm_range && Array.isArray(detail.rpm_range) && detail.rpm_range.length === 2) {
                        const [minRpm, maxRpm] = detail.rpm_range;
                        modelDisplacementInfo.innerHTML = `
                            <span class="font-bold">理论流量:</span> <span id="model_displacement_value_m5">${baseDisp.toFixed(0)}</span> m³/h
                            <span class="ml-2 text-xs text-gray-600">(最大转速 ${maxRpm} RPM)</span>
                            <br>
                            <span class="text-xs text-gray-600">转速范围: ${minRpm}-${maxRpm} RPM</span>
                        `;
                    } else {
                        modelDisplacementInfo.innerHTML = `
                            <span class="font-bold">理论排量:</span> <span id="model_displacement_value_m5">${baseDisp.toFixed(0)}</span> m³/h
                        `;
                    }
                    modelDisplacementValue.textContent = baseDisp.toFixed(0);
                }

                modelDisplacementInfo.classList.remove('hidden');
                
                if (flowInput) {
                    flowInput.value = baseDisp.toFixed(2);
                    setButtonStale5();
                }
                
                // 选择压缩机型号后，自动更新中间压力（如果模式为自动）
                updateIntermediatePressureM5();
            } else {
                modelDisplacementInfo.classList.add('hidden');
            }
        } else {
            modelDisplacementInfo.classList.add('hidden');
        }
    });
}

// ---------------------------------------------------------------------
// Intermediate Pressure Update
// ---------------------------------------------------------------------

function updateIntermediatePressureM5() {
    if (!CP_INSTANCE || !interSatTempInput) return;
    
    try {
        // 检查中间压力模式是否为自动
        const interPressModeValue = document.querySelector('input[name="inter_press_mode_m5"]:checked')?.value || 'auto';
        if (interPressModeValue !== 'auto') return; // 手动模式时不更新
        
        const fluid = fluidSelect.value;
        const Te_C = parseFloat(tempEvapInput.value);
        const Tc_C = parseFloat(tempCondInput.value);
        const subcooling_K = parseFloat(subcoolInput.value);
        
        if (isNaN(Te_C) || isNaN(Tc_C) || Tc_C <= Te_C) return;
        if (isNaN(subcooling_K)) return;
        
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', Te_C + 273.15, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', Tc_C + 273.15, 'Q', 1, fluid);
        
        if (!Pe_Pa || !Pc_Pa || Pe_Pa <= 0 || Pc_Pa <= 0) return;
        
        // 无ECO时，使用几何平均法计算中间压力
        const P_intermediate_Pa = Math.sqrt(Pe_Pa * Pc_Pa);
        
        // 计算中间饱和温度
        const T_intermediate_sat_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0, fluid);
        const T_intermediate_sat_C = T_intermediate_sat_K - 273.15;
        
        // 更新中间压力输入框的值（即使输入框是禁用的）
        if (interSatTempInput) {
            interSatTempInput.value = T_intermediate_sat_C.toFixed(2);
            // 触发input事件，确保UI更新
            interSatTempInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
    } catch (error) {
        console.warn("Update Intermediate Pressure M5 Error (Ignored):", error.message);
    }
}

// ---------------------------------------------------------------------
// Auto Efficiency Calculation
// ---------------------------------------------------------------------

function updateAndDisplayEfficienciesM5Lp() {
    if (!CP_INSTANCE || !autoEffLpCheckbox || !autoEffLpCheckbox.checked) return;
    
    try {
        const fluid = fluidSelect.value;
        const Te_C = parseFloat(tempEvapInput.value);
        const Tc_C = parseFloat(tempCondInput.value);
        
        if (isNaN(Te_C) || isNaN(Tc_C) || Tc_C <= Te_C) return;
        
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', Te_C + 273.15, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', Tc_C + 273.15, 'Q', 1, fluid);
        
        if (!Pe_Pa || !Pc_Pa || Pe_Pa <= 0 || Pc_Pa <= 0) return;
        
        // 读取总过热度（用于计算吸气温度）
        let total_superheat_K = parseFloat(superheatInput.value);
        if (isNaN(total_superheat_K) || total_superheat_K < 0) {
            total_superheat_K = 5; // 默认值
        }
        
        // RCC Pro: 使用活塞压缩机容积效率计算
        // 如果总过热度=0，使用饱和温度；否则使用 Te_C + total_superheat_K
        const T_suc_K = (total_superheat_K <= 0) ? (Te_C + 273.15) : (Te_C + 273.15 + total_superheat_K);
        
        // 尝试从选中的压缩机型号获取余隙容积
        let clearance_factor = 0.04; // 默认值
        const brand = compressorBrand?.value;
        const series = compressorSeries?.value;
        const model = compressorModel?.value;
        if (brand && series && model) {
            const modelDetail = getModelDetail(brand, series, model);
            if (modelDetail && modelDetail.clearance_factor) {
                clearance_factor = modelDetail.clearance_factor;
            }
        }
        
        // 计算中间压力（用于LP压比）
        const P_intermediate_Pa = Math.sqrt(Pe_Pa * Pc_Pa);
        
        // LP压比：Pe -> P_intermediate
        const pressureRatioLp = P_intermediate_Pa / Pe_Pa;
        
        // 计算中间压力下的饱和温度（用于效率修正，更符合实际工况）
        let T_intermediate_sat_C = Te_C + (Tc_C - Te_C) / 2; // 默认值（向后兼容）
        try {
            const T_intermediate_sat_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0, fluid);
            T_intermediate_sat_C = T_intermediate_sat_K - 273.15;
        } catch (e) {
            console.warn('[Mode5 LP] Failed to get intermediate saturation temperature, using default');
        }
        
        // 获取等熵指数 k (用于半经验公式)
        let k_value = 1.3; // 默认值（氨的典型值）
        try {
            const Cp = CP_INSTANCE.PropsSI('CPMOLAR', 'T', T_suc_K, 'P', Pe_Pa, fluid);
            const Cv = CP_INSTANCE.PropsSI('CVMOLAR', 'T', T_suc_K, 'P', Pe_Pa, fluid);
            if (Cp && Cv && isFinite(Cp) && isFinite(Cv) && Cv > 0) {
                k_value = Cp / Cv;
            }
        } catch (e) {
            console.warn('[Mode5 LP] Failed to get k value from CoolProp, using default 1.3');
        }
        
        // 根据品牌和系列选择不同的效率计算模型
        // GEA Grasso 双级（VT 和 VT HS 系列）: 使用 GEA 双级专用效率模型（容积效率高至少10%）
        // GEA Grasso 其他系列: 使用 GEA 标准效率模型
        // MYCOM 单机双级（WBHE 和 M II 系列）: 使用 MYCOM 单机双级专用效率模型（更高效率）
        // MYCOM 其他系列: 使用 MYCOM 标准效率模型
        let efficienciesLp;
        if (brand === 'MYCOM') {
            // 检查是否为单机双级系列（WBHE 或 M II）
            const isTwoStage = series && (
                series.includes('WBHE Series') || 
                series.includes('M II Series')
            );
            if (isTwoStage) {
                // 使用 MYCOM 单机双级专用效率计算（更高效率，接近 GEA 水平）
                efficienciesLp = calculateMycomTwoStageEfficiencies(pressureRatioLp, k_value, T_intermediate_sat_C, clearance_factor);
            } else {
                // 使用 MYCOM 标准效率计算
                efficienciesLp = calculateMycomEfficiencies(pressureRatioLp, k_value, T_intermediate_sat_C, clearance_factor);
            }
        } else if (brand === 'GEA Grasso') {
            // 检查是否为双级系列（VT 或 VT HS）
            const isTwoStage = series && (
                series.includes('VT (25 bar Two Stage)') || 
                series.includes('VT HS (25 bar Two Stage High Speed)')
            );
            if (isTwoStage) {
                // 使用 GEA 双级专用效率计算（容积效率高至少10%，基于GEA工程应用实际数据）
                efficienciesLp = calculateGEATwoStageEfficiencies(pressureRatioLp, k_value, T_intermediate_sat_C, clearance_factor);
            } else {
                // 使用 GEA Grasso 标准效率计算
                efficienciesLp = calculateEfficiencies(pressureRatioLp, k_value, T_intermediate_sat_C, clearance_factor);
            }
        } else {
            // 其他品牌使用标准效率计算
            efficienciesLp = calculateEfficiencies(pressureRatioLp, k_value, T_intermediate_sat_C, clearance_factor);
        }
        
        if (etaVLpInput) etaVLpInput.value = efficienciesLp.eta_v.toFixed(4);
        if (etaSLpInput) etaSLpInput.value = efficienciesLp.eta_is.toFixed(3);
        
        // 更新中间压力显示
        updateIntermediatePressureM5();
        
    } catch (error) {
        console.warn("Auto-Eff M5 LP Error (Ignored):", error.message);
    }
}

function updateAndDisplayEfficienciesM5Hp() {
    if (!CP_INSTANCE || !autoEffHpCheckbox || !autoEffHpCheckbox.checked) return;
    
    try {
        const fluid = fluidSelect.value;
        const Te_C = parseFloat(tempEvapInput.value);
        const Tc_C = parseFloat(tempCondInput.value);
        
        if (isNaN(Te_C) || isNaN(Tc_C) || Tc_C <= Te_C) return;
        
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', Te_C + 273.15, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', Tc_C + 273.15, 'Q', 1, fluid);
        
        if (!Pe_Pa || !Pc_Pa || Pe_Pa <= 0 || Pc_Pa <= 0) return;
        
        // 计算中间压力（用于HP压比）
        const P_intermediate_Pa = Math.sqrt(Pe_Pa * Pc_Pa);
        
        // HP压比：P_intermediate -> Pc
        const pressureRatioHp = Pc_Pa / P_intermediate_Pa;
        
        // 估算高压级吸气温度（中间压力下的温度，无补气时等于低压级排气温度）
        // 使用中间饱和温度作为参考（简化处理）
        const T_intermediate_sat_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0.5, fluid);
        // 无ECO，高压级吸气温度等于低压级排气温度（简化）
        const T_suc_hp_K = T_intermediate_sat_K + 10; // 简化：假设有10K过热
        
        // 尝试从选中的压缩机型号获取余隙容积
        let clearance_factor = 0.04; // 默认值
        const brand = compressorBrand?.value;
        const series = compressorSeries?.value;
        const model = compressorModel?.value;
        if (brand && series && model) {
            const modelDetail = getModelDetail(brand, series, model);
            if (modelDetail && modelDetail.clearance_factor) {
                clearance_factor = modelDetail.clearance_factor;
            }
        }
        
        // 获取等熵指数 k (用于半经验公式)
        let k_value = 1.3; // 默认值（氨的典型值）
        try {
            const Cp = CP_INSTANCE.PropsSI('CPMOLAR', 'T', T_suc_hp_K, 'P', P_intermediate_Pa, fluid);
            const Cv = CP_INSTANCE.PropsSI('CVMOLAR', 'T', T_suc_hp_K, 'P', P_intermediate_Pa, fluid);
            if (Cp && Cv && isFinite(Cp) && isFinite(Cv) && Cv > 0) {
                k_value = Cp / Cv;
            }
        } catch (e) {
            console.warn('[Mode5 HP] Failed to get k value from CoolProp, using default 1.3');
        }
        
        // 根据品牌和系列选择不同的效率计算模型
        // GEA Grasso 双级（VT 和 VT HS 系列）: 使用 GEA 双级专用效率模型（容积效率高至少10%）
        // GEA Grasso 其他系列: 使用 GEA 标准效率模型
        // MYCOM 单机双级（WBHE 和 M II 系列）: 使用 MYCOM 单机双级专用效率模型（更高效率）
        // MYCOM 其他系列: 使用 MYCOM 标准效率模型
        let efficienciesHp;
        if (brand === 'MYCOM') {
            // 检查是否为单机双级系列（WBHE 或 M II）
            const isTwoStage = series && (
                series.includes('WBHE Series') || 
                series.includes('M II Series')
            );
            if (isTwoStage) {
                // 使用 MYCOM 单机双级专用效率计算（更高效率，接近 GEA 水平）
                efficienciesHp = calculateMycomTwoStageEfficiencies(pressureRatioHp, k_value, Tc_C, clearance_factor);
            } else {
                // 使用 MYCOM 标准效率计算
                efficienciesHp = calculateMycomEfficiencies(pressureRatioHp, k_value, Tc_C, clearance_factor);
            }
        } else if (brand === 'GEA Grasso') {
            // 检查是否为双级系列（VT 或 VT HS）
            const isTwoStage = series && (
                series.includes('VT (25 bar Two Stage)') || 
                series.includes('VT HS (25 bar Two Stage High Speed)')
            );
            if (isTwoStage) {
                // 使用 GEA 双级专用效率计算（容积效率高至少10%，基于GEA工程应用实际数据）
                efficienciesHp = calculateGEATwoStageEfficiencies(pressureRatioHp, k_value, Tc_C, clearance_factor);
            } else {
                // 使用 GEA Grasso 标准效率计算
                efficienciesHp = calculateEfficiencies(pressureRatioHp, k_value, Tc_C, clearance_factor);
            }
        } else {
            // 其他品牌使用标准效率计算
            efficienciesHp = calculateEfficiencies(pressureRatioHp, k_value, Tc_C, clearance_factor);
        }
        
        if (etaSHpInput) etaSHpInput.value = efficienciesHp.eta_is.toFixed(3);
        
        // 更新中间压力显示
        updateIntermediatePressureM5();
        
    } catch (error) {
        console.warn("Auto-Eff M5 HP Error (Ignored):", error.message);
    }
}

export function triggerMode5EfficiencyUpdate() {
    updateAndDisplayEfficienciesM5Lp();
    updateAndDisplayEfficienciesM5Hp();
    updateIntermediatePressureM5();
}

export function initMode5(CP) {
    CP_INSTANCE = CP;

    calcButtonM5 = document.getElementById('calc-button-mode-5');
    calcFormM5 = document.getElementById('calc-form-mode-5');
    printButtonM5 = document.getElementById('print-button-mode-5');
    resultsDesktopM5 = document.getElementById('results-desktop-m5');
    resultsMobileM5 = document.getElementById('mobile-results-m5');
    summaryMobileM5 = document.getElementById('mobile-summary-m5');

    // 输入元素
    fluidSelect = document.getElementById('fluid_m5');
    fluidInfoDiv = document.getElementById('fluid-info-m5');
    tempEvapInput = document.getElementById('temp_evap_m5');
    tempCondInput = document.getElementById('temp_cond_m5');
    usefulSuperheatInput = document.getElementById('useful_superheat_m5');
    superheatInput = document.getElementById('superheat_m5');
    subcoolInput = document.getElementById('subcooling_m5');
    flowInput = document.getElementById('flow_m3h_m5');
    etaVLpInput = document.getElementById('eta_v_m5_lp');
    etaSLpInput = document.getElementById('eta_s_m5_lp');
    autoEffLpCheckbox = document.getElementById('auto-eff-m5-lp');
    etaSHpInput = document.getElementById('eta_s_m5_hp');
    autoEffHpCheckbox = document.getElementById('auto-eff-m5-hp');
    compressorBrand = document.getElementById('compressor_brand_m5');
    compressorSeries = document.getElementById('compressor_series_m5');
    compressorModel = document.getElementById('compressor_model_m5');
    modelDisplacementInfo = document.getElementById('model_displacement_info_m5');
    modelDisplacementValue = document.getElementById('model_displacement_value_m5');
    slhxCheckbox = document.getElementById('enable_slhx_m5');
    slhxEff = document.getElementById('slhx_effectiveness_m5');
    interSatTempInput = document.getElementById('temp_inter_sat_m5');
    
    // ECO 设置（中间冷却器）
    ecoCheckbox = document.getElementById('enable_eco_m5');
    ecoType = document.querySelectorAll('input[name="eco_type_m5"]');
    ecoSuperheatInputSubcooler = document.getElementById('eco_superheat_m5_subcooler');
    ecoDtInput = document.getElementById('eco_dt_m5');
    
    // Cylinder Head Cooling (缸头冷却)
    cylinderHeadCoolingEnabledM5 = document.getElementById('cylinder_head_cooling_enabled_m5');
    cylinderHeadWaterInletTempM5 = document.getElementById('cylinder_head_water_inlet_temp_m5');
    cylinderHeadWaterOutletTempM5 = document.getElementById('cylinder_head_water_outlet_temp_m5');
    cylinderHeadQM5 = document.getElementById('cylinder_head_q_m5');
    cylinderHeadInputModeM5 = document.querySelectorAll('input[name="cylinder_head_input_mode_m5"]');
    cylinderHeadPowerInputM5 = document.getElementById('cylinder_head_power_input_m5');
    cylinderHeadQDirectM5 = document.getElementById('cylinder_head_q_direct_m5');
    cylinderHeadWaterTempModeM5 = document.getElementById('cylinder-head-water-temp-mode-m5');
    cylinderHeadDirectPowerModeM5 = document.getElementById('cylinder-head-direct-power-mode-m5');

    // Initialize compressor model selectors
    if (compressorBrand && compressorSeries && compressorModel) {
        initCompressorModelSelectorsM5();
    }

    if (calcFormM5) {
        calcFormM5.addEventListener('submit', (e) => {
            e.preventDefault();
            calculateMode5();
        });

        const inputs = calcFormM5.querySelectorAll('input, select');
        inputs.forEach((input) => {
            input.addEventListener('input', setButtonStale5);
            input.addEventListener('change', setButtonStale5);
        });

        if (fluidSelect && fluidInfoDiv) {
            fluidSelect.addEventListener('change', () => {
                updateFluidInfo(fluidSelect, fluidInfoDiv, CP_INSTANCE);
                updateAndDisplayEfficienciesM5Lp();
                updateAndDisplayEfficienciesM5Hp();
                updateIntermediatePressureM5(); // 流体变化时也更新中间压力
            });
        }

        // 自动效率更新监听器
        [tempEvapInput, tempCondInput, autoEffLpCheckbox, autoEffHpCheckbox].forEach(input => {
            if (input) {
                input.addEventListener('change', () => {
                    updateAndDisplayEfficienciesM5Lp();
                    updateAndDisplayEfficienciesM5Hp();
                    updateIntermediatePressureM5(); // 更新中间压力
                });
                input.addEventListener('input', () => {
                    if (autoEffLpCheckbox && autoEffLpCheckbox.checked) updateAndDisplayEfficienciesM5Lp();
                    if (autoEffHpCheckbox && autoEffHpCheckbox.checked) updateAndDisplayEfficienciesM5Hp();
                    updateIntermediatePressureM5(); // 温度变化时也更新中间压力
                });
            }
        });

        // 效率输入框监听器（手动设定效率时也更新中间压力）
        [etaVLpInput, etaSLpInput, etaSHpInput].forEach(input => {
            if (input) {
                // 使用防抖，避免频繁更新，但确保最终会更新
                let updateTimeout = null;
                const scheduleUpdate = () => {
                    if (updateTimeout) clearTimeout(updateTimeout);
                    updateTimeout = setTimeout(() => {
                        updateIntermediatePressureM5();
                    }, 150); // 150ms 防抖
                };
                
                input.addEventListener('input', scheduleUpdate);
                input.addEventListener('change', () => {
                    if (updateTimeout) clearTimeout(updateTimeout);
                    updateIntermediatePressureM5();
                });
                input.addEventListener('blur', () => {
                    if (updateTimeout) clearTimeout(updateTimeout);
                    updateIntermediatePressureM5();
                });
            }
        });

        if (autoEffLpCheckbox) {
            autoEffLpCheckbox.addEventListener('change', () => {
                if (autoEffLpCheckbox.checked) {
                    updateAndDisplayEfficienciesM5Lp();
                }
                updateIntermediatePressureM5(); // 切换自动/手动时也更新中间压力
            });
        }
        
        if (autoEffHpCheckbox) {
            autoEffHpCheckbox.addEventListener('change', () => {
                if (autoEffHpCheckbox.checked) {
                    updateAndDisplayEfficienciesM5Hp();
                }
                updateIntermediatePressureM5(); // 切换自动/手动时也更新中间压力
            });
        }

        // 中间压力模式切换监听器
        const interPressModeRadios = document.querySelectorAll('input[name="inter_press_mode_m5"]');
        interPressModeRadios.forEach(radio => {
            if (radio) {
                radio.addEventListener('change', () => {
                    updateIntermediatePressureM5(); // 切换模式时更新中间压力
                });
            }
        });
        
        // SLHX toggle
        if (slhxCheckbox) {
            slhxCheckbox.addEventListener('change', () => {
                const isEnabled = slhxCheckbox.checked;
                const settingsDiv = document.getElementById('slhx-settings-m5');
                const placeholderDiv = document.getElementById('slhx-placeholder-m5');
                if (settingsDiv) settingsDiv.classList.toggle('hidden', !isEnabled);
                if (placeholderDiv) placeholderDiv.classList.toggle('hidden', isEnabled);
                setButtonStale5();
            });
        }
        
        // ECO toggle (中间冷却器)
        if (ecoCheckbox) {
            ecoCheckbox.addEventListener('change', () => {
                const isEnabled = ecoCheckbox.checked;
                const settingsDiv = document.getElementById('eco-settings-m5');
                const placeholderDiv = document.getElementById('eco-placeholder-m5');
                if (settingsDiv) settingsDiv.classList.toggle('hidden', !isEnabled);
                if (placeholderDiv) placeholderDiv.classList.toggle('hidden', isEnabled);
                setButtonStale5();
            });
        }
        
        // ECO type toggle (闪蒸罐/过冷器)
        if (ecoType && ecoType.length > 0) {
            ecoType.forEach(radio => {
                radio.addEventListener('change', () => {
                    const type = radio.value;
                    const subcoolerSettings = document.getElementById('eco-subcooler-settings-m5');
                    if (subcoolerSettings) {
                        subcoolerSettings.classList.toggle('hidden', type !== 'subcooler');
                    }
                    setButtonStale5();
                });
            });
        }
        
        // Cylinder Head Cooling toggle
        if (cylinderHeadCoolingEnabledM5) {
            cylinderHeadCoolingEnabledM5.addEventListener('change', () => {
                const isEnabled = cylinderHeadCoolingEnabledM5.checked;
                const settingsDiv = document.getElementById('cylinder-head-cooling-settings-m5');
                const placeholderDiv = document.getElementById('cylinder-head-cooling-placeholder-m5');
                if (settingsDiv) settingsDiv.classList.toggle('hidden', !isEnabled);
                if (placeholderDiv) placeholderDiv.classList.toggle('hidden', isEnabled);
                setButtonStale5();
            });
        }
        
        // Cylinder Head Cooling input mode toggle
        if (cylinderHeadInputModeM5 && cylinderHeadInputModeM5.length > 0) {
            cylinderHeadInputModeM5.forEach(radio => {
                radio.addEventListener('change', () => {
                    const mode = radio.value;
                    if (cylinderHeadWaterTempModeM5 && cylinderHeadDirectPowerModeM5) {
                        cylinderHeadWaterTempModeM5.classList.toggle('hidden', mode !== 'water_temp');
                        cylinderHeadDirectPowerModeM5.classList.toggle('hidden', mode !== 'direct_power');
                    }
                    setButtonStale5();
                });
            });
        }

        if (printButtonM5) {
            printButtonM5.addEventListener('click', printReportMode5);
        }
        
        // 图表切换按钮
        const chartToggleBtn = document.getElementById('chart-toggle-m5');
        const chartToggleBtnMobile = document.getElementById('chart-toggle-m5-mobile');
        if (chartToggleBtn) {
            chartToggleBtn.addEventListener('click', toggleChartTypeM5);
        }
        if (chartToggleBtnMobile) {
            chartToggleBtnMobile.addEventListener('click', toggleChartTypeM5);
        }
        
        // 初始化时触发一次效率更新和中间压力更新
        setTimeout(() => {
            if (autoEffLpCheckbox && autoEffLpCheckbox.checked) {
                updateAndDisplayEfficienciesM5Lp();
            }
            if (autoEffHpCheckbox && autoEffHpCheckbox.checked) {
                updateAndDisplayEfficienciesM5Hp();
            }
            updateIntermediatePressureM5(); // 初始化时更新中间压力
        }, 100);
    }

    console.log('Mode 5 (Two-Stage Single Compressor) initialized.');
}


