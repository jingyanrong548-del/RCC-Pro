// =====================================================================
// mode4_cascade.js: 模式四 (复叠压缩) - v1.0
// 职责: 低温级 + 高温级 两套简单制冷循环，通过中间换热器耦合，
//      采用逼近温差 ΔT_approach，基于模式1的简化逻辑实现几何排量计算。
// 说明: 首版聚焦于几何排量 + 等熵效率，暂不引入 ECO / SLHX 等高级特性。
// =====================================================================

import { createKpiCard, createDetailRow, createSectionHeader, createErrorCard, createStateTable } from './components.js';
import { drawPHDiagram } from './charts.js';
import { HistoryDB, SessionState } from './storage.js';
import { openMobileSheet } from './ui.js';
import { updateFluidInfo } from './coolprop_loader.js';
import { calculateEmpiricalEfficiencies } from './efficiency_models.js';
import { 
    getAllBrands, 
    getSeriesByBrand, 
    getModelsBySeries, 
    getDisplacementByModel 
} from './compressor_models.js';

let CP_INSTANCE = null;
let lastCalculationData = null;

// UI 引用
let calcButtonM4, calcFormM4, printButtonM4;
let resultsDesktopM4, resultsMobileM4, summaryMobileM4;

// 低温级
let fluidLtSelect, fluidInfoLtDiv, tempEvapLtInput, superheatLtInput, subcoolLtInput;
let flowLtInput;
let etaVLtInput, etaSLtInput, autoEffLtCheckbox;
let compressorBrandLt, compressorSeriesLt, compressorModelLt, modelDisplacementInfoLt, modelDisplacementValueLt;
let slhxCheckboxLt, slhxEffLt;

// 高温级
let fluidHtSelect, fluidInfoHtDiv, tempCondHtInput, superheatHtInput, subcoolHtInput;
let flowHtInput;
let etaVHtInput, etaSHtInput, autoEffHtCheckbox;
let compressorBrandHt, compressorSeriesHt, compressorModelHt, modelDisplacementInfoHt, modelDisplacementValueHt;
let ecoCheckboxHt, ecoTypeHt, ecoPressModeHt, ecoSatTempHt, ecoSuperheatHt, ecoDtHt;

// 中间换热器
let approachDtInput;

const BTN_TEXT_CALCULATE = 'Calculate Cascade';
const BTN_TEXT_RECALCULATE = 'Recalculate (Input Changed)';

// ---------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------

function setButtonStale4() {
    if (calcButtonM4 && calcButtonM4.innerText !== BTN_TEXT_RECALCULATE) {
        calcButtonM4.innerText = BTN_TEXT_RECALCULATE;
        calcButtonM4.classList.add('opacity-90', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
        if (printButtonM4) {
            printButtonM4.disabled = true;
            printButtonM4.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
}

function setButtonFresh4() {
    if (calcButtonM4) {
        calcButtonM4.innerText = BTN_TEXT_CALCULATE;
        calcButtonM4.classList.remove('opacity-90', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
    }
}

function renderToAllViews(htmlContent) {
    if (resultsDesktopM4) resultsDesktopM4.innerHTML = htmlContent;
    if (resultsMobileM4) resultsMobileM4.innerHTML = htmlContent;
}

function updateMobileSummary(kpi1Label, kpi1Value, kpi2Label, kpi2Value) {
    if (!summaryMobileM4) return;
    summaryMobileM4.innerHTML = `
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

// 单级循环计算（流量定义 + 等熵效率，按轴功率计算，支持ECO和SLHX）
function computeSingleStageCycle({
    fluid,
    Te_C,
    Tc_C,
    superheat_K,
    subcooling_K,
    flow_m3h, // 理论流量 (m³/h)
    eta_v,
    eta_s,
    // ECO参数
    isEcoEnabled = false,
    ecoType = 'flash_tank', // 'flash_tank' | 'subcooler'
    ecoPressMode = 'auto', // 'auto' | 'manual'
    ecoSatTemp_C = null,
    ecoSuperheat_K = 5,
    ecoDt_K = 5.0,
    // SLHX参数
    isSlhxEnabled = false,
    slhxEff = 0.5
}) {
    const T_evap_K = Te_C + 273.15;
    const T_cond_K = Tc_C + 273.15;

    const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', T_evap_K, 'Q', 1, fluid);
    const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', T_cond_K, 'Q', 1, fluid);

    // 点 1：蒸发器出口（含过热，基础状态）
    const T1_K = T_evap_K + superheat_K;
    const h1_base = CP_INSTANCE.PropsSI('H', 'T', T1_K, 'P', Pe_Pa, fluid);
    const s1_base = CP_INSTANCE.PropsSI('S', 'T', T1_K, 'P', Pe_Pa, fluid);
    const rho1_base = CP_INSTANCE.PropsSI('D', 'T', T1_K, 'P', Pe_Pa, fluid);

    // 点 3：冷凝器出口（含过冷）
    const T3_K = T_cond_K - subcooling_K;
    const h3 = CP_INSTANCE.PropsSI('H', 'T', T3_K, 'P', Pc_Pa, fluid);

    // =========================================================
    // ECO和SLHX迭代计算（与模式1逻辑完全一致）
    // =========================================================
    let T_suc_K = T1_K;
    let h_suc = h1_base;
    let rho_suc = rho1_base, s_suc = s1_base;
    let m_dot_suc = 0, W_shaft_W = 0;
    let h_liq_in = h3;
    let h_liq_out = h3;
    
    let m_dot_inj = 0, m_dot_total = 0;
    let P_eco_Pa = 0, T_eco_sat_K = 0;
    let h_5 = h3, h_6 = 0, h_7 = h3;
    let m_p5 = 0, m_p6 = 0, m_p7 = 0;

    for (let iter = 0; iter < 5; iter++) {
        // 1. Update Suction Properties
        if (iter === 0) {
            s_suc = CP_INSTANCE.PropsSI('S', 'T', T_suc_K, 'P', Pe_Pa, fluid);
        } else {
            try {
                rho_suc = CP_INSTANCE.PropsSI('D', 'H', h_suc, 'P', Pe_Pa, fluid);
                s_suc = CP_INSTANCE.PropsSI('S', 'H', h_suc, 'P', Pe_Pa, fluid);
                T_suc_K = CP_INSTANCE.PropsSI('T', 'H', h_suc, 'P', Pe_Pa, fluid);
            } catch (e) {
                rho_suc = CP_INSTANCE.PropsSI('D', 'T', T_suc_K, 'P', Pe_Pa, fluid);
            }
        }

        // 2. Mass Flow Calculation
        const V_th_m3_s = flow_m3h / 3600.0;
        m_dot_suc = V_th_m3_s * eta_v * rho_suc;

        // 3. ECO Calculation
        if (isEcoEnabled) {
            if (ecoPressMode === 'auto') {
                P_eco_Pa = Math.sqrt(Pe_Pa * Pc_Pa);
                T_eco_sat_K = CP_INSTANCE.PropsSI('T', 'P', P_eco_Pa, 'Q', 0, fluid);
            } else {
                T_eco_sat_K = ecoSatTemp_C + 273.15;
                P_eco_Pa = CP_INSTANCE.PropsSI('P', 'T', T_eco_sat_K, 'Q', 0.5, fluid);
            }
            const h_eco_liq = CP_INSTANCE.PropsSI('H', 'T', T_eco_sat_K, 'Q', 0, fluid);
            const h_eco_vap = CP_INSTANCE.PropsSI('H', 'T', T_eco_sat_K, 'Q', 1, fluid);
            h_7 = h3;

            if (ecoType === 'flash_tank') {
                h_6 = h_eco_vap;
                h_5 = h_eco_liq;
                const x_flash = (h_7 - h_5) / (h_6 - h_5);
                m_dot_inj = m_dot_suc * (x_flash / (1 - x_flash));
                m_dot_total = m_dot_suc + m_dot_inj;
                h_liq_in = h_5;
                m_p7 = m_dot_total;
                m_p5 = m_dot_suc;
                m_p6 = m_dot_inj;
            } else {
                // Subcooler
                const T_inj_K = T_eco_sat_K + ecoSuperheat_K;
                h_6 = CP_INSTANCE.PropsSI('H', 'T', T_inj_K, 'P', P_eco_Pa, fluid);
                const T_5_K = T_eco_sat_K + ecoDt_K;
                h_5 = CP_INSTANCE.PropsSI('H', 'T', T_5_K, 'P', Pc_Pa, fluid);
                h_liq_in = h_5;
                m_dot_inj = (m_dot_suc * (h3 - h_5)) / (h_6 - h_7);
                m_dot_total = m_dot_suc + m_dot_inj;
                m_p5 = m_dot_suc;
                m_p7 = m_dot_inj;
                m_p6 = m_dot_inj;
            }
        } else {
            m_dot_total = m_dot_suc;
            h_liq_in = h3;
        }

        // 4. SLHX Loop
        if (isSlhxEnabled) {
            const P_liq_side = (isEcoEnabled && ecoType === 'flash_tank') ? P_eco_Pa : Pc_Pa;
            const T_liq_in = CP_INSTANCE.PropsSI('T', 'H', h_liq_in, 'P', P_liq_side, fluid);
            
            const Cp_liq = CP_INSTANCE.PropsSI('C', 'H', h_liq_in, 'P', P_liq_side, fluid);
            const Cp_vap = CP_INSTANCE.PropsSI('C', 'H', h1_base, 'P', Pe_Pa, fluid);
            
            const C_liq = m_dot_suc * Cp_liq;
            const C_vap = m_dot_suc * Cp_vap;
            const C_min = Math.min(C_liq, C_vap);
            
            const Q_max = C_min * (T_liq_in - T1_K);
            const Q_slhx = slhxEff * Q_max;
            
            const h_suc_new = h1_base + (Q_slhx / m_dot_suc);
            const h_liq_out_new = h_liq_in - (Q_slhx / m_dot_suc);
            
            const diff = Math.abs(h_suc_new - h_suc);
            h_suc = h_suc_new;
            h_liq_out = h_liq_out_new;
            
            if (diff < 100) break; // Converged
        } else {
            h_suc = h1_base;
            h_liq_out = h_liq_in;
            break;
        }
    }

    // =========================================================
    // Work & Finalization
    // =========================================================
    let W_ideal_W = 0;
    let h_mid_1s = 0, h_mix = 0; // 用于功率计算（两级压缩），不用于P-h图显示
    if (!isEcoEnabled) {
        const h_2s = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_suc, fluid);
        W_ideal_W = m_dot_suc * (h_2s - h_suc);
    } else {
        h_mid_1s = CP_INSTANCE.PropsSI('H', 'P', P_eco_Pa, 'S', s_suc, fluid);
        const W_s1 = m_dot_suc * (h_mid_1s - h_suc);
        h_mix = (m_dot_suc * h_mid_1s + m_dot_inj * h_6) / m_dot_total; // 混合后的焓值
        const s_mix = CP_INSTANCE.PropsSI('S', 'H', h_mix, 'P', P_eco_Pa, fluid);
        const h_2s_stage2 = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_mix, fluid);
        const W_s2 = m_dot_total * (h_2s_stage2 - h_mix);
        W_ideal_W = W_s1 + W_s2;
    }

    W_shaft_W = W_ideal_W / eta_s;
    const W_input_W = W_shaft_W;

    // 估算实际排气焓 h2a：能量守恒
    const h_system_in = (m_dot_suc * h_suc + m_dot_inj * (isEcoEnabled ? h_6 : 0));
    const h_2a_target = h_system_in + (W_shaft_W / m_dot_total);
    const T2a_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h_2a_target, fluid);
    const T2a_C = T2a_K - 273.15;

    // 蒸发制冷量 & 冷凝放热
    const Q_evap_W = m_dot_suc * (h1_base - h_liq_out);
    const Q_cond_W = m_dot_total * (h_2a_target - h3);

    const COP_c = Q_evap_W / W_input_W;
    const COP_h = Q_cond_W / W_input_W;

    // 节流：h_liq_out -> h4
    const h4 = h_liq_out;
    const T4_K = CP_INSTANCE.PropsSI('T', 'P', Pe_Pa, 'H', h4, fluid);
    const T4_C = T4_K - 273.15;

    return {
        Pe_Pa,
        Pc_Pa,
        m_dot: m_dot_suc,
        m_dot_total,
        m_dot_inj,
        h1: h1_base,
        h_suc,
        h2a: h_2a_target,
        h3,
        h4,
        h5: isEcoEnabled ? h_5 : h3,
        h6: isEcoEnabled ? h_6 : 0,
        h7: isEcoEnabled ? h_7 : h3,
        h_mid: isEcoEnabled ? h_mid_1s : 0, // 第一级压缩到P_eco的状态（仅用于功率计算）
        h_mix: isEcoEnabled ? h_mix : 0, // 补气混合后的状态（仅用于功率计算）
        T1_K,
        T2a_C,
        T3_K,
        T4_C,
        T_eco_sat_K: isEcoEnabled ? T_eco_sat_K : null,
        P_eco_Pa: isEcoEnabled ? P_eco_Pa : null,
        Q_evap_W,
        Q_cond_W,
        W_shaft_W,
        W_input_W,
        COP_c,
        COP_h,
        isEcoEnabled,
        ecoType,
        isSlhxEnabled,
        m_p5,
        m_p6,
        m_p7
    };
}

// ---------------------------------------------------------------------
// Core Calculation Logic - Cascade
// ---------------------------------------------------------------------

function calculateMode4() {
    renderToAllViews('<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>');
    ['chart-desktop-m4-lt', 'chart-desktop-m4-ht', 'chart-mobile-m4-lt', 'chart-mobile-m4-ht'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    setTimeout(() => {
        try {
            // --- 1. 读取输入 ---
            const fluidLt = fluidLtSelect.value;
            const fluidHt = fluidHtSelect.value;

            const TeLt_C = parseFloat(tempEvapLtInput.value);
            const TcHt_C = parseFloat(tempCondHtInput.value);
            const shLt_K = parseFloat(superheatLtInput.value);
            const scLt_K = parseFloat(subcoolLtInput.value);
            const shHt_K = parseFloat(superheatHtInput.value);
            const scHt_K = parseFloat(subcoolHtInput.value);

            let flowLt = parseFloat(flowLtInput.value);
            
            // 如果选择了压缩机型号，优先使用型号的排量作为理论流量
            if (compressorModelLt && compressorModelLt.value) {
                const brand = compressorBrandLt.value;
                const series = compressorSeriesLt.value;
                const model = compressorModelLt.value;
                const displacement = getDisplacementByModel(brand, series, model);
                if (displacement !== null && (isNaN(flowLt) || flowLt <= 0)) {
                    flowLt = displacement;
                }
            }
            
            const eta_v_lt = parseFloat(etaVLtInput.value);
            const eta_s_lt = parseFloat(etaSLtInput.value);

            let flowHt = parseFloat(flowHtInput.value);
            
            // 如果选择了压缩机型号，优先使用型号的排量作为理论流量
            if (compressorModelHt && compressorModelHt.value) {
                const brand = compressorBrandHt.value;
                const series = compressorSeriesHt.value;
                const model = compressorModelHt.value;
                const displacement = getDisplacementByModel(brand, series, model);
                if (displacement !== null && (isNaN(flowHt) || flowHt <= 0)) {
                    flowHt = displacement;
                }
            }
            
            const eta_v_ht = parseFloat(etaVHtInput.value);
            const eta_s_ht = parseFloat(etaSHtInput.value);

            const dt_approach_K = parseFloat(approachDtInput.value);

            // ECO和SLHX参数（低温级：只保留SLHX，取消ECO）
            const isEcoLtEnabled = false; // 低温级取消经济器
            const ecoTypeLtValue = 'flash_tank';
            const ecoPressModeLtValue = 'auto';
            const ecoSatTempLtValue = null;
            const ecoSuperheatLtValue = 5;
            const ecoDtLtValue = 5.0;
            
            const isSlhxLtEnabled = slhxCheckboxLt && slhxCheckboxLt.checked;
            const slhxEffLtValue = slhxEffLt ? parseFloat(slhxEffLt.value) : 0.5;

            // ECO和SLHX参数（高温级：只保留ECO，取消SLHX）
            const isEcoHtEnabled = ecoCheckboxHt && ecoCheckboxHt.checked;
            const ecoTypeHtValue = ecoTypeHt ? document.querySelector('input[name="eco_type_m4_ht"]:checked')?.value || 'flash_tank' : 'flash_tank';
            const ecoPressModeHtValue = ecoPressModeHt ? document.querySelector('input[name="eco_press_mode_m4_ht"]:checked')?.value || 'auto' : 'auto';
            const ecoSatTempHtValue = ecoSatTempHt ? parseFloat(ecoSatTempHt.value) : null;
            const ecoSuperheatHtValue = ecoSuperheatHt ? parseFloat(ecoSuperheatHt.value) : 5;
            const ecoDtHtValue = ecoDtHt ? parseFloat(ecoDtHt.value) : 5.0;
            
            const isSlhxHtEnabled = false; // 高温级取消回热器
            const slhxEffHtValue = 0.5;

            // 验证必需参数是否有效
            if (isNaN(TeLt_C) || isNaN(TcHt_C) || isNaN(shLt_K) || isNaN(scLt_K) || 
                isNaN(shHt_K) || isNaN(scHt_K) || isNaN(flowLt) || isNaN(flowHt) || 
                isNaN(eta_v_lt) || isNaN(eta_s_lt) || isNaN(eta_v_ht) || isNaN(eta_s_ht) || 
                isNaN(dt_approach_K)) {
                throw new Error('请输入完整且有效的数值参数。');
            }
            
            // 验证必须为正数的参数
            if (flowLt <= 0 || flowHt <= 0 || eta_v_lt <= 0 || eta_s_lt <= 0 || 
                eta_v_ht <= 0 || eta_s_ht <= 0 || dt_approach_K <= 0 || 
                shLt_K < 0 || scLt_K < 0 || shHt_K < 0 || scHt_K < 0) {
                throw new Error('流量、效率和逼近温差必须大于0，过热度/过冷度不能为负。');
            }
            if (TcHt_C <= TeLt_C) {
                throw new Error('高温级冷凝温度必须高于低温级蒸发温度。');
            }

            // --- 2. 通过迭代求中间温度 T_int，使中间换热器能量平衡 ---
            let T_int_low = TeLt_C + 5;       // 下限：略高于低温级蒸发温度
            let T_int_high = TcHt_C - 5;      // 上限：略低于高温级冷凝温度
            if (T_int_low >= T_int_high) {
                throw new Error('中间温度搜索区间无效，请检查工况设置。');
            }

            let bestSolution = null;

            for (let iter = 0; iter < 25; iter++) {
                const T_int_C = 0.5 * (T_int_low + T_int_high);

                // 低温级：冷凝在 T_cond_LT = T_int_C + ΔT_approach
                const TcLt_C = T_int_C + dt_approach_K;
                if (TcLt_C >= TcHt_C) {
                    // 低温级冷凝温度不能高于高温级冷凝温度
                    T_int_high = T_int_C;
                    continue;
                }

                const ltStage = computeSingleStageCycle({
                    fluid: fluidLt,
                    Te_C: TeLt_C,
                    Tc_C: TcLt_C,
                    superheat_K: shLt_K,
                    subcooling_K: scLt_K,
                    flow_m3h: flowLt,
                    eta_v: eta_v_lt,
                    eta_s: eta_s_lt,
                    isEcoEnabled: isEcoLtEnabled,
                    ecoType: ecoTypeLtValue,
                    ecoPressMode: ecoPressModeLtValue,
                    ecoSatTemp_C: ecoSatTempLtValue,
                    ecoSuperheat_K: ecoSuperheatLtValue,
                    ecoDt_K: ecoDtLtValue,
                    isSlhxEnabled: isSlhxLtEnabled,
                    slhxEff: slhxEffLtValue
                });

                // 高温级：蒸发在 T_evap_HT = T_int_C
                const htStage = computeSingleStageCycle({
                    fluid: fluidHt,
                    Te_C: T_int_C,
                    Tc_C: TcHt_C,
                    superheat_K: shHt_K,
                    subcooling_K: scHt_K,
                    flow_m3h: flowHt,
                    eta_v: eta_v_ht,
                    eta_s: eta_s_ht,
                    isEcoEnabled: isEcoHtEnabled,
                    ecoType: ecoTypeHtValue,
                    ecoPressMode: ecoPressModeHtValue,
                    ecoSatTemp_C: ecoSatTempHtValue,
                    ecoSuperheat_K: ecoSuperheatHtValue,
                    ecoDt_K: ecoDtHtValue,
                    isSlhxEnabled: isSlhxHtEnabled,
                    slhxEff: slhxEffHtValue
                });

                const Q_cascade_lt = ltStage.Q_cond_W;        // 低温级在中间换热器放热
                const Q_cascade_ht = htStage.Q_evap_W;        // 高温级在中间换热器吸热
                const balance = (Q_cascade_lt - Q_cascade_ht) / Math.max(1, Math.abs(Q_cascade_lt));

                bestSolution = { T_int_C, TcLt_C, ltStage, htStage, balance };

                if (Math.abs(balance) < 0.001) break; // 能量平衡 0.1% 以内

                if (balance > 0) {
                    // 低温级放热 > 高温级吸热，需要提高高温级能力 => 提高 T_int (蒸发温度)
                    T_int_low = T_int_C;
                } else {
                    T_int_high = T_int_C;
                }
            }

            if (!bestSolution) {
                throw new Error('中间温度求解失败，请检查输入参数。');
            }

            const { T_int_C, TcLt_C, ltStage, htStage, balance } = bestSolution;

            // --- 3. 汇总结果（按轴功率计算）---
            const Q_evap_total_W = ltStage.Q_evap_W; // 系统总制冷量由低温级决定
            const W_shaft_total_W = ltStage.W_shaft_W + htStage.W_shaft_W;
            // 输入功率等于轴功率（无电机效率）
            const W_input_total_W = W_shaft_total_W;
            const COP_system = Q_evap_total_W / W_input_total_W;

            // --- 4. 构造状态点表（包含所有状态点：基础点 + SLHX点 + ECO点）---
            const statePoints = [];
            
            // 低温级状态点
            statePoints.push({
                name: 'LT-1',
                desc: 'Low Stage Evap Out',
                temp: (ltStage.T1_K - 273.15).toFixed(1),
                press: (ltStage.Pe_Pa / 1e5).toFixed(2),
                enth: (ltStage.h1 / 1000).toFixed(1),
                flow: ltStage.m_dot.toFixed(4)
            });
            
            if (ltStage.isSlhxEnabled) {
                let T_suc_Lt_K;
                try {
                    T_suc_Lt_K = CP_INSTANCE.PropsSI('T', 'H', ltStage.h_suc, 'P', ltStage.Pe_Pa, fluidLt);
                } catch (e) {
                    T_suc_Lt_K = ltStage.T1_K; // 如果计算失败，使用T1
                }
                statePoints.push({
                    name: "LT-1'",
                    desc: 'Low Stage Comp In (SLHX)',
                    temp: (T_suc_Lt_K - 273.15).toFixed(1),
                    press: (ltStage.Pe_Pa / 1e5).toFixed(2),
                    enth: (ltStage.h_suc / 1000).toFixed(1),
                    flow: ltStage.m_dot.toFixed(4)
                });
            }
            
            statePoints.push({
                name: 'LT-2',
                desc: 'Low Stage Discharge',
                temp: ltStage.T2a_C.toFixed(1),
                press: (ltStage.Pc_Pa / 1e5).toFixed(2),
                enth: (ltStage.h2a / 1000).toFixed(1),
                flow: ltStage.m_dot_total.toFixed(4)
            });
            
            statePoints.push({
                name: 'LT-3',
                desc: 'Low Stage Cond Out',
                temp: (ltStage.T3_K - 273.15).toFixed(1),
                press: (ltStage.Pc_Pa / 1e5).toFixed(2),
                enth: (ltStage.h3 / 1000).toFixed(1),
                flow: ltStage.m_dot_total.toFixed(4)
            });
            
            if (ltStage.isSlhxEnabled) {
                let P_5p_chart_Lt = ltStage.Pc_Pa;
                let T_5p_Lt_K;
                try {
                    T_5p_Lt_K = CP_INSTANCE.PropsSI('T', 'H', ltStage.h4, 'P', P_5p_chart_Lt, fluidLt);
                } catch (e) {
                    T_5p_Lt_K = ltStage.T3_K; // 如果计算失败，使用T3
                }
                statePoints.push({
                    name: "LT-5'",
                    desc: 'Low Stage Exp Valve In (SLHX)',
                    temp: (T_5p_Lt_K - 273.15).toFixed(1),
                    press: (P_5p_chart_Lt / 1e5).toFixed(2),
                    enth: (ltStage.h4 / 1000).toFixed(1),
                    flow: ltStage.m_dot.toFixed(4)
                });
            }
            
            statePoints.push({
                name: 'LT-4',
                desc: 'Low Stage Exp Valve Out',
                temp: ltStage.T4_C.toFixed(1),
                press: (ltStage.Pe_Pa / 1e5).toFixed(2),
                enth: (ltStage.h4 / 1000).toFixed(1),
                flow: ltStage.m_dot.toFixed(4)
            });
            
            // 高温级状态点
            statePoints.push({
                name: 'HT-1',
                desc: 'High Stage Evap Out',
                temp: (htStage.T1_K - 273.15).toFixed(1),
                press: (htStage.Pe_Pa / 1e5).toFixed(2),
                enth: (htStage.h1 / 1000).toFixed(1),
                flow: htStage.m_dot.toFixed(4)
            });
            
            statePoints.push({
                name: 'HT-2',
                desc: 'High Stage Discharge',
                temp: htStage.T2a_C.toFixed(1),
                press: (htStage.Pc_Pa / 1e5).toFixed(2),
                enth: (htStage.h2a / 1000).toFixed(1),
                flow: htStage.m_dot_total.toFixed(4)
            });
            
            statePoints.push({
                name: 'HT-3',
                desc: 'High Stage Cond Out',
                temp: (htStage.T3_K - 273.15).toFixed(1),
                press: (htStage.Pc_Pa / 1e5).toFixed(2),
                enth: (htStage.h3 / 1000).toFixed(1),
                flow: htStage.m_dot_total.toFixed(4)
            });
            
            if (htStage.isEcoEnabled) {
                if (htStage.ecoType === 'flash_tank') {
                    const T_eco_sat_Ht_C = htStage.T_eco_sat_K ? (htStage.T_eco_sat_K - 273.15).toFixed(1) : '---';
                    const T_eco_liq_Ht_K = CP_INSTANCE.PropsSI('T', 'P', htStage.P_eco_Pa, 'Q', 0, fluidHt);
                    const T_eco_vap_Ht_K = CP_INSTANCE.PropsSI('T', 'P', htStage.P_eco_Pa, 'Q', 1, fluidHt);
                    
                    statePoints.push({
                        name: 'HT-7',
                        desc: 'High Stage Flash In (Valve)',
                        temp: T_eco_sat_Ht_C,
                        press: (htStage.P_eco_Pa / 1e5).toFixed(2),
                        enth: (htStage.h7 / 1000).toFixed(1),
                        flow: htStage.m_dot_total.toFixed(4)
                    });
                    
                    statePoints.push({
                        name: 'HT-6',
                        desc: 'High Stage Injection Gas',
                        temp: (T_eco_vap_Ht_K - 273.15).toFixed(1),
                        press: (htStage.P_eco_Pa / 1e5).toFixed(2),
                        enth: (htStage.h6 / 1000).toFixed(1),
                        flow: htStage.m_dot_inj.toFixed(4)
                    });
                    
                    statePoints.push({
                        name: 'HT-5',
                        desc: 'High Stage ECO Liq Out',
                        temp: (T_eco_liq_Ht_K - 273.15).toFixed(1),
                        press: (htStage.P_eco_Pa / 1e5).toFixed(2),
                        enth: (htStage.h5 / 1000).toFixed(1),
                        flow: htStage.m_dot.toFixed(4)
                    });
                } else {
                    // Subcooler
                    const T_eco_sat_Ht_C = htStage.T_eco_sat_K ? (htStage.T_eco_sat_K - 273.15).toFixed(1) : '---';
                    const T_7_Ht_K = CP_INSTANCE.PropsSI('T', 'P', htStage.P_eco_Pa, 'Q', 0, fluidHt);
                    const T_6_Ht_K = CP_INSTANCE.PropsSI('T', 'P', htStage.P_eco_Pa, 'H', htStage.h6, fluidHt);
                    const T_5_Ht_K = CP_INSTANCE.PropsSI('T', 'P', htStage.Pc_Pa, 'H', htStage.h5, fluidHt);
                    
                    statePoints.push({
                        name: 'HT-7',
                        desc: 'High Stage Inj Valve Out',
                        temp: (T_7_Ht_K - 273.15).toFixed(1),
                        press: (htStage.P_eco_Pa / 1e5).toFixed(2),
                        enth: (htStage.h7 / 1000).toFixed(1),
                        flow: htStage.m_dot_inj.toFixed(4)
                    });
                    
                    statePoints.push({
                        name: 'HT-6',
                        desc: 'High Stage Injection Gas',
                        temp: (T_6_Ht_K - 273.15).toFixed(1),
                        press: (htStage.P_eco_Pa / 1e5).toFixed(2),
                        enth: (htStage.h6 / 1000).toFixed(1),
                        flow: htStage.m_dot_inj.toFixed(4)
                    });
                    
                    statePoints.push({
                        name: 'HT-5',
                        desc: 'High Stage Subcooler Out',
                        temp: (T_5_Ht_K - 273.15).toFixed(1),
                        press: (htStage.Pc_Pa / 1e5).toFixed(2),
                        enth: (htStage.h5 / 1000).toFixed(1),
                        flow: htStage.m_dot.toFixed(4)
                    });
                }
            }
            
            statePoints.push({
                name: 'HT-4',
                desc: 'High Stage Exp Valve Out',
                temp: htStage.T4_C.toFixed(1),
                press: (htStage.Pe_Pa / 1e5).toFixed(2),
                enth: (htStage.h4 / 1000).toFixed(1),
                flow: htStage.m_dot.toFixed(4)
            });

            // --- 5. 绘制 P-h 图（分别绘制两级，支持ECO和SLHX，完全按照模式1逻辑） ---
            const point = (name, h_j, p_pa, pos = 'top') => ({ 
                name, 
                value: [h_j / 1000, p_pa / 1e5], 
                label: { position: pos, show: true } 
            });

            // 辅助函数：构建P-h图点（与模式1完全一致）
            function buildPHPoints(stage) {
                const pt1 = point('1', stage.h1, stage.Pe_Pa, 'bottom');
                const pt1_p = point("1'", stage.h_suc, stage.Pe_Pa, 'bottom');
                const pt2 = point('2', stage.h2a, stage.Pc_Pa, 'top');
                const pt3 = point('3', stage.h3, stage.Pc_Pa, 'top');
                const pt4 = point('4', stage.h4, stage.Pe_Pa, 'bottom');

                // 点5'的压力：Flash Tank时用P_eco，否则用Pc
                let P_5p_chart = stage.Pc_Pa;
                if (stage.isEcoEnabled && stage.ecoType === 'flash_tank') {
                    P_5p_chart = stage.P_eco_Pa;
                }
                // 点5'的焓值：SLHX后的液体焓值（等于h4，因为h4 = h_liq_out）
                const h_liq_out = stage.h4; // h4就是SLHX后的液体焓值
                const pt5_p = stage.isSlhxEnabled ? point("5'", h_liq_out, P_5p_chart, 'top') : null;
                const pt5 = stage.isEcoEnabled ? point('5', stage.h5, P_5p_chart, 'top') : null;

                let mainPoints = [], ecoLiquidPoints = [], ecoVaporPoints = [];

                if (!stage.isEcoEnabled) {
                    if (stage.isSlhxEnabled) {
                        mainPoints = [pt1, pt1_p, pt2, pt3, pt5_p, pt4, pt1];
                    } else {
                        mainPoints = [pt1, pt2, pt3, pt4, pt1];
                    }
                } else {
                    if (stage.ecoType === 'flash_tank') {
                        // Flash Tank模式（完全按照模式1逻辑）
                        const pt7 = point('7', stage.h7, stage.P_eco_Pa, 'right');
                        const pt6 = point('6', stage.h6, stage.P_eco_Pa, 'left');
                        
                        // 主循环：4 -> 1 -> 1' -> 2 -> 3（压缩线是 1'->2 一条直线）
                        // 与模式1完全一致：使用三元运算符
                        mainPoints = [pt4, pt1, stage.isSlhxEnabled ? pt1_p : pt1, pt2, pt3];

                        // 液路：3 -> 7 -> 5 -> [5'] -> 4
                        ecoLiquidPoints = [pt3, pt7, pt5];
                        if (stage.isSlhxEnabled) {
                            ecoLiquidPoints.push(pt5_p, pt4);
                        } else {
                            ecoLiquidPoints.push(pt4);
                        }

                        // 补气路：7 -> 6（点6是补气气体状态）
                        ecoVaporPoints = [pt7, pt6];
                    } else {
                        // Subcooler模式（完全按照模式1逻辑）
                        const pt7 = point('7', stage.h7, stage.P_eco_Pa, 'right');
                        const pt6 = point('6', stage.h6, stage.P_eco_Pa, 'left');
                        
                        // 液路：3 -> 5 -> [5'] -> 4
                        ecoLiquidPoints = [pt3, pt5];
                        if (stage.isSlhxEnabled) {
                            ecoLiquidPoints.push(pt5_p, pt4);
                        } else {
                            ecoLiquidPoints.push(pt4);
                        }

                        // 主循环：4 -> 1 -> [1'] -> 2 -> 3（压缩线是 1'->2 或 1->2 一条直线）
                        mainPoints = [pt4, pt1];
                        if (stage.isSlhxEnabled) {
                            mainPoints.push(pt1_p);
                        }
                        mainPoints.push(pt2, pt3);

                        // 补气路：3 -> 7 -> 6（点6是补气气体状态）
                        // 与模式1完全一致：从点3克隆开始
                        const pt3_clone = point('', stage.h3, stage.Pc_Pa);
                        ecoVaporPoints = [pt3_clone, pt7, pt6];
                    }
                }

                return { mainPoints, ecoLiquidPoints, ecoVaporPoints };
            }

            // 低温级P-h图
            const ltPH = buildPHPoints(ltStage);
            const ltMainPoints = ltPH.mainPoints;
            const ltEcoLiquidPoints = ltPH.ecoLiquidPoints;
            const ltEcoVaporPoints = ltPH.ecoVaporPoints;

            // 高温级P-h图
            const htPH = buildPHPoints(htStage);
            const htMainPoints = htPH.mainPoints;
            const htEcoLiquidPoints = htPH.ecoLiquidPoints;
            const htEcoVaporPoints = htPH.ecoVaporPoints;

            ['chart-desktop-m4-lt', 'chart-mobile-m4-lt'].forEach(id => {
                drawPHDiagram(id, {
                    title: `Low Stage (${fluidLt})`,
                    mainPoints: ltMainPoints,
                    ecoLiquidPoints: ltEcoLiquidPoints,
                    ecoVaporPoints: ltEcoVaporPoints,
                    xLabel: 'h (kJ/kg)',
                    yLabel: 'P (bar)'
                });
            });

            ['chart-desktop-m4-ht', 'chart-mobile-m4-ht'].forEach(id => {
                drawPHDiagram(id, {
                    title: `High Stage (${fluidHt})`,
                    mainPoints: htMainPoints,
                    ecoLiquidPoints: htEcoLiquidPoints,
                    ecoVaporPoints: htEcoVaporPoints,
                    xLabel: 'h (kJ/kg)',
                    yLabel: 'P (bar)'
                });
            });

            // --- 6. 渲染结果面板 ---
            const html = `
                <div class="grid grid-cols-2 gap-4 mb-6">
                    ${createKpiCard('系统制冷量', (Q_evap_total_W / 1000).toFixed(2), 'kW', 'From Low Stage', 'blue')}
                    ${createKpiCard('总轴功率', (W_shaft_total_W / 1000).toFixed(2), 'kW', 'Shaft Power', 'orange')}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div class="bg-white/60 p-4 rounded-2xl border border-white/50">
                        ${createSectionHeader('Low Stage Summary', '❄️')}
                        ${createDetailRow('Refrigerant', fluidLt)}
                        ${createDetailRow('Te / Tc', `${TeLt_C.toFixed(1)} / ${TcLt_C.toFixed(1)} °C`)}
                        ${createDetailRow('Q_evap', `${(ltStage.Q_evap_W / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('Q_cond (Cascade)', `${(ltStage.Q_cond_W / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('W_shaft', `${(ltStage.W_shaft_W / 1000).toFixed(2)} kW`)}
                    </div>
                    <div class="bg-white/60 p-4 rounded-2xl border border-white/50">
                        ${createSectionHeader('High Stage Summary', '🔥')}
                        ${createDetailRow('Refrigerant', fluidHt)}
                        ${createDetailRow('Te / Tc', `${T_int_C.toFixed(1)} / ${TcHt_C.toFixed(1)} °C`)}
                        ${createDetailRow('Q_evap (Cascade)', `${(htStage.Q_evap_W / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('Q_cond', `${(htStage.Q_cond_W / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('W_shaft', `${(htStage.W_shaft_W / 1000).toFixed(2)} kW`)}
                    </div>
                </div>

                <div class="space-y-1 bg-white/40 p-4 rounded-2xl border border-white/50 shadow-inner">
                    ${createSectionHeader('System Performance', '📈')}
                    ${createDetailRow('COP (System)', COP_system.toFixed(3), true)}
                    ${createDetailRow('Cascade Balance', `${(balance * 100).toFixed(2)} %`, Math.abs(balance) < 0.001)}
                    ${createSectionHeader('State Points', '📊')}
                    ${createStateTable(statePoints)}
                </div>
            `;

            renderToAllViews(html);

            updateMobileSummary('Q_evap', `${(Q_evap_total_W / 1000).toFixed(2)} kW`, 'COP', COP_system.toFixed(2));

            openMobileSheet('m4');

            setButtonFresh4();
            if (printButtonM4) printButtonM4.disabled = false;

            lastCalculationData = {
                fluidLt,
                fluidHt,
                TeLt_C,
                TcHt_C,
                T_int_C,
                TcLt_C,
                ltStage,
                htStage,
                Q_evap_total_W,
                W_shaft_total_W,
                W_input_total_W,
                COP_system
            };

            const inputState = SessionState.collectInputs('calc-form-mode-4');
            HistoryDB.add(
                'M4',
                `${fluidLt}/${fluidHt} • ${(Q_evap_total_W / 1000).toFixed(2)} kW • COP ${COP_system.toFixed(2)}`,
                inputState,
                { 'Q_evap': `${(Q_evap_total_W / 1000).toFixed(2)} kW`, COP: COP_system.toFixed(2) }
            );
        } catch (error) {
            console.error(error);
            renderToAllViews(createErrorCard(error.message));
            if (printButtonM4) printButtonM4.disabled = true;
        }
    }, 50);
}

function printReportMode4() {
    if (!lastCalculationData) return;
    const d = lastCalculationData;
    const resultDiv = document.querySelector('.print-results');
    let tableText = '\n\nState Points:\n--------------------\nPoint\tT(C)\tP(bar)\th(kJ)\tm(kg/s)\n';
    const pts = [
        { name: 'LT-1', s: d.ltStage },
        { name: 'LT-2', s: d.ltStage },
        { name: 'LT-3', s: d.ltStage },
        { name: 'HT-1', s: d.htStage },
        { name: 'HT-2', s: d.htStage },
        { name: 'HT-3', s: d.htStage }
    ];
    // 简化输出，重点是系统指标
    tableText += `Q_evap_total\t${(d.Q_evap_total_W / 1000).toFixed(3)} kW\n`;
    tableText += `W_input_total\t${(d.W_input_total_W / 1000).toFixed(3)} kW\n`;
    tableText += `COP_system\t${d.COP_system.toFixed(3)}\n`;

    resultDiv.innerText = `Cascade Compression Report:\n` + tableText;
    window.print();
}

// ---------------------------------------------------------------------
// Compressor Model Selection Handlers
// ---------------------------------------------------------------------

function initCompressorModelSelectorsM4Lt() {
    const brands = getAllBrands();
    compressorBrandLt.innerHTML = '<option value="">-- 选择品牌 --</option>';
    brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        compressorBrandLt.appendChild(option);
    });

    compressorBrandLt.addEventListener('change', () => {
        const brand = compressorBrandLt.value;
        compressorSeriesLt.innerHTML = '<option value="">-- 选择系列 --</option>';
        compressorModelLt.innerHTML = '<option value="">-- 选择型号 --</option>';
        compressorSeriesLt.disabled = !brand;
        compressorModelLt.disabled = true;
        modelDisplacementInfoLt.classList.add('hidden');

        if (brand) {
            const series = getSeriesByBrand(brand);
            series.forEach(s => {
                const option = document.createElement('option');
                option.value = s;
                option.textContent = s;
                compressorSeriesLt.appendChild(option);
            });
            compressorSeriesLt.disabled = false;
        }
    });

    compressorSeriesLt.addEventListener('change', () => {
        const brand = compressorBrandLt.value;
        const series = compressorSeriesLt.value;
        compressorModelLt.innerHTML = '<option value="">-- 选择型号 --</option>';
        compressorModelLt.disabled = !series;
        modelDisplacementInfoLt.classList.add('hidden');

        if (brand && series) {
            const models = getModelsBySeries(brand, series);
            models.forEach(m => {
                const option = document.createElement('option');
                option.value = m.model;
                option.textContent = m.model;
                compressorModelLt.appendChild(option);
            });
            compressorModelLt.disabled = false;
        }
    });

    compressorModelLt.addEventListener('change', () => {
        const brand = compressorBrandLt.value;
        const series = compressorSeriesLt.value;
        const model = compressorModelLt.value;

        if (brand && series && model) {
            const displacement = getDisplacementByModel(brand, series, model);
            if (displacement !== null) {
                modelDisplacementValueLt.textContent = displacement.toFixed(0);
                modelDisplacementInfoLt.classList.remove('hidden');
                
                if (flowLtInput) {
                    flowLtInput.value = displacement.toFixed(2);
                    setButtonStale4();
                }
            } else {
                modelDisplacementInfoLt.classList.add('hidden');
            }
        } else {
            modelDisplacementInfoLt.classList.add('hidden');
        }
    });
}

function initCompressorModelSelectorsM4Ht() {
    const brands = getAllBrands();
    compressorBrandHt.innerHTML = '<option value="">-- 选择品牌 --</option>';
    brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        compressorBrandHt.appendChild(option);
    });

    compressorBrandHt.addEventListener('change', () => {
        const brand = compressorBrandHt.value;
        compressorSeriesHt.innerHTML = '<option value="">-- 选择系列 --</option>';
        compressorModelHt.innerHTML = '<option value="">-- 选择型号 --</option>';
        compressorSeriesHt.disabled = !brand;
        compressorModelHt.disabled = true;
        modelDisplacementInfoHt.classList.add('hidden');

        if (brand) {
            const series = getSeriesByBrand(brand);
            series.forEach(s => {
                const option = document.createElement('option');
                option.value = s;
                option.textContent = s;
                compressorSeriesHt.appendChild(option);
            });
            compressorSeriesHt.disabled = false;
        }
    });

    compressorSeriesHt.addEventListener('change', () => {
        const brand = compressorBrandHt.value;
        const series = compressorSeriesHt.value;
        compressorModelHt.innerHTML = '<option value="">-- 选择型号 --</option>';
        compressorModelHt.disabled = !series;
        modelDisplacementInfoHt.classList.add('hidden');

        if (brand && series) {
            const models = getModelsBySeries(brand, series);
            models.forEach(m => {
                const option = document.createElement('option');
                option.value = m.model;
                option.textContent = m.model;
                compressorModelHt.appendChild(option);
            });
            compressorModelHt.disabled = false;
        }
    });

    compressorModelHt.addEventListener('change', () => {
        const brand = compressorBrandHt.value;
        const series = compressorSeriesHt.value;
        const model = compressorModelHt.value;

        if (brand && series && model) {
            const displacement = getDisplacementByModel(brand, series, model);
            if (displacement !== null) {
                modelDisplacementValueHt.textContent = displacement.toFixed(0);
                modelDisplacementInfoHt.classList.remove('hidden');
                
                if (flowHtInput) {
                    flowHtInput.value = displacement.toFixed(2);
                    setButtonStale4();
                }
            } else {
                modelDisplacementInfoHt.classList.add('hidden');
            }
        } else {
            modelDisplacementInfoHt.classList.add('hidden');
        }
    });
}

// ---------------------------------------------------------------------
// Auto Efficiency Calculation (AI自动效率计算)
// ---------------------------------------------------------------------

function updateAndDisplayEfficienciesM4Lt() {
    if (!CP_INSTANCE || !autoEffLtCheckbox || !autoEffLtCheckbox.checked) return;
    
    try {
        const fluid = fluidLtSelect.value;
        const Te_C = parseFloat(tempEvapLtInput.value);
        const approachDt = parseFloat(approachDtInput.value);
        const TcHt_C = parseFloat(tempCondHtInput.value);
        
        if (isNaN(Te_C) || isNaN(TcHt_C) || isNaN(approachDt) || TcHt_C <= Te_C) return;
        
        // 估算中间温度（简化：取中值）
        const T_int_C_est = (Te_C + TcHt_C) / 2;
        const TcLt_C_est = T_int_C_est + approachDt;
        
        if (TcLt_C_est >= TcHt_C) return;
        
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', Te_C + 273.15, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', TcLt_C_est + 273.15, 'Q', 1, fluid);
        
        if (!Pe_Pa || !Pc_Pa || Pe_Pa <= 0 || Pc_Pa <= 0) return;
        
        const pressureRatio = Pc_Pa / Pe_Pa;
        const efficiencies = calculateEmpiricalEfficiencies(pressureRatio);
        
        if (etaVLtInput) etaVLtInput.value = efficiencies.eta_v;
        if (etaSLtInput) etaSLtInput.value = efficiencies.eta_s;
        
    } catch (error) {
        console.warn("Auto-Eff LT Error (Ignored):", error.message);
    }
}

function updateAndDisplayEfficienciesM4Ht() {
    if (!CP_INSTANCE || !autoEffHtCheckbox || !autoEffHtCheckbox.checked) return;
    
    try {
        const fluid = fluidHtSelect.value;
        const TcHt_C = parseFloat(tempCondHtInput.value);
        const TeLt_C = parseFloat(tempEvapLtInput.value);
        const approachDt = parseFloat(approachDtInput.value);
        
        if (isNaN(TeLt_C) || isNaN(TcHt_C) || isNaN(approachDt) || TcHt_C <= TeLt_C) return;
        
        // 估算中间温度（简化：取中值）
        const T_int_C_est = (TeLt_C + TcHt_C) / 2;
        const TeHt_C_est = T_int_C_est; // 高温级蒸发温度等于中间温度
        
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', TeHt_C_est + 273.15, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', TcHt_C + 273.15, 'Q', 1, fluid);
        
        if (!Pe_Pa || !Pc_Pa || Pe_Pa <= 0 || Pc_Pa <= 0) return;
        
        const pressureRatio = Pc_Pa / Pe_Pa;
        const efficiencies = calculateEmpiricalEfficiencies(pressureRatio);
        
        if (etaVHtInput) etaVHtInput.value = efficiencies.eta_v;
        if (etaSHtInput) etaSHtInput.value = efficiencies.eta_s;
        
    } catch (error) {
        console.warn("Auto-Eff HT Error (Ignored):", error.message);
    }
}

export function triggerMode4EfficiencyUpdate() {
    updateAndDisplayEfficienciesM4Lt();
    updateAndDisplayEfficienciesM4Ht();
}

export function initMode4(CP) {
    CP_INSTANCE = CP;

    calcButtonM4 = document.getElementById('calc-button-mode-4');
    calcFormM4 = document.getElementById('calc-form-mode-4');
    printButtonM4 = document.getElementById('print-button-mode-4');
    resultsDesktopM4 = document.getElementById('results-desktop-m4');
    resultsMobileM4 = document.getElementById('mobile-results-m4');
    summaryMobileM4 = document.getElementById('mobile-summary-m4');

    // 低温级
    fluidLtSelect = document.getElementById('fluid_m4_lt');
    fluidInfoLtDiv = document.getElementById('fluid-info-m4-lt');
    tempEvapLtInput = document.getElementById('temp_evap_m4_lt');
    superheatLtInput = document.getElementById('superheat_m4_lt');
    subcoolLtInput = document.getElementById('subcooling_m4_lt');
    flowLtInput = document.getElementById('flow_m3h_m4_lt');
    etaVLtInput = document.getElementById('eta_v_m4_lt');
    etaSLtInput = document.getElementById('eta_s_m4_lt');
    autoEffLtCheckbox = document.getElementById('auto-eff-m4-lt');
    compressorBrandLt = document.getElementById('compressor_brand_m4_lt');
    compressorSeriesLt = document.getElementById('compressor_series_m4_lt');
    compressorModelLt = document.getElementById('compressor_model_m4_lt');
    modelDisplacementInfoLt = document.getElementById('model_displacement_info_m4_lt');
    modelDisplacementValueLt = document.getElementById('model_displacement_value_m4_lt');
    slhxCheckboxLt = document.getElementById('enable_slhx_m4_lt');
    slhxEffLt = document.getElementById('slhx_effectiveness_m4_lt');

    // 高温级
    fluidHtSelect = document.getElementById('fluid_m4_ht');
    fluidInfoHtDiv = document.getElementById('fluid-info-m4-ht');
    tempCondHtInput = document.getElementById('temp_cond_m4_ht');
    superheatHtInput = document.getElementById('superheat_m4_ht');
    subcoolHtInput = document.getElementById('subcooling_m4_ht');
    flowHtInput = document.getElementById('flow_m3h_m4_ht');
    etaVHtInput = document.getElementById('eta_v_m4_ht');
    etaSHtInput = document.getElementById('eta_s_m4_ht');
    autoEffHtCheckbox = document.getElementById('auto-eff-m4-ht');
    compressorBrandHt = document.getElementById('compressor_brand_m4_ht');
    compressorSeriesHt = document.getElementById('compressor_series_m4_ht');
    compressorModelHt = document.getElementById('compressor_model_m4_ht');
    modelDisplacementInfoHt = document.getElementById('model_displacement_info_m4_ht');
    modelDisplacementValueHt = document.getElementById('model_displacement_value_m4_ht');
    ecoCheckboxHt = document.getElementById('enable_eco_m4_ht');
    ecoSatTempHt = document.getElementById('temp_eco_sat_m4_ht');
    ecoSuperheatHt = document.getElementById('eco_superheat_m4_ht');
    ecoDtHt = document.getElementById('eco_dt_m4_ht');

    // 中间换热器
    approachDtInput = document.getElementById('approach_dt_m4');

    // Initialize compressor model selectors
    if (compressorBrandLt && compressorSeriesLt && compressorModelLt) {
        initCompressorModelSelectorsM4Lt();
    }
    if (compressorBrandHt && compressorSeriesHt && compressorModelHt) {
        initCompressorModelSelectorsM4Ht();
    }

    if (calcFormM4) {
        calcFormM4.addEventListener('submit', (e) => {
            e.preventDefault();
            calculateMode4();
        });

        const inputs = calcFormM4.querySelectorAll('input, select');
        inputs.forEach((input) => {
            input.addEventListener('input', setButtonStale4);
            input.addEventListener('change', setButtonStale4);
        });

        if (fluidLtSelect && fluidInfoLtDiv) {
            fluidLtSelect.addEventListener('change', () => {
                updateFluidInfo(fluidLtSelect, fluidInfoLtDiv, CP_INSTANCE);
                updateAndDisplayEfficienciesM4Lt();
            });
        }
        if (fluidHtSelect && fluidInfoHtDiv) {
            fluidHtSelect.addEventListener('change', () => {
                updateFluidInfo(fluidHtSelect, fluidInfoHtDiv, CP_INSTANCE);
                updateAndDisplayEfficienciesM4Ht();
            });
        }

        // 自动效率更新监听器
        [tempEvapLtInput, tempCondHtInput, approachDtInput, autoEffLtCheckbox, autoEffHtCheckbox].forEach(input => {
            if (input) {
                input.addEventListener('change', () => {
                    updateAndDisplayEfficienciesM4Lt();
                    updateAndDisplayEfficienciesM4Ht();
                });
                input.addEventListener('input', () => {
                    if (autoEffLtCheckbox && autoEffLtCheckbox.checked) updateAndDisplayEfficienciesM4Lt();
                    if (autoEffHtCheckbox && autoEffHtCheckbox.checked) updateAndDisplayEfficienciesM4Ht();
                });
            }
        });

        // 自动效率开关：触发效率更新（UI锁定由ui.js的setupLock处理）
        if (autoEffLtCheckbox) {
            autoEffLtCheckbox.addEventListener('change', () => {
                if (autoEffLtCheckbox.checked) {
                    updateAndDisplayEfficienciesM4Lt();
                }
            });
        }
        
        if (autoEffHtCheckbox) {
            autoEffHtCheckbox.addEventListener('change', () => {
                if (autoEffHtCheckbox.checked) {
                    updateAndDisplayEfficienciesM4Ht();
                }
            });
        }

        if (printButtonM4) {
            printButtonM4.addEventListener('click', printReportMode4);
        }
        
        // 初始化时触发一次效率更新（如果自动效率开关已开启）
        setTimeout(() => {
            if (autoEffLtCheckbox && autoEffLtCheckbox.checked) {
                updateAndDisplayEfficienciesM4Lt();
            }
            if (autoEffHtCheckbox && autoEffHtCheckbox.checked) {
                updateAndDisplayEfficienciesM4Ht();
            }
        }, 100);
    }

    console.log('Mode 4 (Cascade) initialized.');
}


