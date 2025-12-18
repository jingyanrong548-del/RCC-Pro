// =====================================================================
// mode6_two_stage_double.js: 模式六 (双机双级压缩) - v1.0
// 职责: 两台压缩机串联实现两级压缩，低压级和高压级独立计算，
//      支持中间冷却/补气和不同的压缩机参数。
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
let calcButtonM6, calcFormM6, printButtonM6;
let resultsDesktopM6, resultsMobileM6, summaryMobileM6;

// 低压级输入元素
let fluidSelect, fluidInfoDiv, tempEvapInput, superheatInput, subcoolInput;
let flowLpInput;
let etaVLpInput, etaSLpInput, autoEffLpCheckbox;
let compressorBrandLp, compressorSeriesLp, compressorModelLp, modelDisplacementInfoLp, modelDisplacementValueLp;
let tempDischargeActualLpInput;

// 高压级输入元素
let tempCondInput;
let flowHpInput;
let etaVHpInput, etaSHpInput, autoEffHpCheckbox;
let compressorBrandHp, compressorSeriesHp, compressorModelHp, modelDisplacementInfoHp, modelDisplacementValueHp;
let tempDischargeActualHpInput;

// 中间压力设置
let interPressMode, interSatTempInput;

// ECO 设置 - 中间冷却器
let ecoCheckbox, ecoType, ecoSuperheatInput, ecoDtInput;
// ECO 设置 - 低压级
let ecoCheckboxLp, ecoTypeLp, ecoSuperheatInputLp, ecoDtInputLp;
// ECO 设置 - 高压级
let ecoCheckboxHp, ecoTypeHp, ecoSuperheatInputHp, ecoDtInputHp;

const BTN_TEXT_CALCULATE = 'Calculate Two-Stage Double';
const BTN_TEXT_RECALCULATE = 'Recalculate (Input Changed)';

// ---------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------

function setButtonStale6() {
    if (calcButtonM6 && calcButtonM6.innerText !== BTN_TEXT_RECALCULATE) {
        calcButtonM6.innerText = BTN_TEXT_RECALCULATE;
        calcButtonM6.classList.add('opacity-90', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
        if (printButtonM6) {
            printButtonM6.disabled = true;
            printButtonM6.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
}

function setButtonFresh6() {
    if (calcButtonM6) {
        calcButtonM6.innerText = BTN_TEXT_CALCULATE;
        calcButtonM6.classList.remove('opacity-90', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
    }
}

function renderToAllViews(htmlContent) {
    if (resultsDesktopM6) resultsDesktopM6.innerHTML = htmlContent;
    if (resultsMobileM6) resultsMobileM6.innerHTML = htmlContent;
}

function updateMobileSummary(kpi1Label, kpi1Value, kpi2Label, kpi2Value) {
    if (!summaryMobileM6) return;
    summaryMobileM6.innerHTML = `
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
// Core Calculation Logic - Two-Stage Double Compressor
// ---------------------------------------------------------------------

// 低压级计算
function computeLowPressureStage({
    fluid,
    Te_C,
    P_intermediate_Pa,
    superheat_K,
    flow_m3h,
    eta_v,
    eta_s,
    T_2a_est_C = null,
    isEcoEnabled = false,
    ecoType = null,
    ecoSuperheat_K = 5,
    ecoDt_K = 5,
    h3_lp = null // 低压级冷凝器出口焓值（用于ECO）
}) {
    const T_evap_K = Te_C + 273.15;
    const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', T_evap_K, 'Q', 1, fluid);

    // 点 1：蒸发器出口
    const T1_K = T_evap_K + superheat_K;
    const h1 = CP_INSTANCE.PropsSI('H', 'T', T1_K, 'P', Pe_Pa, fluid);
    const s1 = CP_INSTANCE.PropsSI('S', 'T', T1_K, 'P', Pe_Pa, fluid);
    const rho1 = CP_INSTANCE.PropsSI('D', 'T', T1_K, 'P', Pe_Pa, fluid);

    // 质量流量
    const V_th_m3_s = flow_m3h / 3600.0;
    let m_dot_suc = V_th_m3_s * eta_v * rho1;
    let m_dot_total = m_dot_suc;
    let m_dot_inj = 0;
    let h_5_lp = null, h_6_lp = null, h_7_lp = null;
    let P_eco_lp_Pa = P_intermediate_Pa;

    // ECO计算（低压级）- 注意：低压级ECO在蒸发压力到中间压力之间
    if (isEcoEnabled && h3_lp !== null) {
        // 低压级ECO的压力应该是中间压力
        const T_eco_sat_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0, fluid);
        
        if (ecoType === 'flash_tank') {
            // 闪蒸罐模式
            const h_eco_liq = CP_INSTANCE.PropsSI('H', 'T', T_eco_sat_K, 'Q', 0, fluid);
            const h_eco_vap = CP_INSTANCE.PropsSI('H', 'T', T_eco_sat_K, 'Q', 1, fluid);
            h_7_lp = h3_lp; // 从冷凝器出口等焓节流到中间压力
            h_6_lp = h_eco_vap;
            h_5_lp = h_eco_liq;
            const x_flash = (h_7_lp - h_5_lp) / (h_6_lp - h_5_lp);
            if (x_flash > 0 && x_flash < 1) {
                m_dot_inj = m_dot_suc * (x_flash / (1 - x_flash));
                m_dot_total = m_dot_suc + m_dot_inj;
            }
        } else {
            // 过冷器模式 - 低压级ECO在中间压力下
            h_7_lp = h3_lp; // 从点3等焓节流到中间压力
            const T_inj_K = T_eco_sat_K + ecoSuperheat_K;
            h_6_lp = CP_INSTANCE.PropsSI('H', 'T', T_inj_K, 'P', P_intermediate_Pa, fluid);
            const T_5_K = T_eco_sat_K + ecoDt_K;
            // 低压级ECO的过冷器在中间压力下
            h_5_lp = CP_INSTANCE.PropsSI('H', 'T', T_5_K, 'P', P_intermediate_Pa, fluid);
            const h_diff_main = h3_lp - h_5_lp;
            const h_diff_inj = h_6_lp - h_7_lp;
            if (h_diff_main > 0 && h_diff_inj > 0) {
                m_dot_inj = (m_dot_suc * h_diff_main) / h_diff_inj;
                m_dot_total = m_dot_suc + m_dot_inj;
            }
        }
    }

    // 第一级压缩到中间压力
    const h_mid_1s = CP_INSTANCE.PropsSI('H', 'P', P_intermediate_Pa, 'S', s1, fluid);
    let W_s1 = m_dot_suc * (h_mid_1s - h1);
    
    // 如果有ECO补气，需要计算混合后的压缩
    let h_mix_lp = h_mid_1s;
    if (isEcoEnabled && m_dot_inj > 0 && h_6_lp !== null) {
        h_mix_lp = (m_dot_suc * h_mid_1s + m_dot_inj * h_6_lp) / m_dot_total;
        const s_mix = CP_INSTANCE.PropsSI('S', 'H', h_mix_lp, 'P', P_intermediate_Pa, fluid);
        const h_mid_2s = CP_INSTANCE.PropsSI('H', 'P', P_intermediate_Pa, 'S', s_mix, fluid);
        W_s1 = m_dot_suc * (h_mid_1s - h1) + m_dot_total * (h_mid_2s - h_mix_lp);
    }
    
    const W_shaft = W_s1 / eta_s;

    // 排气温度计算
    let T_2a_C = 0;
    let h_2a = 0;
    if (T_2a_est_C !== null && !isNaN(T_2a_est_C)) {
        const T_2a_est_K = T_2a_est_C + 273.15;
        h_2a = CP_INSTANCE.PropsSI('H', 'T', T_2a_est_K, 'P', P_intermediate_Pa, fluid);
        T_2a_C = T_2a_est_C;
    } else {
        // 使用等熵压缩后的焓值估算
        h_2a = (isEcoEnabled && m_dot_total > m_dot_suc) ? h_mix_lp + (W_shaft / m_dot_total) : h1 + (W_shaft / m_dot_suc);
        const T_2a_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'H', h_2a, fluid);
        T_2a_C = T_2a_K - 273.15;
    }

    // 油冷负荷计算
    const h_system_in_lp = m_dot_suc * h1 + (isEcoEnabled && m_dot_inj > 0 ? m_dot_inj * h_6_lp : 0);
    const h_2a_target = CP_INSTANCE.PropsSI('H', 'T', T_2a_C + 273.15, 'P', P_intermediate_Pa, fluid);
    const energy_out_gas = m_dot_total * h_2a_target;
    let Q_oil_lp_W = W_shaft - (energy_out_gas - h_system_in_lp);
    if (Q_oil_lp_W < 0) Q_oil_lp_W = 0;

    return {
        Pe_Pa,
        m_dot: m_dot_total,
        m_dot_suc,
        m_dot_inj,
        h1,
        h_mid: h_mid_1s,
        h_mix: h_mix_lp,
        h2a: h_2a,
        h5: h_5_lp,
        h6: h_6_lp,
        h7: h_7_lp,
        T1_K,
        T2a_C: T_2a_C,
        W_shaft_W: W_shaft,
        Q_oil_W: Q_oil_lp_W
    };
}

// 高压级计算
function computeHighPressureStage({
    fluid,
    P_intermediate_Pa,
    Pe_Pa, // 蒸发压力，用于节流计算
    Tc_C,
    superheat_K,
    subcooling_K,
    flow_m3h,
    eta_v,
    eta_s,
    m_dot_lp, // 来自低压级的流量
    h_mix, // 混合后的焓值
    m_dot_total = null, // ECO启用时的总流量
    isEcoEnabled = false,
    ecoType = null,
    h3 = null, // 冷凝器出口焓值
    h5 = null, // ECO出口焓值
    h6 = null, // 补气焓值
    h7 = null, // ECO入口焓值
    T_2a_est_C = null
}) {
    const T_cond_K = Tc_C + 273.15;
    const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', T_cond_K, 'Q', 1, fluid);

    // 点 1：高压级入口（中间压力下的状态）
    // 假设从中间压力下的饱和状态开始（简化处理）
    const T_intermediate_sat_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0, fluid);
    const T1_K = T_intermediate_sat_K + superheat_K;
    const h1 = CP_INSTANCE.PropsSI('H', 'T', T1_K, 'P', P_intermediate_Pa, fluid);
    const s1 = CP_INSTANCE.PropsSI('S', 'T', T1_K, 'P', P_intermediate_Pa, fluid);
    const rho1 = CP_INSTANCE.PropsSI('D', 'T', T1_K, 'P', P_intermediate_Pa, fluid);

    // 质量流量（高压级可能不同于低压级）
    const V_th_m3_s = flow_m3h / 3600.0;
    const m_dot_hp = V_th_m3_s * eta_v * rho1;

    // 混合过程
    let m_dot_total_final, h_mix_final;
    if (isEcoEnabled && m_dot_total !== null) {
        // ECO启用：使用ECO计算的总流量和混合焓值
        m_dot_total_final = m_dot_total;
        h_mix_final = h_mix;
    } else if (Math.abs(m_dot_hp - m_dot_lp) < 0.001) {
        // 流量相同，直接使用混合焓值
        m_dot_total_final = m_dot_hp;
        h_mix_final = h_mix;
    } else {
        // 流量不同，需要重新计算混合（简化：假设补气）
        m_dot_total_final = m_dot_hp;
        h_mix_final = h1; // 简化：使用高压级入口状态
    }

    // 第二级压缩到排气压力
    const s_mix = CP_INSTANCE.PropsSI('S', 'H', h_mix_final, 'P', P_intermediate_Pa, fluid);
    const h_2s_stage2 = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_mix, fluid);
    const W_s2 = m_dot_total_final * (h_2s_stage2 - h_mix_final);
    const W_shaft = W_s2 / eta_s;

    // 点 3：冷凝器出口（如果未提供则计算）
    const h3_final = h3 !== null ? h3 : CP_INSTANCE.PropsSI('H', 'T', T_cond_K - subcooling_K, 'P', Pc_Pa, fluid);
    const T3_K = CP_INSTANCE.PropsSI('T', 'H', h3_final, 'P', Pc_Pa, fluid);

    // 排气温度计算
    let T_2a_C = 0;
    let h_2a = 0;
    if (T_2a_est_C !== null && !isNaN(T_2a_est_C)) {
        const T_2a_est_K = T_2a_est_C + 273.15;
        h_2a = CP_INSTANCE.PropsSI('H', 'T', T_2a_est_K, 'P', Pc_Pa, fluid);
        T_2a_C = T_2a_est_C;
    } else {
        h_2a = h_mix_final + (W_shaft / m_dot_total_final);
        const T_2a_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h_2a, fluid);
        T_2a_C = T_2a_K - 273.15;
    }

    // 节流（根据ECO类型确定节流压力）
    // 注意：双机双级模式中，最终节流到蒸发压力Pe_Pa（不是中间压力）
    let h4, T4_C, h4_pressure;
    if (isEcoEnabled && ecoType === 'flash_tank') {
        // 闪蒸罐模式：液体从闪蒸罐底部节流到蒸发压力
        h4 = h5 || h3_final; // 使用闪蒸罐底部液体焓值
        h4_pressure = Pe_Pa; // 节流到蒸发压力
        const T4_K = CP_INSTANCE.PropsSI('T', 'P', h4_pressure, 'H', h4, fluid);
        T4_C = T4_K - 273.15;
    } else if (isEcoEnabled && ecoType === 'subcooler') {
        // 过冷器模式：
        // 点7：从点3等焓节流到中间压力（h7 = h3，已在ECO计算中设置）
        // 点4：从点5（过冷器出口）等焓节流到蒸发压力
        h4 = h5 || h3_final; // 使用过冷器出口焓值（等焓节流到蒸发压力）
        h4_pressure = Pe_Pa; // 节流到蒸发压力
        const T4_K = CP_INSTANCE.PropsSI('T', 'P', h4_pressure, 'H', h4, fluid);
        T4_C = T4_K - 273.15;
        // 确保h7 = h3（从点3等焓节流到中间压力）
        if (h7 === null || h7 === undefined) {
            h7 = h3_final;
        }
    } else {
        // 无ECO模式：直接节流到蒸发压力
        h4 = h3_final;
        h4_pressure = Pe_Pa; // 节流到蒸发压力
        const T4_K = CP_INSTANCE.PropsSI('T', 'P', h4_pressure, 'H', h4, fluid);
        T4_C = T4_K - 273.15;
    }

    // 冷凝放热
    const Q_cond_W = m_dot_total_final * (h_2a - h3_final);

    // 油冷负荷计算
    const h_system_in_hp = m_dot_total_final * h_mix_final;
    const h_2a_target = CP_INSTANCE.PropsSI('H', 'T', T_2a_C + 273.15, 'P', Pc_Pa, fluid);
    const energy_out_gas = m_dot_total_final * h_2a_target;
    let Q_oil_hp_W = W_shaft - (energy_out_gas - h_system_in_hp);
    if (Q_oil_hp_W < 0) Q_oil_hp_W = 0;

    return {
        Pc_Pa,
        Pe_Pa: Pe_Pa || P_intermediate_Pa, // 传递蒸发压力
        m_dot: m_dot_total_final,
        h1,
        h2a: h_2a,
        h3: h3_final,
        h4,
        h4_pressure: h4_pressure || Pe_Pa || P_intermediate_Pa,
        h5: h5 || h3_final,
        h6: h6 || 0,
        h7: h7 || h3_final,
        T1_K,
        T2a_C: T_2a_C,
        T3_K,
        T4_C,
        W_shaft_W: W_shaft,
        Q_cond_W,
        Q_oil_W: Q_oil_hp_W,
        h_mid_1s: isEcoEnabled ? CP_INSTANCE.PropsSI('H', 'P', P_intermediate_Pa, 'S', s1, fluid) : null,
        h_mix: h_mix_final
    };
}

function calculateMode6() {
    renderToAllViews('<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>');
    ['chart-desktop-m6', 'chart-mobile-m6'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    setTimeout(() => {
        try {
            // 读取输入
            const fluid = fluidSelect.value;
            const Te_C = parseFloat(tempEvapInput.value);
            const Tc_C = parseFloat(tempCondInput.value);
            const shLp_K = parseFloat(superheatInput.value);
            const scHp_K = parseFloat(subcoolInput.value);

            // 低压级流量
            let flowLp = parseFloat(flowLpInput.value);
            if (compressorModelLp && compressorModelLp.value) {
                const brand = compressorBrandLp.value;
                const series = compressorSeriesLp.value;
                const model = compressorModelLp.value;
                const displacement = getDisplacementByModel(brand, series, model);
                if (displacement !== null && (isNaN(flowLp) || flowLp <= 0)) {
                    flowLp = displacement;
                }
            }

            const eta_v_lp = parseFloat(etaVLpInput.value);
            const eta_s_lp = parseFloat(etaSLpInput.value);

            // 高压级流量
            let flowHp = parseFloat(flowHpInput.value);
            if (compressorModelHp && compressorModelHp.value) {
                const brand = compressorBrandHp.value;
                const series = compressorSeriesHp.value;
                const model = compressorModelHp.value;
                const displacement = getDisplacementByModel(brand, series, model);
                if (displacement !== null && (isNaN(flowHp) || flowHp <= 0)) {
                    flowHp = displacement;
                }
            }

            const eta_v_hp = parseFloat(etaVHpInput.value);
            const eta_s_hp = parseFloat(etaSHpInput.value);

            // 中间压力设置
            const interPressModeValue = document.querySelector('input[name="inter_press_mode_m6"]:checked')?.value || 'auto';
            const interSatTempValue = interSatTempInput ? parseFloat(interSatTempInput.value) : null;

            // ECO参数 - 中间冷却器
            const isEcoEnabled = ecoCheckbox && ecoCheckbox.checked;
            const ecoTypeValue = isEcoEnabled ? (document.querySelector('input[name="eco_type_m6"]:checked')?.value || 'flash_tank') : null;
            const ecoSuperheatValue = ecoSuperheatInput ? parseFloat(ecoSuperheatInput.value) : 5;
            const ecoDtValue = ecoDtInput ? parseFloat(ecoDtInput.value) : 5.0;
            
            // ECO参数 - 低压级
            const isEcoEnabledLp = ecoCheckboxLp && ecoCheckboxLp.checked;
            const ecoTypeLpValue = isEcoEnabledLp ? (document.querySelector('input[name="eco_type_m6_lp"]:checked')?.value || 'flash_tank') : null;
            const ecoSuperheatLpValue = ecoSuperheatInputLp ? parseFloat(ecoSuperheatInputLp.value) : 5;
            const ecoDtLpValue = ecoDtInputLp ? parseFloat(ecoDtInputLp.value) : 5.0;
            
            // ECO参数 - 高压级
            const isEcoEnabledHp = ecoCheckboxHp && ecoCheckboxHp.checked;
            const ecoTypeHpValue = isEcoEnabledHp ? (document.querySelector('input[name="eco_type_m6_hp"]:checked')?.value || 'flash_tank') : null;
            const ecoSuperheatHpValue = ecoSuperheatInputHp ? parseFloat(ecoSuperheatInputHp.value) : 5;
            const ecoDtHpValue = ecoDtInputHp ? parseFloat(ecoDtInputHp.value) : 5.0;

            // 排气温度
            const T_2a_est_Lp_C = tempDischargeActualLpInput ? parseFloat(tempDischargeActualLpInput.value) : null;
            const T_2a_est_Hp_C = tempDischargeActualHpInput ? parseFloat(tempDischargeActualHpInput.value) : null;

            // 验证输入
            if (isNaN(Te_C) || isNaN(Tc_C) || isNaN(shLp_K) || isNaN(scHp_K) || 
                isNaN(flowLp) || isNaN(flowHp) || isNaN(eta_v_lp) || isNaN(eta_s_lp) || 
                isNaN(eta_v_hp) || isNaN(eta_s_hp)) {
                throw new Error('请输入完整且有效的数值参数。');
            }

            if (flowLp <= 0 || flowHp <= 0 || eta_v_lp <= 0 || eta_s_lp <= 0 || 
                eta_v_hp <= 0 || eta_s_hp <= 0 || shLp_K < 0 || scHp_K < 0) {
                throw new Error('流量和效率必须大于0，过热度/过冷度不能为负。');
            }

            if (Tc_C <= Te_C) {
                throw new Error('冷凝温度必须高于蒸发温度。');
            }

            if (interPressModeValue === 'manual' && (isNaN(interSatTempValue) || interSatTempValue === null)) {
                throw new Error('手动模式下必须指定中间饱和温度。');
            }

            // 确定中间压力
            const T_evap_K = Te_C + 273.15;
            const T_cond_K = Tc_C + 273.15;
            const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', T_evap_K, 'Q', 1, fluid);
            const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', T_cond_K, 'Q', 1, fluid);

            let P_intermediate_Pa, T_intermediate_sat_K;
            if (interPressModeValue === 'auto') {
                P_intermediate_Pa = Math.sqrt(Pe_Pa * Pc_Pa);
                T_intermediate_sat_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0, fluid);
            } else {
                T_intermediate_sat_K = interSatTempValue + 273.15;
                P_intermediate_Pa = CP_INSTANCE.PropsSI('P', 'T', T_intermediate_sat_K, 'Q', 0.5, fluid);
            }

            if (P_intermediate_Pa <= Pe_Pa || P_intermediate_Pa >= Pc_Pa) {
                throw new Error(`无效的中间压力：P_intermediate (${(P_intermediate_Pa/1e5).toFixed(2)} bar) 必须在 P_s 和 P_d 之间`);
            }

            // 先计算冷凝器出口状态（用于ECO计算）
            const T3_K = T_cond_K - scHp_K;
            const h3 = CP_INSTANCE.PropsSI('H', 'T', T3_K, 'P', Pc_Pa, fluid);

            // 计算低压级（带ECO支持）
            const lpStage = computeLowPressureStage({
                fluid,
                Te_C,
                P_intermediate_Pa,
                superheat_K: shLp_K,
                flow_m3h: flowLp,
                eta_v: eta_v_lp,
                eta_s: eta_s_lp,
                T_2a_est_C: T_2a_est_Lp_C,
                isEcoEnabled: isEcoEnabledLp,
                ecoType: ecoTypeLpValue,
                ecoSuperheat_K: ecoSuperheatLpValue,
                ecoDt_K: ecoDtLpValue,
                h3_lp: isEcoEnabledLp ? h3 : null
            });

            // 计算混合状态（用于高压级）
            let h_mix, h_mid_1s;
            if (isEcoEnabledLp && lpStage.m_dot_inj > 0) {
                // 低压级有ECO补气
                h_mid_1s = lpStage.h_mid;
                h_mix = lpStage.h_mix;
            } else {
                // 无ECO，直接使用低压级排气状态
                h_mid_1s = lpStage.h_mid;
                h_mix = lpStage.h2a;
            }

            // 高压级ECO计算（如果启用）
            let h_5_hp = h3, h_6_hp = 0, h_7_hp = h3;
            let m_dot_inj_hp = 0, m_dot_total_hp = lpStage.m_dot;
            
            if (isEcoEnabledHp) {
                if (ecoTypeHpValue === 'flash_tank') {
                    const h_eco_liq = CP_INSTANCE.PropsSI('H', 'T', T_intermediate_sat_K, 'Q', 0, fluid);
                    const h_eco_vap = CP_INSTANCE.PropsSI('H', 'T', T_intermediate_sat_K, 'Q', 1, fluid);
                    h_7_hp = h3;
                    h_6_hp = h_eco_vap;
                    h_5_hp = h_eco_liq;
                    const x_flash = (h_7_hp - h_5_hp) / (h_6_hp - h_5_hp);
                    m_dot_inj_hp = lpStage.m_dot * (x_flash / (1 - x_flash));
                    m_dot_total_hp = lpStage.m_dot + m_dot_inj_hp;
                } else {
                    // Subcooler
                    h_7_hp = h3;
                    const T_inj_K = T_intermediate_sat_K + ecoSuperheatHpValue;
                    h_6_hp = CP_INSTANCE.PropsSI('H', 'T', T_inj_K, 'P', P_intermediate_Pa, fluid);
                    const T_5_K = T_intermediate_sat_K + ecoDtHpValue;
                    h_5_hp = CP_INSTANCE.PropsSI('H', 'T', T_5_K, 'P', Pc_Pa, fluid);
                    const h_diff_main = h3 - h_5_hp;
                    const h_diff_inj = h_6_hp - h_7_hp;
                    if (h_diff_main > 0 && h_diff_inj > 0) {
                        m_dot_inj_hp = (lpStage.m_dot * h_diff_main) / h_diff_inj;
                        m_dot_total_hp = lpStage.m_dot + m_dot_inj_hp;
                    }
                }
                
                // 更新混合状态（高压级补气）
                if (m_dot_inj_hp > 0) {
                    h_mix = (lpStage.m_dot * h_mix + m_dot_inj_hp * h_6_hp) / m_dot_total_hp;
                }
            }

            // 计算高压级
            const hpStage = computeHighPressureStage({
                fluid,
                P_intermediate_Pa,
                Pe_Pa: Pe_Pa, // 传递蒸发压力
                Tc_C,
                superheat_K: shLp_K, // 使用相同的过热度
                subcooling_K: scHp_K,
                flow_m3h: flowHp,
                eta_v: eta_v_hp,
                eta_s: eta_s_hp,
                m_dot_lp: lpStage.m_dot,
                h_mix: h_mix,
                m_dot_total: m_dot_total_hp,
                isEcoEnabled: isEcoEnabledHp,
                ecoType: ecoTypeHpValue,
                h3: h3,
                h5: h_5_hp,
                h6: h_6_hp,
                h7: h_7_hp,
                T_2a_est_C: T_2a_est_Hp_C
            });

            // 计算蒸发制冷量（从低压级入口到高压级节流后）
            // 节流后的点4在蒸发压力下
            const h_evap_out = lpStage.h1;
            const h_evap_in = hpStage.h4; // 点4在蒸发压力下
            const Q_evap_W = lpStage.m_dot * (h_evap_out - h_evap_in);

            // 总功率
            const W_shaft_total_W = lpStage.W_shaft_W + hpStage.W_shaft_W;
            const W_input_total_W = W_shaft_total_W;

            // COP
            const COP_c = Q_evap_W / W_input_total_W;
            const COP_h = hpStage.Q_cond_W / W_input_total_W;

            // 判断是否有ECO（中间冷却器、低压级或高压级）- 需要在状态点表生成之前定义
            const hasEcoInter = isEcoEnabled && m_dot_inj_inter > 0;
            const hasEcoLp = isEcoEnabledLp && lpStage.m_dot_inj > 0;
            const hasEcoHp = isEcoEnabledHp && m_dot_inj_hp > 0;

            // 构造状态点表
            const statePoints = [];
            statePoints.push({
                name: 'LP-1',
                desc: 'Low Press Evap Out',
                temp: (lpStage.T1_K - 273.15).toFixed(1),
                press: (lpStage.Pe_Pa / 1e5).toFixed(2),
                enth: (lpStage.h1 / 1000).toFixed(1),
                flow: lpStage.m_dot.toFixed(4)
            });

            statePoints.push({
                name: 'LP-2',
                desc: 'Low Press Discharge',
                temp: lpStage.T2a_C.toFixed(1),
                press: (P_intermediate_Pa / 1e5).toFixed(2),
                enth: (lpStage.h2a / 1000).toFixed(1),
                flow: lpStage.m_dot.toFixed(4)
            });

            statePoints.push({
                name: 'mix',
                desc: 'After Mixing',
                temp: (T_intermediate_sat_K - 273.15).toFixed(1),
                press: (P_intermediate_Pa / 1e5).toFixed(2),
                enth: (h_mix / 1000).toFixed(1),
                flow: hpStage.m_dot.toFixed(4)
            });

            statePoints.push({
                name: 'HP-1',
                desc: 'High Press Comp In',
                temp: (hpStage.T1_K - 273.15).toFixed(1),
                press: (P_intermediate_Pa / 1e5).toFixed(2),
                enth: (hpStage.h1 / 1000).toFixed(1),
                flow: hpStage.m_dot.toFixed(4)
            });

            statePoints.push({
                name: 'HP-2',
                desc: 'High Press Discharge',
                temp: hpStage.T2a_C.toFixed(1),
                press: (hpStage.Pc_Pa / 1e5).toFixed(2),
                enth: (hpStage.h2a / 1000).toFixed(1),
                flow: hpStage.m_dot.toFixed(4)
            });

            statePoints.push({
                name: '3',
                desc: 'Cond Out',
                temp: (hpStage.T3_K - 273.15).toFixed(1),
                press: (hpStage.Pc_Pa / 1e5).toFixed(2),
                enth: (hpStage.h3 / 1000).toFixed(1),
                flow: hpStage.m_dot.toFixed(4)
            });

            statePoints.push({
                name: '4',
                desc: 'Exp Valve Out (Evap)',
                temp: hpStage.T4_C.toFixed(1),
                press: ((hpStage.h4_pressure || Pe_Pa) / 1e5).toFixed(2),
                enth: (hpStage.h4 / 1000).toFixed(1),
                flow: lpStage.m_dot.toFixed(4)
            });

            // ECO相关状态点 - 高压级ECO
            if (hasEcoHp) {
                // 定义流量变量
                const m_p5_hp = lpStage.m_dot; // 主路流量
                const m_p6_hp = m_dot_inj_hp; // 补气流量
                const m_p7_hp = m_dot_inj_hp; // 补气流量
                
                if (ecoTypeHpValue === 'flash_tank') {
                    const T_7_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0, fluid);
                    const T_6_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 1, fluid);
                    const T_5_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0, fluid);
                    statePoints.push({
                        name: '7',
                        desc: 'Flash In (Valve)',
                        temp: (T_7_K - 273.15).toFixed(1),
                        press: (P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (hpStage.h7 / 1000).toFixed(1),
                        flow: m_p7_hp.toFixed(4)
                    });
                    statePoints.push({
                        name: '6',
                        desc: 'Injection Gas',
                        temp: (T_6_K - 273.15).toFixed(1),
                        press: (P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (hpStage.h6 / 1000).toFixed(1),
                        flow: m_p6_hp.toFixed(4)
                    });
                    statePoints.push({
                        name: '5',
                        desc: 'ECO Liq Out',
                        temp: (T_5_K - 273.15).toFixed(1),
                        press: (P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (hpStage.h5 / 1000).toFixed(1),
                        flow: m_p5_hp.toFixed(4)
                    });
                } else {
                    // Subcooler模式
                    const T_5_K = CP_INSTANCE.PropsSI('T', 'P', hpStage.Pc_Pa, 'H', hpStage.h5, fluid);
                    // 点7：从点3等焓节流到中间压力（h7 = h3）
                    const T_7_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'H', hpStage.h7, fluid);
                    const T_6_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'H', hpStage.h6, fluid);
                    statePoints.push({
                        name: '5',
                        desc: 'Subcooler Out',
                        temp: (T_5_K - 273.15).toFixed(1),
                        press: (hpStage.Pc_Pa / 1e5).toFixed(2),
                        enth: (hpStage.h5 / 1000).toFixed(1),
                        flow: m_p5_hp.toFixed(4)
                    });
                    statePoints.push({
                        name: '7',
                        desc: 'Inj Valve Out (Inter)',
                        temp: (T_7_K - 273.15).toFixed(1),
                        press: (P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (hpStage.h7 / 1000).toFixed(1),
                        flow: m_p7_hp.toFixed(4)
                    });
                    statePoints.push({
                        name: '6',
                        desc: 'Injection Gas',
                        temp: (T_6_K - 273.15).toFixed(1),
                        press: (P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (hpStage.h6 / 1000).toFixed(1),
                        flow: m_p6_hp.toFixed(4)
                    });
                }
            }
            
            // ECO相关状态点 - 低压级ECO
            if (hasEcoLp) {
                const m_p5_lp = lpStage.m_dot_suc; // 主路流量
                const m_p6_lp = lpStage.m_dot_inj; // 补气流量
                const m_p7_lp = lpStage.m_dot_inj; // 补气流量
                
                if (ecoTypeLpValue === 'flash_tank') {
                    const T_7_lp_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0, fluid);
                    const T_6_lp_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 1, fluid);
                    const T_5_lp_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'Q', 0, fluid);
                    statePoints.push({
                        name: '7-LP',
                        desc: 'Flash In (LP)',
                        temp: (T_7_lp_K - 273.15).toFixed(1),
                        press: (P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (lpStage.h7 / 1000).toFixed(1),
                        flow: m_p7_lp.toFixed(4)
                    });
                    statePoints.push({
                        name: '6-LP',
                        desc: 'Injection Gas (LP)',
                        temp: (T_6_lp_K - 273.15).toFixed(1),
                        press: (P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (lpStage.h6 / 1000).toFixed(1),
                        flow: m_p6_lp.toFixed(4)
                    });
                    statePoints.push({
                        name: '5-LP',
                        desc: 'ECO Liq Out (LP)',
                        temp: (T_5_lp_K - 273.15).toFixed(1),
                        press: (P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (lpStage.h5 / 1000).toFixed(1),
                        flow: m_p5_lp.toFixed(4)
                    });
                } else {
                    // Subcooler模式
                    const T_5_lp_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'H', lpStage.h5, fluid);
                    const T_7_lp_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'H', lpStage.h7, fluid);
                    const T_6_lp_K = CP_INSTANCE.PropsSI('T', 'P', P_intermediate_Pa, 'H', lpStage.h6, fluid);
                    statePoints.push({
                        name: '5-LP',
                        desc: 'Subcooler Out (LP)',
                        temp: (T_5_lp_K - 273.15).toFixed(1),
                        press: (P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (lpStage.h5 / 1000).toFixed(1),
                        flow: m_p5_lp.toFixed(4)
                    });
                    statePoints.push({
                        name: '7-LP',
                        desc: 'Inj Valve Out (LP)',
                        temp: (T_7_lp_K - 273.15).toFixed(1),
                        press: (P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (lpStage.h7 / 1000).toFixed(1),
                        flow: m_p7_lp.toFixed(4)
                    });
                    statePoints.push({
                        name: '6-LP',
                        desc: 'Injection Gas (LP)',
                        temp: (T_6_lp_K - 273.15).toFixed(1),
                        press: (P_intermediate_Pa / 1e5).toFixed(2),
                        enth: (lpStage.h6 / 1000).toFixed(1),
                        flow: m_p6_lp.toFixed(4)
                    });
                }
            }

            // 绘制 P-h 图（合并显示）
            const point = (name, h_j, p_pa, pos = 'top') => ({ 
                name, 
                value: [h_j / 1000, p_pa / 1e5], 
                label: { position: pos, show: true } 
            });

            const pt_lp1 = point('LP-1', lpStage.h1, lpStage.Pe_Pa, 'bottom');
            let pt_lp2, pt_mid, pt_mix, pt_hp1, pt_hp2, pt3, pt4, pt5, pt6, pt7;
            let pt5_lp, pt6_lp, pt7_lp; // 低压级ECO点
            let pt5_inter, pt6_inter, pt7_inter; // 中间冷却器ECO点
            
            // hasEcoInter, hasEcoLp 和 hasEcoHp 已在上面定义
            
            if (hasEcoInter || hasEcoLp || hasEcoHp) {
                // ECO模式：需要显示补气和混合过程
                pt_lp2 = point('LP-2', lpStage.h2a, P_intermediate_Pa, 'right');
                pt_mid = point('mid', lpStage.h_mid, P_intermediate_Pa, 'right');
                
                // 中间冷却器ECO点
                if (hasEcoInter) {
                    pt6_inter = point('6-Inter', h_6_inter, P_intermediate_Pa, 'left');
                    if (ecoTypeValue === 'flash_tank') {
                        pt7_inter = point('7-Inter', h_7_inter, P_intermediate_Pa, 'right');
                        pt5_inter = point('5-Inter', h_5_inter, P_intermediate_Pa, 'top');
                    } else {
                        pt7_inter = point('7-Inter', h_7_inter, P_intermediate_Pa, 'bottom');
                        pt5_inter = point('5-Inter', h_5_inter, hpStage.Pc_Pa, 'top');
                    }
                }
                
                // 低压级ECO点
                if (hasEcoLp) {
                    pt6_lp = point('6-LP', lpStage.h6, P_intermediate_Pa, 'left');
                    if (ecoTypeLpValue === 'flash_tank') {
                        pt7_lp = point('7-LP', lpStage.h7, P_intermediate_Pa, 'right');
                        pt5_lp = point('5-LP', lpStage.h5, P_intermediate_Pa, 'top');
                    } else {
                        pt7_lp = point('7-LP', lpStage.h7, P_intermediate_Pa, 'bottom');
                        pt5_lp = point('5-LP', lpStage.h5, P_intermediate_Pa, 'top');
                    }
                }
                
                // 高压级ECO点
                if (hasEcoHp) {
                    pt6 = point('6-HP', hpStage.h6, P_intermediate_Pa, 'left');
                    if (ecoTypeHpValue === 'flash_tank') {
                        pt7 = point('7-HP', hpStage.h7, P_intermediate_Pa, 'right');
                        pt5 = point('5-HP', hpStage.h5, P_intermediate_Pa, 'top');
                    } else {
                        pt7 = point('7-HP', hpStage.h7, P_intermediate_Pa, 'bottom');
                        pt5 = point('5-HP', hpStage.h5, hpStage.Pc_Pa, 'top');
                    }
                }
                
                pt_mix = point('mix', h_mix, P_intermediate_Pa, 'left');
                pt_hp1 = point('HP-1', hpStage.h1, P_intermediate_Pa, 'left');
                pt_hp2 = point('HP-2', hpStage.h2a, hpStage.Pc_Pa, 'top');
                pt3 = point('3', hpStage.h3, hpStage.Pc_Pa, 'top');
                
                // 确定点4（根据启用的ECO类型）
                if (hasEcoInter) {
                    // 中间冷却器模式：点4从点5_inter节流到蒸发压力
                    pt4 = point('4', hpStage.h4, Pe_Pa, 'bottom');
                } else if (hasEcoHp) {
                    // 高压级ECO模式
                    pt4 = point('4', hpStage.h4, Pe_Pa, 'bottom');
                } else {
                    // 只有低压级ECO或没有ECO
                    pt4 = point('4', hpStage.h4, Pe_Pa, 'bottom');
                }
                
                // 构建主循环点
                const pt1_start = pt_lp1;
                const mainPoints = [pt4, pt1_start, pt_lp2];
                if (hasEcoLp) {
                    mainPoints.push(pt_mid);
                }
                mainPoints.push(pt_mix, pt_hp1, pt_hp2, pt3);
                
                // 构建ECO液路和补气路
                const ecoLiquidPoints = [];
                const ecoVaporPoints = [];
                
                // 中间冷却器ECO路径（优先）
                if (hasEcoInter) {
                    if (ecoTypeValue === 'flash_tank') {
                        ecoLiquidPoints.push(pt3, pt7_inter, pt5_inter, pt4);
                        ecoVaporPoints.push(pt7_inter, pt6_inter);
                    } else {
                        ecoLiquidPoints.push(pt3, pt5_inter, pt4);
                        const pt3_clone_inter = point('', hpStage.h3, hpStage.Pc_Pa);
                        ecoVaporPoints.push(pt3_clone_inter, pt7_inter, pt6_inter);
                    }
                }
                
                // 高压级ECO路径（如果没有中间冷却器）
                if (hasEcoHp && !hasEcoInter) {
                    if (ecoTypeHpValue === 'flash_tank') {
                        ecoLiquidPoints.push(pt3, pt7, pt5, pt4);
                        ecoVaporPoints.push(pt7, pt6);
                    } else {
                        ecoLiquidPoints.push(pt3, pt5, pt4);
                        const pt3_clone = point('', hpStage.h3, hpStage.Pc_Pa);
                        ecoVaporPoints.push(pt3_clone, pt7, pt6);
                    }
                }
                
                // 低压级ECO路径（如果有）
                if (hasEcoLp) {
                    // 低压级ECO在蒸发压力到中间压力之间
                    if (ecoTypeLpValue === 'flash_tank') {
                        ecoLiquidPoints.push(pt_lp1, pt7_lp, pt5_lp);
                        ecoVaporPoints.push(pt7_lp, pt6_lp);
                    } else {
                        ecoLiquidPoints.push(pt_lp1, pt5_lp);
                        ecoVaporPoints.push(pt_lp1, pt7_lp, pt6_lp);
                    }
                }
                
                // 绘制P-h图
                const ecoTitle = [];
                if (hasEcoInter) ecoTitle.push('中间冷却器');
                if (hasEcoLp) ecoTitle.push('低压级ECO');
                if (hasEcoHp) ecoTitle.push('高压级ECO');
                
                ['chart-desktop-m6', 'chart-mobile-m6'].forEach(id => {
                    drawPHDiagram(id, {
                        title: `Two-Stage Double Compressor (${fluid})${ecoTitle.length > 0 ? ' [' + ecoTitle.join('+') + ']' : ''}`,
                        mainPoints: mainPoints,
                        ecoLiquidPoints: ecoLiquidPoints,
                        ecoVaporPoints: ecoVaporPoints,
                        xLabel: 'h (kJ/kg)',
                        yLabel: 'P (bar)'
                    });
                });
            } else {
                // 无ECO模式
                pt_lp2 = point('LP-2', lpStage.h2a, P_intermediate_Pa, 'right');
                pt_mix = point('mix', h_mix, P_intermediate_Pa, 'left');
                pt_hp1 = point('HP-1', hpStage.h1, P_intermediate_Pa, 'left');
                pt_hp2 = point('HP-2', hpStage.h2a, hpStage.Pc_Pa, 'top');
                pt3 = point('3', hpStage.h3, hpStage.Pc_Pa, 'top');
                pt4 = point('4', hpStage.h4, Pe_Pa, 'bottom'); // 点4在蒸发压力下

                // 主循环：4 -> LP-1 -> LP-2 -> mix -> HP-1 -> HP-2 -> 3 -> 4
                const mainPoints = [pt4, pt_lp1, pt_lp2, pt_mix, pt_hp1, pt_hp2, pt3, pt4];

                ['chart-desktop-m6', 'chart-mobile-m6'].forEach(id => {
                    drawPHDiagram(id, {
                        title: `Two-Stage Double Compressor (${fluid})`,
                        mainPoints: mainPoints,
                        ecoLiquidPoints: [],
                        ecoVaporPoints: [],
                        xLabel: 'h (kJ/kg)',
                        yLabel: 'P (bar)'
                    });
                });
            }

            // 渲染结果面板
            const html = `
                <div class="grid grid-cols-2 gap-4 mb-6">
                    ${createKpiCard('制冷量', (Q_evap_W / 1000).toFixed(2), 'kW', 'Cooling Capacity', 'blue')}
                    ${createKpiCard('总轴功率', (W_shaft_total_W / 1000).toFixed(2), 'kW', 'Total Shaft Power', 'orange')}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div class="bg-white/60 p-4 rounded-2xl border border-white/50">
                        ${createSectionHeader('Low Pressure Stage', '❄️')}
                        ${createDetailRow('油冷负荷', (lpStage.Q_oil_W / 1000).toFixed(2), 'kW')}
                        ${createDetailRow('Q_evap', `${(Q_evap_W / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('W_shaft_LP', `${(lpStage.W_shaft_W / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('m_dot_LP', `${lpStage.m_dot.toFixed(4)} kg/s`)}
                        ${createDetailRow('T_discharge_LP', `${lpStage.T2a_C.toFixed(1)} °C`)}
                    </div>
                    <div class="bg-white/60 p-4 rounded-2xl border border-white/50">
                        ${createSectionHeader('High Pressure Stage', '🔥')}
                        ${createDetailRow('Q_cond', `${(hpStage.Q_cond_W / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('W_shaft_HP', `${(hpStage.W_shaft_W / 1000).toFixed(2)} kW`)}
                        ${createDetailRow('m_dot_HP', `${hpStage.m_dot.toFixed(4)} kg/s`)}
                        ${createDetailRow('T_discharge_HP', `${hpStage.T2a_C.toFixed(1)} °C`)}
                    </div>
                </div>

                <div class="space-y-1 bg-white/40 p-4 rounded-2xl border border-white/50 shadow-inner">
                    ${createSectionHeader('System Performance', '📈')}
                    ${createDetailRow('COP_c', COP_c.toFixed(3), true)}
                    ${createDetailRow('COP_h', COP_h.toFixed(3))}
                    ${createDetailRow('P_intermediate', `${(P_intermediate_Pa / 1e5).toFixed(2)} bar`)}
                    ${createDetailRow('T_intermediate', `${(T_intermediate_sat_K - 273.15).toFixed(1)} °C`)}
                    ${createSectionHeader('State Points', '📊')}
                    ${createStateTable(statePoints)}
                </div>
            `;

            renderToAllViews(html);

            updateMobileSummary('Q_evap', `${(Q_evap_W / 1000).toFixed(2)} kW`, 'COP', COP_c.toFixed(2));

            openMobileSheet('m6');

            setButtonFresh6();
            if (printButtonM6) printButtonM6.disabled = false;

            lastCalculationData = {
                fluid,
                Te_C,
                Tc_C,
                lpStage,
                hpStage,
                Q_evap_W,
                W_shaft_total_W,
                COP_c
            };

            const inputState = SessionState.collectInputs('calc-form-mode-6');
            HistoryDB.add(
                'M6',
                `${fluid} • ${(Q_evap_W / 1000).toFixed(2)} kW • COP ${COP_c.toFixed(2)}`,
                inputState,
                { 'Q_evap': `${(Q_evap_W / 1000).toFixed(2)} kW`, COP: COP_c.toFixed(2) }
            );
        } catch (error) {
            console.error(error);
            renderToAllViews(createErrorCard(error.message));
            if (printButtonM6) printButtonM6.disabled = true;
        }
    }, 50);
}

function printReportMode6() {
    if (!lastCalculationData) return;
    const d = lastCalculationData;
    const resultDiv = document.querySelector('.print-results');
    let tableText = '\n\nState Points:\n--------------------\nPoint\tT(C)\tP(bar)\th(kJ)\tm(kg/s)\n';
    tableText += `Q_evap\t${(d.Q_evap_W / 1000).toFixed(3)} kW\n`;
    tableText += `W_input\t${(d.W_shaft_total_W / 1000).toFixed(3)} kW\n`;
    tableText += `COP_c\t${d.COP_c.toFixed(3)}\n`;
    resultDiv.innerText = `Two-Stage Double Compressor Report:\n` + tableText;
    window.print();
}

// ---------------------------------------------------------------------
// Compressor Model Selection Handlers
// ---------------------------------------------------------------------

function initCompressorModelSelectorsM6Lp() {
    const brands = getAllBrands();
    compressorBrandLp.innerHTML = '<option value="">-- 选择品牌 --</option>';
    brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        compressorBrandLp.appendChild(option);
    });

    compressorBrandLp.addEventListener('change', () => {
        const brand = compressorBrandLp.value;
        compressorSeriesLp.innerHTML = '<option value="">-- 选择系列 --</option>';
        compressorModelLp.innerHTML = '<option value="">-- 选择型号 --</option>';
        compressorSeriesLp.disabled = !brand;
        compressorModelLp.disabled = true;
        modelDisplacementInfoLp.classList.add('hidden');

        if (brand) {
            const series = getSeriesByBrand(brand);
            series.forEach(s => {
                const option = document.createElement('option');
                option.value = s;
                option.textContent = s;
                compressorSeriesLp.appendChild(option);
            });
            compressorSeriesLp.disabled = false;
        }
    });

    compressorSeriesLp.addEventListener('change', () => {
        const brand = compressorBrandLp.value;
        const series = compressorSeriesLp.value;
        compressorModelLp.innerHTML = '<option value="">-- 选择型号 --</option>';
        compressorModelLp.disabled = !series;
        modelDisplacementInfoLp.classList.add('hidden');

        if (brand && series) {
            const models = getModelsBySeries(brand, series);
            models.forEach(m => {
                const option = document.createElement('option');
                option.value = m.model;
                option.textContent = m.model;
                compressorModelLp.appendChild(option);
            });
            compressorModelLp.disabled = false;
        }
    });

    compressorModelLp.addEventListener('change', () => {
        const brand = compressorBrandLp.value;
        const series = compressorSeriesLp.value;
        const model = compressorModelLp.value;

        if (brand && series && model) {
            const displacement = getDisplacementByModel(brand, series, model);
            if (displacement !== null) {
                modelDisplacementValueLp.textContent = displacement.toFixed(0);
                modelDisplacementInfoLp.classList.remove('hidden');
                
                if (flowLpInput) {
                    flowLpInput.value = displacement.toFixed(2);
                    setButtonStale6();
                }
            } else {
                modelDisplacementInfoLp.classList.add('hidden');
            }
        } else {
            modelDisplacementInfoLp.classList.add('hidden');
        }
    });
}

function initCompressorModelSelectorsM6Hp() {
    const brands = getAllBrands();
    compressorBrandHp.innerHTML = '<option value="">-- 选择品牌 --</option>';
    brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        compressorBrandHp.appendChild(option);
    });

    compressorBrandHp.addEventListener('change', () => {
        const brand = compressorBrandHp.value;
        compressorSeriesHp.innerHTML = '<option value="">-- 选择系列 --</option>';
        compressorModelHp.innerHTML = '<option value="">-- 选择型号 --</option>';
        compressorSeriesHp.disabled = !brand;
        compressorModelHp.disabled = true;
        modelDisplacementInfoHp.classList.add('hidden');

        if (brand) {
            const series = getSeriesByBrand(brand);
            series.forEach(s => {
                const option = document.createElement('option');
                option.value = s;
                option.textContent = s;
                compressorSeriesHp.appendChild(option);
            });
            compressorSeriesHp.disabled = false;
        }
    });

    compressorSeriesHp.addEventListener('change', () => {
        const brand = compressorBrandHp.value;
        const series = compressorSeriesHp.value;
        compressorModelHp.innerHTML = '<option value="">-- 选择型号 --</option>';
        compressorModelHp.disabled = !series;
        modelDisplacementInfoHp.classList.add('hidden');

        if (brand && series) {
            const models = getModelsBySeries(brand, series);
            models.forEach(m => {
                const option = document.createElement('option');
                option.value = m.model;
                option.textContent = m.model;
                compressorModelHp.appendChild(option);
            });
            compressorModelHp.disabled = false;
        }
    });

    compressorModelHp.addEventListener('change', () => {
        const brand = compressorBrandHp.value;
        const series = compressorSeriesHp.value;
        const model = compressorModelHp.value;

        if (brand && series && model) {
            const displacement = getDisplacementByModel(brand, series, model);
            if (displacement !== null) {
                modelDisplacementValueHp.textContent = displacement.toFixed(0);
                modelDisplacementInfoHp.classList.remove('hidden');
                
                if (flowHpInput) {
                    flowHpInput.value = displacement.toFixed(2);
                    setButtonStale6();
                }
            } else {
                modelDisplacementInfoHp.classList.add('hidden');
            }
        } else {
            modelDisplacementInfoHp.classList.add('hidden');
        }
    });
}

// ---------------------------------------------------------------------
// Auto Efficiency Calculation
// ---------------------------------------------------------------------

function updateAndDisplayEfficienciesM6Lp() {
    if (!CP_INSTANCE || !autoEffLpCheckbox || !autoEffLpCheckbox.checked) return;
    
    try {
        const fluid = fluidSelect.value;
        const Te_C = parseFloat(tempEvapInput.value);
        const Tc_C = parseFloat(tempCondInput.value);
        
        if (isNaN(Te_C) || isNaN(Tc_C) || Tc_C <= Te_C) return;
        
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', Te_C + 273.15, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', Tc_C + 273.15, 'Q', 1, fluid);
        const P_intermediate_Pa = Math.sqrt(Pe_Pa * Pc_Pa);
        
        const pressureRatio = P_intermediate_Pa / Pe_Pa;
        const efficiencies = calculateEmpiricalEfficiencies(pressureRatio);
        
        if (etaVLpInput) etaVLpInput.value = efficiencies.eta_v;
        if (etaSLpInput) etaSLpInput.value = efficiencies.eta_s;
        
    } catch (error) {
        console.warn("Auto-Eff M6 LP Error (Ignored):", error.message);
    }
}

function updateAndDisplayEfficienciesM6Hp() {
    if (!CP_INSTANCE || !autoEffHpCheckbox || !autoEffHpCheckbox.checked) return;
    
    try {
        const fluid = fluidSelect.value;
        const Te_C = parseFloat(tempEvapInput.value);
        const Tc_C = parseFloat(tempCondInput.value);
        
        if (isNaN(Te_C) || isNaN(Tc_C) || Tc_C <= Te_C) return;
        
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', Te_C + 273.15, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', Tc_C + 273.15, 'Q', 1, fluid);
        const P_intermediate_Pa = Math.sqrt(Pe_Pa * Pc_Pa);
        
        const pressureRatio = Pc_Pa / P_intermediate_Pa;
        const efficiencies = calculateEmpiricalEfficiencies(pressureRatio);
        
        if (etaVHpInput) etaVHpInput.value = efficiencies.eta_v;
        if (etaSHpInput) etaSHpInput.value = efficiencies.eta_s;
        
    } catch (error) {
        console.warn("Auto-Eff M6 HP Error (Ignored):", error.message);
    }
}

export function triggerMode6EfficiencyUpdate() {
    updateAndDisplayEfficienciesM6Lp();
    updateAndDisplayEfficienciesM6Hp();
}

export function initMode6(CP) {
    CP_INSTANCE = CP;

    calcButtonM6 = document.getElementById('calc-button-mode-6');
    calcFormM6 = document.getElementById('calc-form-mode-6');
    printButtonM6 = document.getElementById('print-button-mode-6');
    resultsDesktopM6 = document.getElementById('results-desktop-m6');
    resultsMobileM6 = document.getElementById('mobile-results-m6');
    summaryMobileM6 = document.getElementById('mobile-summary-m6');

    // 输入元素
    fluidSelect = document.getElementById('fluid_m6');
    fluidInfoDiv = document.getElementById('fluid-info-m6');
    tempEvapInput = document.getElementById('temp_evap_m6');
    tempCondInput = document.getElementById('temp_cond_m6');
    superheatInput = document.getElementById('superheat_m6');
    subcoolInput = document.getElementById('subcooling_m6');
    
    // 低压级
    flowLpInput = document.getElementById('flow_m3h_m6_lp');
    etaVLpInput = document.getElementById('eta_v_m6_lp');
    etaSLpInput = document.getElementById('eta_s_m6_lp');
    autoEffLpCheckbox = document.getElementById('auto-eff-m6-lp');
    compressorBrandLp = document.getElementById('compressor_brand_m6_lp');
    compressorSeriesLp = document.getElementById('compressor_series_m6_lp');
    compressorModelLp = document.getElementById('compressor_model_m6_lp');
    modelDisplacementInfoLp = document.getElementById('model_displacement_info_m6_lp');
    modelDisplacementValueLp = document.getElementById('model_displacement_value_m6_lp');
    tempDischargeActualLpInput = document.getElementById('temp_discharge_actual_m6_lp');
    
    // 高压级
    flowHpInput = document.getElementById('flow_m3h_m6_hp');
    etaVHpInput = document.getElementById('eta_v_m6_hp');
    etaSHpInput = document.getElementById('eta_s_m6_hp');
    autoEffHpCheckbox = document.getElementById('auto-eff-m6-hp');
    compressorBrandHp = document.getElementById('compressor_brand_m6_hp');
    compressorSeriesHp = document.getElementById('compressor_series_m6_hp');
    compressorModelHp = document.getElementById('compressor_model_m6_hp');
    modelDisplacementInfoHp = document.getElementById('model_displacement_info_m6_hp');
    modelDisplacementValueHp = document.getElementById('model_displacement_value_m6_hp');
    tempDischargeActualHpInput = document.getElementById('temp_discharge_actual_m6_hp');
    
    interSatTempInput = document.getElementById('temp_inter_sat_m6');
    
    // ECO设置 - 中间冷却器
    ecoCheckbox = document.getElementById('enable_eco_m6');
    ecoSuperheatInput = document.getElementById('eco_superheat_m6');
    ecoDtInput = document.getElementById('eco_dt_m6');
    
    // ECO设置 - 低压级
    ecoCheckboxLp = document.getElementById('enable_eco_m6_lp');
    ecoSuperheatInputLp = document.getElementById('eco_superheat_m6_lp');
    ecoDtInputLp = document.getElementById('eco_dt_m6_lp');
    
    // ECO设置 - 高压级
    ecoCheckboxHp = document.getElementById('enable_eco_m6_hp');
    ecoSuperheatInputHp = document.getElementById('eco_superheat_m6_hp');
    ecoDtInputHp = document.getElementById('eco_dt_m6_hp');

    // Initialize compressor model selectors
    if (compressorBrandLp && compressorSeriesLp && compressorModelLp) {
        initCompressorModelSelectorsM6Lp();
    }
    if (compressorBrandHp && compressorSeriesHp && compressorModelHp) {
        initCompressorModelSelectorsM6Hp();
    }

    if (calcFormM6) {
        calcFormM6.addEventListener('submit', (e) => {
            e.preventDefault();
            calculateMode6();
        });

        const inputs = calcFormM6.querySelectorAll('input, select');
        inputs.forEach((input) => {
            input.addEventListener('input', setButtonStale6);
            input.addEventListener('change', setButtonStale6);
        });

        if (fluidSelect && fluidInfoDiv) {
            fluidSelect.addEventListener('change', () => {
                updateFluidInfo(fluidSelect, fluidInfoDiv, CP_INSTANCE);
                updateAndDisplayEfficienciesM6Lp();
                updateAndDisplayEfficienciesM6Hp();
            });
        }

        // 自动效率更新监听器
        [tempEvapInput, tempCondInput, autoEffLpCheckbox, autoEffHpCheckbox].forEach(input => {
            if (input) {
                input.addEventListener('change', () => {
                    updateAndDisplayEfficienciesM6Lp();
                    updateAndDisplayEfficienciesM6Hp();
                });
                input.addEventListener('input', () => {
                    if (autoEffLpCheckbox && autoEffLpCheckbox.checked) updateAndDisplayEfficienciesM6Lp();
                    if (autoEffHpCheckbox && autoEffHpCheckbox.checked) updateAndDisplayEfficienciesM6Hp();
                });
            }
        });

        if (autoEffLpCheckbox) {
            autoEffLpCheckbox.addEventListener('change', () => {
                if (autoEffLpCheckbox.checked) {
                    updateAndDisplayEfficienciesM6Lp();
                }
            });
        }
        
        if (autoEffHpCheckbox) {
            autoEffHpCheckbox.addEventListener('change', () => {
                if (autoEffHpCheckbox.checked) {
                    updateAndDisplayEfficienciesM6Hp();
                }
            });
        }

        if (printButtonM6) {
            printButtonM6.addEventListener('click', printReportMode6);
        }

        // ECO toggle 逻辑（已在 ui.js 中处理，这里确保初始化时状态正确）
        // ECO设置已移至ui.js处理，这里不再需要
        
        // 初始化时触发一次效率更新
        setTimeout(() => {
            if (autoEffLpCheckbox && autoEffLpCheckbox.checked) {
                updateAndDisplayEfficienciesM6Lp();
            }
            if (autoEffHpCheckbox && autoEffHpCheckbox.checked) {
                updateAndDisplayEfficienciesM6Hp();
            }
        }, 100);
    }

    console.log('Mode 6 (Two-Stage Double Compressor) initialized.');
}

