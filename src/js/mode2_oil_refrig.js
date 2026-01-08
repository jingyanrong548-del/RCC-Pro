// =====================================================================
// mode2_oil_refrig.js: 模式一 (制冷热泵单级) - v8.0 单级压缩版本
// 职责: "双核计算" + VSD + SLHX迭代 + 影子计算
// 特点: 
// 1. 单级压缩（不使用经济器ECO）
// 2. 参考mode7（氨热泵）的逻辑，但去掉降低过热器
// 3. 保留SLHX（回热器）功能
// =====================================================================

import { openMobileSheet } from './ui.js';
import { updateFluidInfo } from './coolprop_loader.js';
import { calculateEmpiricalEfficiencies, calculateReciprocatingVolumetricEfficiency } from './efficiency_models.js';
import { 
    createKpiCard, 
    createDetailRow, 
    createSectionHeader, 
    createErrorCard,
    createStateTable,
    createImpactGrid,
    createHeatExchangerSelectionTable,
    createFlashTankSelectionTable
} from './components.js';
import { drawPHDiagram, drawTSDiagram, getChartInstance } from './charts.js';
import { HistoryDB, SessionState } from './storage.js';
import { AppState } from './state.js'; 
import { calculatePoly10, calculatePolyVSD } from './logic/polynomial_models.js';
import { 
    getFilteredBrands,
    getFilteredSeriesByBrand,
    getModelsBySeries, 
    getDisplacementByModel,
    getModelDetail
} from './compressor_models.js';
import i18next from './i18n.js';

let CP_INSTANCE = null;
let lastCalculationData = null; 

// UI References
let calcButtonM2, calcFormM2, printButtonM2, fluidSelectM2, fluidInfoDivM2;
let resultsDesktopM2, resultsMobileM2, summaryMobileM2;
let autoEffCheckboxM2, tempEvapM2, tempCondM2, etaVM2, etaSM2;
// 单级压缩：不使用经济器，移除相关变量
let polyRefRpmInput, polyRefDispInput, vsdCheckboxM2, ratedRpmInputM2, polyCorrectionPanel;
let slhxCheckbox, slhxEffInput;
// Compressor Model Selectors
let compressorBrandM2, compressorSeriesM2, compressorModelM2, modelDisplacementInfoM2, modelDisplacementValueM2;
let flowM3hM2;

// Button States - 使用i18n
const getBtnTextCalculate = () => i18next.t('mode2.calculatePerformance');
const getBtnTextRecalculate = () => i18next.t('common.recalculate');

// ---------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------

function setButtonStale2() {
    if (calcButtonM2 && calcButtonM2.innerText !== getBtnTextRecalculate()) {
        calcButtonM2.innerText = getBtnTextRecalculate();
        calcButtonM2.classList.add('opacity-90', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
        if(printButtonM2) {
            printButtonM2.disabled = true;
            printButtonM2.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
}

function setButtonFresh2() {
    if (calcButtonM2) {
        calcButtonM2.innerText = getBtnTextCalculate();
        calcButtonM2.classList.remove('opacity-90', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
    }
}

function renderToAllViews(htmlContent) {
    if(resultsDesktopM2) resultsDesktopM2.innerHTML = htmlContent;
    if(resultsMobileM2) resultsMobileM2.innerHTML = htmlContent;
}

function updateMobileSummary(kpi1Label, kpi1Value, kpi2Label, kpi2Value) {
    if (!summaryMobileM2) return;
    summaryMobileM2.innerHTML = `
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

function updateAndDisplayEfficienciesM2() {
    if (!CP_INSTANCE || !autoEffCheckboxM2 || !autoEffCheckboxM2.checked) return;
    if (AppState.currentMode !== AppState.MODES.GEOMETRY) return; 

    try {
        const fluid = fluidSelectM2.value;
        const Te_C = parseFloat(tempEvapM2.value);
        const Tc_C = parseFloat(tempCondM2.value);
        if (isNaN(Te_C) || isNaN(Tc_C) || Tc_C <= Te_C) return;
        
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', Te_C + 273.15, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', Tc_C + 273.15, 'Q', 1, fluid);
        
        if (!Pe_Pa || !Pc_Pa) return;

        // RCC Pro: 使用活塞压缩机容积效率计算
        const T_suc_K = Te_C + 273.15 + (parseFloat(document.getElementById('superheat_m2').value) || 5);
        
        // 尝试从选中的压缩机型号获取余隙容积
        let clearance_factor = 0.04; // 默认值
        const brand = compressorBrandM2?.value;
        const series = compressorSeriesM2?.value;
        const model = compressorModelM2?.value;
        if (brand && series && model) {
            const modelDetail = getModelDetail(brand, series, model);
            if (modelDetail && modelDetail.clearance_factor) {
                clearance_factor = modelDetail.clearance_factor;
            }
        }
        
        // 计算活塞压缩机容积效率
        const eta_v = calculateReciprocatingVolumetricEfficiency(
            Pc_Pa,
            Pe_Pa,
            clearance_factor,
            null, // 使用 CoolProp 获取等熵指数
            CP_INSTANCE,
            fluid,
            T_suc_K
        );
        
        // 等熵效率：使用简化的活塞压缩机经验公式
        const pressureRatio = Pc_Pa / Pe_Pa;
        // 活塞压缩机等熵效率通常为 0.70-0.80，随压力比变化
        let eta_s = 0.80 - 0.01 * (pressureRatio - 3.0);
        if (pressureRatio < 3.0) {
            eta_s = 0.80 - 0.005 * (3.0 - pressureRatio);
        }
        eta_s = Math.max(0.65, Math.min(0.85, eta_s));
        
        if (etaVM2) etaVM2.value = eta_v.toFixed(4);
        if (etaSM2) etaSM2.value = eta_s.toFixed(3);

    } catch (error) {
        console.warn("Auto-Eff Error (Ignored):", error.message);
    }
}

// ---------------------------------------------------------------------
// Compressor Model Selection Handlers
// ---------------------------------------------------------------------

function initCompressorModelSelectorsM2() {
    // Populate brand dropdown (Mode 2: 前川只保留N系列，其余品牌保留全部)
    const brands = getFilteredBrands('m2');
    compressorBrandM2.innerHTML = `<option value="">${i18next.t('common.selectBrand')}</option>`;
    brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        compressorBrandM2.appendChild(option);
    });

    // Brand change handler
    compressorBrandM2.addEventListener('change', () => {
        const brand = compressorBrandM2.value;
        compressorSeriesM2.innerHTML = `<option value="">${i18next.t('common.selectSeries')}</option>`;
        compressorModelM2.innerHTML = `<option value="">${i18next.t('common.selectModel')}</option>`;
        compressorSeriesM2.disabled = !brand;
        compressorModelM2.disabled = true;
        modelDisplacementInfoM2.classList.add('hidden');

        if (brand) {
            const series = getFilteredSeriesByBrand('m2', brand);
            series.forEach(s => {
                const option = document.createElement('option');
                option.value = s;
                option.textContent = s;
                compressorSeriesM2.appendChild(option);
            });
            compressorSeriesM2.disabled = false;
        }
    });

    // Series change handler
    compressorSeriesM2.addEventListener('change', () => {
        const brand = compressorBrandM2.value;
        const series = compressorSeriesM2.value;
        compressorModelM2.innerHTML = `<option value="">${i18next.t('common.selectModel')}</option>`;
        compressorModelM2.disabled = !series;
        modelDisplacementInfoM2.classList.add('hidden');

        if (brand && series) {
            const models = getModelsBySeries(brand, series);
            models.forEach(m => {
                const option = document.createElement('option');
                option.value = m.model;
                option.textContent = m.model;
                compressorModelM2.appendChild(option);
            });
            compressorModelM2.disabled = false;
        }
    });

    // Model change handler - Auto-fill displacement and switch to volume mode
    compressorModelM2.addEventListener('change', () => {
        const brand = compressorBrandM2.value;
        const series = compressorSeriesM2.value;
        const model = compressorModelM2.value;

        if (brand && series && model) {
            const detail = getModelDetail(brand, series, model);
            if (detail && detail.displacement !== null && detail.displacement !== undefined) {
                const displacement = detail.displacement;
                modelDisplacementValueM2.textContent = displacement.toFixed(0);
                
                // 对于GEA系列，显示转速范围和理论流量说明
                if (brand === 'GEA Grasso' && detail.rpm_range && Array.isArray(detail.rpm_range) && detail.rpm_range.length === 2) {
                    const [minRpm, maxRpm] = detail.rpm_range;
                    modelDisplacementInfoM2.innerHTML = `
                        <span class="font-bold">理论流量:</span> <span id="model_displacement_value_m2">${displacement.toFixed(0)}</span> m³/h
                        <span class="ml-2 text-xs text-gray-600">(最大转速 ${maxRpm} RPM)</span>
                        <br>
                        <span class="text-xs text-gray-600">转速范围: ${minRpm}-${maxRpm} RPM</span>
                    `;
                } else {
                    modelDisplacementInfoM2.innerHTML = `
                        <span class="font-bold">理论排量:</span> <span id="model_displacement_value_m2">${displacement.toFixed(0)}</span> m³/h
                    `;
                }
                modelDisplacementInfoM2.classList.remove('hidden');
                
                // Automatically switch to volume mode (流量定义)
                const volModeRadio = document.querySelector('input[name="flow_mode_m2"][value="vol"]');
                const rpmModeRadio = document.querySelector('input[name="flow_mode_m2"][value="rpm"]');
                if (volModeRadio && rpmModeRadio) {
                    volModeRadio.checked = true;
                    rpmModeRadio.checked = false;
                    
                    // Trigger change event to update UI
                    volModeRadio.dispatchEvent(new Event('change', { bubbles: true }));
                }
                
                // Auto-fill flow_m3h_m2
                if (flowM3hM2) {
                    flowM3hM2.value = displacement.toFixed(2);
                    setButtonStale2();
                }
            } else {
                modelDisplacementInfoM2.classList.add('hidden');
            }
        } else {
            modelDisplacementInfoM2.classList.add('hidden');
        }
    });

    // Flow mode change handler - Auto-fill when switching to volume mode
    document.querySelectorAll('input[name="flow_mode_m2"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'vol' && compressorModelM2.value) {
                const brand = compressorBrandM2.value;
                const series = compressorSeriesM2.value;
                const model = compressorModelM2.value;
                const displacement = getDisplacementByModel(brand, series, model);
                if (displacement !== null && flowM3hM2) {
                    flowM3hM2.value = displacement.toFixed(2);
                    setButtonStale2();
                }
            }
        });
    });
}

// ---------------------------------------------------------------------
// Saturation Lines Generation
// ---------------------------------------------------------------------

/**
 * 生成 P-h 图的饱和线数据点
 * @param {string} fluid - 工质名称
 * @param {number} Pe_Pa - 蒸发压力 (Pa)
 * @param {number} Pc_Pa - 冷凝压力 (Pa)
 * @param {number} numPoints - 数据点数量
 * @returns {Object} 包含饱和液体线和饱和气体线的 P-h 数据
 */
function generateSaturationLinesPH(fluid, Pe_Pa, Pc_Pa, numPoints = 100) {
    if (!CP_INSTANCE) return { liquidPH: [], vaporPH: [] };
    
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
            const h_liq = CP_INSTANCE.PropsSI('H', 'P', P_Pa, 'Q', 0, fluid);
            
            // 饱和气体线 (Q=1)
            const h_vap = CP_INSTANCE.PropsSI('H', 'P', P_Pa, 'Q', 1, fluid);
            
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

/**
 * 将 P-h 图的点转换为 T-s 图的点
 * @param {string} fluid - 工质名称
 * @param {Array} points - P-h 图的点数组，格式为 { name, value: [h, p], label }
 * @returns {Array} T-s 图的点数组，格式为 { name, value: [s, T], label }
 */
function convertPointsToTS(fluid, points) {
    if (!CP_INSTANCE) return [];
    
    const tsPoints = [];
    
    for (const pt of points) {
        if (!pt || !pt.value) continue;
        
        const [h_kJ, p_bar] = pt.value;
        const h_J = h_kJ * 1000;
        const p_Pa = p_bar * 1e5;
        
        try {
            const s_J = CP_INSTANCE.PropsSI('S', 'H', h_J, 'P', p_Pa, fluid);
            const T_K = CP_INSTANCE.PropsSI('T', 'H', h_J, 'P', p_Pa, fluid);
            const T_C = T_K - 273.15;
            
            // 为 T-s 图智能设置标签位置，避免重叠
            // 根据点的名称和位置决定标签位置
            let labelPos = 'right'; // 默认右侧
            if (pt.name) {
                // 根据点名称设置位置，避免重叠
                if (pt.name === '1' || pt.name === "1'") {
                    labelPos = 'right'; // 蒸发器出口，通常在右侧
                } else if (pt.name === '2') {
                    labelPos = 'top'; // 排气点，通常在顶部
                } else if (pt.name === '3') {
                    labelPos = 'top'; // 冷凝器出口，改为顶部避免与饱和线重叠
                } else if (pt.name === '4') {
                    labelPos = 'bottom'; // 蒸发器入口，通常在底部
                } else if (pt.name === '5' || pt.name === "5'") {
                    labelPos = 'left'; // 膨胀阀入口，通常在左侧
                } else if (pt.name === 'mid' || pt.name === 'mix') {
                    labelPos = 'top'; // 中间点，通常在顶部
                } else if (pt.name === '6' || pt.name === '7') {
                    labelPos = 'right'; // ECO 相关点，通常在右侧
                }
            }
            
            // 保留原有的 label 配置，但更新位置
            // 如果原标签显示（或未设置），则显示标签并设置位置
            const labelConfig = pt.label ? { ...pt.label } : {};
            // 主循环的点（1, 2, 3, 4, 1', 5'等）应该显示标签
            const shouldShow = labelConfig.show !== false;
            if (shouldShow) {
                labelConfig.position = labelPos;
                labelConfig.show = true;
            }
            
            tsPoints.push({
                name: pt.name,
                value: [s_J / 1000, T_C], // [s (kJ/kg·K), T (°C)]
                label: labelConfig
            });
        } catch (e) {
            console.warn(`Failed to convert point ${pt.name} to T-S:`, e);
        }
    }
    
    return tsPoints;
}

// ---------------------------------------------------------------------
// Core Calculation Logic
// ---------------------------------------------------------------------
function calculateMode2() {
    renderToAllViews('<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div></div>');
    ['chart-desktop-m2', 'chart-mobile-m2'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    
    setTimeout(() => {
        try {
            // --- Common Input Reading ---
            const fluid = fluidSelectM2.value;
            const Te_C = parseFloat(document.getElementById('temp_evap_m2').value);
            const Tc_C = parseFloat(document.getElementById('temp_cond_m2').value);
            const superheat_K = parseFloat(document.getElementById('superheat_m2').value);
            const subcooling_K = parseFloat(document.getElementById('subcooling_m2').value);
            const motor_eff = parseFloat(document.getElementById('motor_eff_m2').value);
            
            // VSD Inputs
            const isVsdEnabled = vsdCheckboxM2.checked;
            const ratedRpm = parseFloat(ratedRpmInputM2.value) || 2900;
            const currentRpm = parseFloat(document.getElementById('rpm_m2').value) || 2900;
            const rpmRatio = isVsdEnabled ? (currentRpm / ratedRpm) : 1.0;

            // SLHX Inputs
            const isSlhxEnabled = slhxCheckbox.checked;
            const slhxEff = parseFloat(slhxEffInput.value) || 0.5;

            AppState.updateVSD(isVsdEnabled, ratedRpm, currentRpm);
            AppState.updateSLHX(isSlhxEnabled, slhxEff);

            // 单级压缩：只验证基本温度输入，不使用预估排气温度
            if (isNaN(Te_C) || isNaN(Tc_C) || Tc_C <= Te_C) 
                throw new Error("Invalid Temp Inputs (Cond > Evap).");

            // --- Common Physics (CoolProp SI Units) ---
            const T_evap_K = Te_C + 273.15;
            const T_cond_K = Tc_C + 273.15;
            const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', T_evap_K, 'Q', 1, fluid);
            const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', T_cond_K, 'Q', 1, fluid);

            // Point 1: Evaporator Outlet (Base without SLHX)
            const T_1_K = T_evap_K + superheat_K;
            const h_1 = CP_INSTANCE.PropsSI('H', 'T', T_1_K, 'P', Pe_Pa, fluid);
            // Reference Density at Evap Out (for SLHX shadow comparison)
            const rho_1 = CP_INSTANCE.PropsSI('D', 'T', T_1_K, 'P', Pe_Pa, fluid); 
            
            // Point 3: Condenser Outlet
            const T_3_K = T_cond_K - subcooling_K;
            const h_3 = CP_INSTANCE.PropsSI('H', 'T', T_3_K, 'P', Pc_Pa, fluid); 

            // =========================================================
            // ITERATIVE SOLVER (SLHX & Suction Density)
            // =========================================================
            let T_suc_K = T_1_K;
            let h_suc = h_1;
            let rho_suc = rho_1, s_suc = 0;
            let m_dot_suc = 0, W_shaft_W = 0;
            let h_liq_in = h_3; 
            let h_liq_out = h_3; 
            
            // 单级压缩：不使用经济器
            const isEcoEnabled = false;
            let m_dot_total = 0; 

            let eta_v_display = null, eta_s_display = null;
            let efficiency_info_text = "";

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
                if (AppState.currentMode === AppState.MODES.GEOMETRY) {
                    const flow_mode = document.querySelector('input[name="flow_mode_m2"]:checked').value;
                    const eta_v_input = parseFloat(etaVM2.value);
                    if (isNaN(eta_v_input)) throw new Error("Invalid Volumetric Efficiency.");

                    let V_th_m3_s = 0;
                    if (flow_mode === 'rpm') {
                        // RCC Pro: 基于转速的线性插值计算扫气量
                        const brand = compressorBrandM2?.value;
                        const series = compressorSeriesM2?.value;
                        const model = compressorModelM2?.value;
                        
                        if (brand && series && model) {
                            const modelDetail = getModelDetail(brand, series, model);
                            if (modelDetail && modelDetail.swept_volume_max_m3h && modelDetail.max_rpm) {
                                // 使用线性插值: V_sw = V_sw_max × (n_actual / n_max)
                                const V_sw_max_m3h = modelDetail.swept_volume_max_m3h;
                                const n_max = modelDetail.max_rpm;
                                const V_sw_m3h = V_sw_max_m3h * (currentRpm / n_max);
                                
                                // 验证转速范围
                                if (modelDetail.rpm_range) {
                                    const [rpm_min, rpm_max] = modelDetail.rpm_range;
                                    if (currentRpm < rpm_min || currentRpm > rpm_max) {
                                        console.warn(`[RCC Pro] RPM ${currentRpm} outside allowed range [${rpm_min}, ${rpm_max}]`);
                                    }
                                }
                                
                                V_th_m3_s = V_sw_m3h / 3600.0;
                            } else {
                                // 回退到旧逻辑（如果数据不完整）
                                const disp = parseFloat(document.getElementById('displacement_m2').value);
                                V_th_m3_s = currentRpm * (disp / 1e6) / 60.0;
                            }
                        } else {
                            // 回退到旧逻辑（如果没有选择压缩机型号）
                            const disp = parseFloat(document.getElementById('displacement_m2').value);
                            V_th_m3_s = currentRpm * (disp / 1e6) / 60.0;
                        }
                    } else {
                        const flow_m3h = parseFloat(flowM3hM2.value);
                        V_th_m3_s = flow_m3h / 3600.0;
                    }
                    m_dot_suc = V_th_m3_s * eta_v_input * rho_suc;
                    
                    eta_v_display = eta_v_input;
                    eta_s_display = parseFloat(etaSM2.value); 
                    efficiency_info_text = isVsdEnabled ? `Geo (VSD @ ${currentRpm})` : "Standard Geometry";

                } else {
                    // Polynomial Mode
                    const cInputs = Array.from(document.querySelectorAll('input[name="poly_flow"]')).map(i => i.value);
                    const dInputs = Array.from(document.querySelectorAll('input[name="poly_power"]')).map(i => i.value);
                    const corrInputs = Array.from(document.querySelectorAll('input[name="poly_corr"]')).map(i => i.value);
                    AppState.updateCoeffs('massFlow', cInputs);
                    AppState.updateCoeffs('power', dInputs);
                    AppState.updateCoeffs('correction', corrInputs);

                    let m_poly = calculatePolyVSD(AppState.polynomial.massFlowCoeffs, AppState.polynomial.correctionCoeffs, Te_C, Tc_C, rpmRatio);
                    // Density correction for SLHX: m_dot scales with density vs rated conditions (approx rho_1)
                    m_dot_suc = m_poly * (rho_suc / rho_1); 

                    const P_poly = calculatePolyVSD(AppState.polynomial.powerCoeffs, AppState.polynomial.correctionCoeffs, Te_C, Tc_C, rpmRatio);
                    W_shaft_W = P_poly * 1000;

                    const refRpm = parseFloat(polyRefRpmInput.value) || 2900;
                    const refDisp = parseFloat(polyRefDispInput.value) || 437.5;
                    const V_th_current = (isVsdEnabled ? currentRpm : refRpm) * (refDisp / 1e6) / 60.0;
                    eta_v_display = m_dot_suc / (rho_suc * V_th_current);
                    efficiency_info_text = isVsdEnabled ? "Poly (VSD Corr)" : "Poly-Fit";
                }

                // 3. 单级压缩：不使用经济器，直接使用冷凝器出口液体
                m_dot_total = m_dot_suc;
                h_liq_in = h_3; // Condenser liquid -> SLHX

                // 4. SLHX Loop
                if (isSlhxEnabled) {
                    const P_liq_side = Pc_Pa; // 单级压缩：液侧在冷凝压力
                    const T_liq_in = CP_INSTANCE.PropsSI('T', 'H', h_liq_in, 'P', P_liq_side, fluid);
                    
                    const Cp_liq = CP_INSTANCE.PropsSI('C', 'H', h_liq_in, 'P', P_liq_side, fluid);
                    const Cp_vap = CP_INSTANCE.PropsSI('C', 'H', h_1, 'P', Pe_Pa, fluid);
                    
                    const C_liq = m_dot_suc * Cp_liq;
                    const C_vap = m_dot_suc * Cp_vap;
                    const C_min = Math.min(C_liq, C_vap);
                    
                    const Q_max = C_min * (T_liq_in - T_1_K);
                    const Q_slhx = slhxEff * Q_max;
                    
                    const h_suc_new = h_1 + (Q_slhx / m_dot_suc);
                    const h_liq_out_new = h_liq_in - (Q_slhx / m_dot_suc);
                    
                    const diff = Math.abs(h_suc_new - h_suc);
                    h_suc = h_suc_new;
                    h_liq_out = h_liq_out_new;
                    
                    if (diff < 100) break; // Converged
                } else {
                    h_suc = h_1;
                    h_liq_out = h_liq_in;
                    break; 
                }
            } 

            // =========================================================
            // Work & Finalization - 单级压缩
            // =========================================================
            // 单级压缩：从吸气状态等熵压缩到排气压力
            const h_2s = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_suc, fluid);
            const W_ideal_W = m_dot_suc * (h_2s - h_suc);

            if (AppState.currentMode === AppState.MODES.GEOMETRY) {
                // 单级压缩：只使用轴功率基准
                W_shaft_W = W_ideal_W / eta_s_display;
            } else {
                if (W_shaft_W > 0) eta_s_display = W_ideal_W / W_shaft_W;
            }

            const Q_evap_W = m_dot_suc * (h_1 - h_liq_out); 
            const W_input_W = W_shaft_W / motor_eff;

            // RCC Pro: 活塞压缩机排气温度计算（基于等熵效率，单级压缩）
            // 单级压缩：实际排气焓值 = h_suc + (h_2s - h_suc) / η_is
            const h_2a_final = h_suc + (h_2s - h_suc) / eta_s_display;
            const T_2a_final_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h_2a_final, fluid);
            const T_2a_final_C = T_2a_final_K - 273.15;
            
            // 排气温度保护：如果超过 150°C，显示警告
            if (T_2a_final_C > 150) {
                console.warn(`[RCC Pro] 排气温度 ${T_2a_final_C.toFixed(1)}°C 超过 150°C，建议检查输入参数或降低压比`);
            }
            
            // 活塞压缩机无油冷，Q_oil_W = 0
            const Q_oil_W = 0;
            // 单级压缩：冷凝器负荷 = 质量流量 × (排气焓 - 冷凝器出口焓)
            const Q_cond_W = m_dot_suc * (h_2a_final - h_3);
            const Q_heating_total_W = Q_cond_W;

            const COP_R = Q_evap_W / W_input_W;
            const COP_H = Q_heating_total_W / W_input_W;

            // =========================================================
            // SHADOW CALCULATION (Benefit Analysis) - v7.4.2
            // =========================================================
            
            // 1. SLHX Benefit (Current vs No-SLHX)
            let slhxHtml = '';
            let slhxSelection = null;
            if (isSlhxEnabled) {
                const m_dot_base = m_dot_suc * (rho_1 / rho_suc);
                const q_cool_base = m_dot_base * (h_1 - h_liq_in);
                
                // Recalculate base work with original suction state (单级压缩)
                const s_1 = CP_INSTANCE.PropsSI('S', 'H', h_1, 'P', Pe_Pa, fluid);
                const h_2s_base = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_1, fluid);
                const w_ideal_base = m_dot_base * (h_2s_base - h_1);
                const w_shaft_base = w_ideal_base / eta_s_display;

                const w_in_base = w_shaft_base / motor_eff;
                const q_heat_base = q_cool_base + w_shaft_base;
                const cop_c_base = q_cool_base / w_in_base;
                const cop_h_base = q_heat_base / w_in_base;

                const slhxData = {
                    Qc: { val: (Q_evap_W/1000).toFixed(2), diff: ((Q_evap_W - q_cool_base)/q_cool_base)*100 },
                    Qh: { val: (Q_heating_total_W/1000).toFixed(2), diff: ((Q_heating_total_W - q_heat_base)/q_heat_base)*100 },
                    COPc: { val: COP_R.toFixed(2), diff: ((COP_R - cop_c_base)/cop_c_base)*100 },
                    COPh: { val: COP_H.toFixed(2), diff: ((COP_H - cop_h_base)/cop_h_base)*100 }
                };

                // 计算回热器选型参数
                // 单级压缩：液侧在冷凝压力
                const P_liq_side = Pc_Pa;
                const T_liq_in = CP_INSTANCE.PropsSI('T', 'H', h_liq_in, 'P', P_liq_side, fluid) - 273.15;
                const T_liq_out = CP_INSTANCE.PropsSI('T', 'H', h_liq_out, 'P', P_liq_side, fluid) - 273.15;
                const T_vap_in = T_1_K - 273.15;
                const T_vap_out = T_suc_K - 273.15;
                
                const Cp_liq = CP_INSTANCE.PropsSI('C', 'H', h_liq_in, 'P', P_liq_side, fluid);
                const Cp_vap = CP_INSTANCE.PropsSI('C', 'H', h_1, 'P', Pe_Pa, fluid);
                const C_liq = m_dot_suc * Cp_liq;
                const C_vap = m_dot_suc * Cp_vap;
                const C_min = Math.min(C_liq, C_vap);
                const Q_max = C_min * (T_liq_in - T_vap_in);
                const Q_slhx = slhxEff * Q_max;
                slhxSelection = {
                    hot_side: {
                        inlet: {
                            T_C: T_liq_in,
                            P_bar: P_liq_side / 1e5,
                            h_kJ: h_liq_in / 1000,
                            m_dot: m_dot_suc
                        },
                        outlet: {
                            T_C: T_liq_out,
                            P_bar: P_liq_side / 1e5,
                            h_kJ: h_liq_out / 1000,
                            m_dot: m_dot_suc
                        },
                        Q_kW: Q_slhx / 1000
                    },
                    cold_side: {
                        inlet: {
                            T_C: T_vap_in,
                            P_bar: Pe_Pa / 1e5,
                            h_kJ: h_1 / 1000,
                            m_dot: m_dot_suc
                        },
                        outlet: {
                            T_C: T_vap_out,
                            P_bar: Pe_Pa / 1e5,
                            h_kJ: h_suc / 1000,
                            m_dot: m_dot_suc
                        },
                        Q_kW: Q_slhx / 1000
                    }
                };

                slhxHtml = `
                    ${createSectionHeader('SLHX Benefit', '🔥')}
                    ${createImpactGrid(slhxData, 'orange')}
                    ${createDetailRow('Suction Temp Rise', `+${(T_suc_K - T_1_K).toFixed(1)} K`)}
                `;
            }

            // 2. 单级压缩：不使用经济器，无需ECO Benefit计算

            // --- Chart ---
            const point = (name, h_j, p_pa, pos='top') => ({ name, value: [h_j/1000, p_pa/1e5], label: { position: pos, show: true } });
            
            const pt1 = point('1', h_1, Pe_Pa, 'bottom');
            const pt1_p = point("1'", h_suc, Pe_Pa, 'bottom'); 
            const pt2 = point('2', h_2a_final, Pc_Pa, 'top');
            const pt3 = point('3', h_3, Pc_Pa, 'top');
            const pt4 = point('4', h_liq_out, Pe_Pa, 'bottom'); 
            
            // 单级压缩：点5'的压力在冷凝压力
            const pt5_p = isSlhxEnabled ? point("5'", h_liq_out, Pc_Pa, 'top') : null;
            
            let mainPoints = [], ecoLiquidPoints = [], ecoVaporPoints = [];

            // 单级压缩：不使用经济器
            if (isSlhxEnabled) {
                mainPoints = [pt1, pt1_p, pt2, pt3, pt5_p, pt4, pt1];
            } else {
                mainPoints = [pt1, pt2, pt3, pt4, pt1];
            }

            // 生成饱和线数据
            const satLinesPH = generateSaturationLinesPH(fluid, Pe_Pa, Pc_Pa);
            const satLinesTS = generateSaturationLinesTS(fluid, Te_C, Tc_C);
            
            // 生成 T-s 图数据点
            const mainPointsTS = convertPointsToTS(fluid, mainPoints);
            const ecoLiquidPointsTS = convertPointsToTS(fluid, ecoLiquidPoints);
            const ecoVaporPointsTS = convertPointsToTS(fluid, ecoVaporPoints);
            
            // 保存图表数据以便切换
            lastCalculationData = lastCalculationData || {};
            lastCalculationData.chartData = {
                chartType: 'ph', // 默认显示 P-h 图
                fluid,
                mainPoints,
                ecoLiquidPoints: [], // 单级压缩：无经济器液路
                ecoVaporPoints: [], // 单级压缩：无经济器气路
                mainPointsTS,
                ecoLiquidPointsTS: [],
                ecoVaporPointsTS: [],
                satLinesPH,
                satLinesTS,
                isSlhxEnabled,
                isEcoEnabled: false // 单级压缩：不使用经济器
            };
            
            // 绘制 P-h 图（默认）
            ['chart-desktop-m2', 'chart-mobile-m2'].forEach(id => {
                drawPHDiagram(id, {
                    title: `P-h Diagram (${fluid}) [${isSlhxEnabled?'SLHX+':''}]`,
                    mainPoints, 
                    ecoLiquidPoints: [], // 单级压缩：无经济器
                    ecoVaporPoints: [], // 单级压缩：无经济器
                    saturationLiquidPoints: satLinesPH.liquidPH,
                    saturationVaporPoints: satLinesPH.vaporPH,
                    xLabel: 'Enthalpy (kJ/kg)', 
                    yLabel: 'Pressure (bar)'
                });
            });

            // --- HTML Table ---
            // 单级压缩：不使用经济器
            const statePoints = [
                { name: '1', desc: 'Evap Out', temp: Te_C.toFixed(1), press: (Pe_Pa/1e5).toFixed(2), enth: (h_1/1000).toFixed(1), flow: m_dot_suc.toFixed(3) },
            ];
            if (isSlhxEnabled) {
                statePoints.push({ name: "1'", desc: 'Comp In (SLHX)', temp: (T_suc_K-273.15).toFixed(1), press: (Pe_Pa/1e5).toFixed(2), enth: (h_suc/1000).toFixed(1), flow: m_dot_suc.toFixed(3) });
            }
            
            statePoints.push(
                { name: '2', desc: 'Discharge', temp: T_2a_final_C.toFixed(1), press: (Pc_Pa/1e5).toFixed(2), enth: (h_2a_final/1000).toFixed(1), flow: m_dot_suc.toFixed(3) },
                { name: '3', desc: 'Cond Out', temp: (T_3_K-273.15).toFixed(1), press: (Pc_Pa/1e5).toFixed(2), enth: (h_3/1000).toFixed(1), flow: m_dot_suc.toFixed(3) }
            );
            
            if (isSlhxEnabled) {
                statePoints.push({ 
                    name: "5'", 
                    desc: 'Exp Valve In', 
                    temp: (CP_INSTANCE.PropsSI('T','H',h_liq_out,'P',Pc_Pa,fluid)-273.15).toFixed(1), 
                    press: (Pc_Pa/1e5).toFixed(2), 
                    enth: (h_liq_out/1000).toFixed(1), 
                    flow: m_dot_suc.toFixed(3) 
                });
            }

            statePoints.push(
                { name: '4', desc: 'Evap In', temp: (CP_INSTANCE.PropsSI('T','P',Pe_Pa,'H',h_liq_out,fluid)-273.15).toFixed(1), press: (Pe_Pa/1e5).toFixed(2), enth: (h_liq_out/1000).toFixed(1), flow: m_dot_suc.toFixed(3) }
            );

            // Render
            const displayEtaV = eta_v_display !== null ? eta_v_display.toFixed(3) : "---";
            const displayEtaS = eta_s_display !== null ? eta_s_display.toFixed(3) : "---";

            let html = `
                <div class="grid grid-cols-2 gap-4 mb-6">
                    ${createKpiCard(i18next.t('components.coolingCapacity'), (Q_evap_W/1000).toFixed(2), 'kW', `COP: ${COP_R.toFixed(2)}`, 'blue')}
                    ${createKpiCard(i18next.t('components.heatingCapacity'), (Q_heating_total_W/1000).toFixed(2), 'kW', `COP: ${COP_H.toFixed(2)}`, 'orange')}
                </div>
                <div class="space-y-1 bg-white/40 p-4 rounded-2xl border border-white/50 shadow-inner">
                    ${createSectionHeader(i18next.t('components.powerAndEfficiency'))}
                    ${createDetailRow(i18next.t('mode2.inputPower'), `${(W_input_W/1000).toFixed(2)} kW`, true)}
                    ${createDetailRow(i18next.t('components.shaftPower'), `${(W_shaft_W/1000).toFixed(2)} kW`)}
                    ${createDetailRow('Oil Load', `${(Q_oil_W/1000).toFixed(2)} kW`)}
                    ${createDetailRow('Calc Logic', efficiency_info_text)}
                    ${createDetailRow('Volumetric Eff (η_v)', displayEtaV, AppState.currentMode === 'polynomial')}
                    ${createDetailRow('Isentropic Eff (η_s)', displayEtaS, AppState.currentMode === 'polynomial')}
                    
                    ${isVsdEnabled ? createDetailRow('VSD Status', `${currentRpm} RPM / Ratio: ${rpmRatio.toFixed(2)}`) : ''}

                    ${slhxHtml}

                    ${createSectionHeader('State Points Detail', '📊')}
                    ${createStateTable(statePoints)}
                    
                    ${slhxSelection ? createHeatExchangerSelectionTable(slhxSelection, i18next.t('components.slhxSelection'), '🔥') : ''}
                </div>
            `;

            renderToAllViews(html);
            updateMobileSummary(i18next.t('mode2.coolingCapacity'), `${(Q_evap_W/1000).toFixed(1)} kW`, 'COP', COP_R.toFixed(2));
            openMobileSheet('m2');
            
            setButtonFresh2();
            if(printButtonM2) printButtonM2.disabled = false;

            // 更新 lastCalculationData，保留图表数据
            lastCalculationData.fluid = fluid;
            lastCalculationData.statePoints = statePoints;
            lastCalculationData.COP_R = COP_R;
            lastCalculationData.COP_H = COP_H;
            lastCalculationData.Q_evap_W = Q_evap_W;
            lastCalculationData.Q_cond_W = Q_cond_W;
            lastCalculationData.Q_oil_W = Q_oil_W;
            
            AppState.updateVSD(isVsdEnabled, ratedRpm, currentRpm);
            AppState.updateSLHX(isSlhxEnabled, slhxEff);
            const inputState = SessionState.collectInputs('calc-form-mode-2');
            HistoryDB.add('M2', `${fluid} • ${(Q_evap_W/1000).toFixed(1)} kW`, inputState, { 'COP': COP_R.toFixed(2) });

        } catch (error) {
            renderToAllViews(createErrorCard(error.message));
            console.error(error);
            if(printButtonM2) printButtonM2.disabled = true;
        }
    }, 50);
}

// ... Init & Exports
export function initMode2(CP) {
    CP_INSTANCE = CP;
    calcButtonM2 = document.getElementById('calc-button-mode-2');
    calcFormM2 = document.getElementById('calc-form-mode-2');
    printButtonM2 = document.getElementById('print-button-mode-2');
    fluidSelectM2 = document.getElementById('fluid_m2');
    fluidInfoDivM2 = document.getElementById('fluid-info-m2');
    // 单级压缩：不使用预估排气温度输入
    resultsDesktopM2 = document.getElementById('results-desktop-m2');
    resultsMobileM2 = document.getElementById('mobile-results-m2');
    summaryMobileM2 = document.getElementById('mobile-summary-m2');
    autoEffCheckboxM2 = document.getElementById('auto-eff-m2');
    tempEvapM2 = document.getElementById('temp_evap_m2');
    tempCondM2 = document.getElementById('temp_cond_m2');
    etaVM2 = document.getElementById('eta_v_m2');
    etaSM2 = document.getElementById('eta_s_m2');
    // 单级压缩：不使用经济器，移除相关UI引用 
    
    // VSD / Poly Inputs
    polyRefRpmInput = document.getElementById('poly_ref_rpm');
    polyRefDispInput = document.getElementById('poly_ref_disp');
    vsdCheckboxM2 = document.getElementById('enable_vsd_m2');
    ratedRpmInputM2 = document.getElementById('rated_rpm_m2');
    polyCorrectionPanel = document.getElementById('poly-correction-panel');

    // SLHX
    slhxCheckbox = document.getElementById('enable_slhx_m2');
    slhxEffInput = document.getElementById('slhx_effectiveness_m2');

    // Compressor Model Selectors
    compressorBrandM2 = document.getElementById('compressor_brand_m2');
    compressorSeriesM2 = document.getElementById('compressor_series_m2');
    compressorModelM2 = document.getElementById('compressor_model_m2');
    modelDisplacementInfoM2 = document.getElementById('model_displacement_info_m2');
    modelDisplacementValueM2 = document.getElementById('model_displacement_value_m2');
    flowM3hM2 = document.getElementById('flow_m3h_m2');

    // Initialize compressor model selectors
    if (compressorBrandM2 && compressorSeriesM2 && compressorModelM2) {
        initCompressorModelSelectorsM2();
    }

    if (calcFormM2) {
        calcFormM2.addEventListener('submit', (e) => { e.preventDefault(); calculateMode2(); });
        
        calcFormM2.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('input', setButtonStale2);
            input.addEventListener('change', setButtonStale2);
        });

        fluidSelectM2.addEventListener('change', () => updateFluidInfo(fluidSelectM2, fluidInfoDivM2, CP_INSTANCE));
        
        [tempEvapM2, tempCondM2, autoEffCheckboxM2].forEach(el => {
            if(el) el.addEventListener('change', updateAndDisplayEfficienciesM2);
        });

        if (vsdCheckboxM2) {
            vsdCheckboxM2.addEventListener('change', () => {
                const isVSD = vsdCheckboxM2.checked;
                const vsdInputs = document.getElementById('vsd-inputs-m2');
                if (vsdInputs) vsdInputs.classList.toggle('hidden', !isVSD);
                if (polyCorrectionPanel && AppState.currentMode === AppState.MODES.POLYNIAL) {
                    polyCorrectionPanel.classList.toggle('hidden', !isVSD);
                }
                setButtonStale2();
            });
        }

        document.querySelectorAll('input[name="model_select_m2"]').forEach(radio => {
            radio.addEventListener('change', () => {
                if (polyCorrectionPanel && vsdCheckboxM2.checked) {
                    polyCorrectionPanel.classList.toggle('hidden', radio.value !== 'polynomial');
                }
            });
        });

        if (printButtonM2) printButtonM2.addEventListener('click', printReportMode2);
        
        // 绑定图表切换按钮
        const toggleBtn = document.getElementById('chart-toggle-m2');
        const toggleBtnMobile = document.getElementById('chart-toggle-m2-mobile');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', toggleChartTypeM2);
        }
        if (toggleBtnMobile) {
            toggleBtnMobile.addEventListener('click', toggleChartTypeM2);
        }
    }
    console.log("Mode 2 (v7.4.4 Fix) initialized.");
}

function printReportMode2() {
    if (!lastCalculationData) return;
    const d = lastCalculationData;
    const resultDiv = document.querySelector('.print-results');
    let tableText = "\n\nState Points:\n----------------------------------------\nPoint\tT(C)\tP(bar)\th(kJ)\tm(kg/s)\n";
    d.statePoints.forEach(p => { tableText += `${p.name}\t${p.temp}\t${p.press}\t${p.enth}\t${p.flow}\n`; });
    resultDiv.innerText = `Full report generated at ${new Date().toLocaleString()}` + tableText;
    window.print();
}

// 图表切换函数
function toggleChartTypeM2() {
    if (!lastCalculationData || !lastCalculationData.chartData) return;
    
    const chartData = lastCalculationData.chartData;
    const currentType = chartData.chartType;
    const newType = currentType === 'ph' ? 'ts' : 'ph';
    chartData.chartType = newType;
    
    // 确保图表容器可见
    ['chart-desktop-m2', 'chart-mobile-m2'].forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.classList.remove('hidden');
        }
    });
    
    if (newType === 'ph') {
        // 切换到 P-h 图
        ['chart-desktop-m2', 'chart-mobile-m2'].forEach(id => {
            // 清除旧图表配置
            const chart = getChartInstance(id);
            if (chart) {
                chart.clear();
            }
            
            drawPHDiagram(id, {
                title: `P-h Diagram (${chartData.fluid}) [${chartData.isSlhxEnabled?'SLHX+':''}]`,
                mainPoints: chartData.mainPoints,
                ecoLiquidPoints: [], // 单级压缩：无经济器
                ecoVaporPoints: [], // 单级压缩：无经济器
                saturationLiquidPoints: chartData.satLinesPH.liquidPH,
                saturationVaporPoints: chartData.satLinesPH.vaporPH,
                xLabel: 'Enthalpy (kJ/kg)',
                yLabel: 'Pressure (bar)'
            });
        });
    } else {
        // 切换到 T-S 图
        ['chart-desktop-m2', 'chart-mobile-m2'].forEach(id => {
            // 清除旧图表配置
            const chart = getChartInstance(id);
            if (chart) {
                chart.clear();
            }
            
            drawTSDiagram(id, {
                title: `T-s Diagram (${chartData.fluid}) [${chartData.isSlhxEnabled?'SLHX+':''}]`,
                mainPoints: chartData.mainPointsTS,
                ecoLiquidPoints: [], // 单级压缩：无经济器
                ecoVaporPoints: [], // 单级压缩：无经济器
                saturationLiquidPoints: chartData.satLinesTS.liquid,
                saturationVaporPoints: chartData.satLinesTS.vapor,
                xLabel: 'Entropy (kJ/kg·K)',
                yLabel: 'Temperature (°C)'
            });
        });
    }
    
    // 更新按钮文本
    const toggleBtn = document.getElementById('chart-toggle-m2');
    const toggleBtnMobile = document.getElementById('chart-toggle-m2-mobile');
    if (toggleBtn) {
        toggleBtn.textContent = newType === 'ph' ? i18next.t('ui.switchToTS') : i18next.t('ui.switchToPH');
    }
    if (toggleBtnMobile) {
        toggleBtnMobile.textContent = newType === 'ph' ? i18next.t('ui.switchToTS') : i18next.t('ui.switchToPH');
    }
}

export function triggerMode2EfficiencyUpdate() {
    if (autoEffCheckboxM2 && autoEffCheckboxM2.checked) updateAndDisplayEfficienciesM2();
}