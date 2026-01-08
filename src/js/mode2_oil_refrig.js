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
import { calculateEmpiricalEfficiencies, calculateReciprocatingVolumetricEfficiency, calculateEfficiencies } from './efficiency_models.js';
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
    getModelDetail,
    getDischargeTempLimits,
    getDischargeTempLimitsByRefrigerant
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
// Cylinder Head Cooling (缸头冷却)
let cylinderHeadCoolingEnabledM2, cylinderHeadWaterInletTempM2, cylinderHeadWaterOutletTempM2, cylinderHeadQM2;

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

        // 读取总过热度（用于计算吸气温度）
        let total_superheat_K = parseFloat(document.getElementById('superheat_m2')?.value);
        if (isNaN(total_superheat_K) || total_superheat_K < 0) {
            total_superheat_K = 5; // 默认值
        }
        
        // RCC Pro: 使用活塞压缩机容积效率计算
        // 如果总过热=0，使用饱和温度；否则使用 Te_C + total_superheat_K
        const T_suc_K = (total_superheat_K <= 0) ? (Te_C + 273.15) : (Te_C + 273.15 + total_superheat_K);
        
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
        
        // 计算压力比
        const pressureRatio = Pc_Pa / Pe_Pa;
        
        // 获取等熵指数 k (用于半经验公式)
        let k_value = 1.3; // 默认值（氨的典型值）
        try {
            const Cp = CP_INSTANCE.PropsSI('CPMOLAR', 'T', T_suc_K, 'P', Pe_Pa, fluid);
            const Cv = CP_INSTANCE.PropsSI('CVMOLAR', 'T', T_suc_K, 'P', Pe_Pa, fluid);
            if (Cp && Cv && isFinite(Cp) && isFinite(Cv) && Cv > 0) {
                k_value = Cp / Cv;
            }
        } catch (e) {
            console.warn('[Mode2] Failed to get k value from CoolProp, using default 1.3');
        }
        
        // 使用GEA Grasso半经验工程公式计算效率（针对高端压缩机优化）
        // 传递实际的余隙容积值（从压缩机型号或默认值获取）
        const efficiencies = calculateEfficiencies(pressureRatio, k_value, Tc_C, clearance_factor);
        
        if (etaVM2) etaVM2.value = efficiencies.eta_v.toFixed(4);
        if (etaSM2) etaSM2.value = efficiencies.eta_is.toFixed(3);

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
            
            // =========================================================
            // 过热分析：区分有用过热和总过热
            // =========================================================
            // 注意：保留原始值用于判断饱和状态，不要强制改为0.01
            let useful_superheat_K_raw = parseFloat(document.getElementById('useful_superheat_m2')?.value);
            if (isNaN(useful_superheat_K_raw) || useful_superheat_K_raw < 0) useful_superheat_K_raw = 5; // 默认值
            const useful_superheat_K = useful_superheat_K_raw; // 保留原始值，包括0
            
            let total_superheat_K_raw = parseFloat(document.getElementById('superheat_m2').value);
            if (isNaN(total_superheat_K_raw) || total_superheat_K_raw < 0) {
                // 如果总过热未输入或无效，默认等于有用过热
                total_superheat_K_raw = useful_superheat_K_raw;
            }
            // 确保总过热 >= 有用过热（物理约束）
            let total_superheat_K;
            if (total_superheat_K_raw < useful_superheat_K) {
                console.warn('[Mode2] 总过热小于有用过热，已自动调整为等于有用过热');
                total_superheat_K = useful_superheat_K; // 调整为等于有用过热
            } else {
                total_superheat_K = total_superheat_K_raw; // 保留原始值，包括0
            }
            
            // 计算管道过热（使用实际值，包括0）
            const line_superheat_K = total_superheat_K - useful_superheat_K;
            
            let subcooling_K_raw = parseFloat(document.getElementById('subcooling_m2').value);
            if (isNaN(subcooling_K_raw) || subcooling_K_raw < 0) subcooling_K_raw = 5; // 默认值
            const subcooling_K = subcooling_K_raw; // 保留原始值，包括0（0表示饱和状态）
            
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

            // Point 1a: Evaporator Outlet (基于有用过热)
            let T_1a_K, h_1a;
            if (useful_superheat_K <= 0) {
                // 饱和状态：使用干度Q=1计算（更准确）
                T_1a_K = T_evap_K; // 饱和温度
                h_1a = CP_INSTANCE.PropsSI('H', 'P', Pe_Pa, 'Q', 1, fluid);
            } else {
                // 过热状态：使用温度计算
                T_1a_K = T_evap_K + useful_superheat_K;
                h_1a = CP_INSTANCE.PropsSI('H', 'T', T_1a_K, 'P', Pe_Pa, fluid);
            }
            
            // Point 1: Compressor Suction (基于总过热)
            let T_1_K, h_1, rho_1;
            if (total_superheat_K <= 0) {
                // 饱和状态：使用干度Q=1计算（更准确）
                T_1_K = T_evap_K; // 饱和温度
                h_1 = CP_INSTANCE.PropsSI('H', 'P', Pe_Pa, 'Q', 1, fluid);
                rho_1 = CP_INSTANCE.PropsSI('D', 'P', Pe_Pa, 'Q', 1, fluid); // 饱和蒸气密度（较大）
                console.log(`[Mode2 Debug] 总过热=0，使用饱和状态：rho_1=${rho_1.toFixed(3)} kg/m³`);
            } else {
                // 过热状态：使用温度计算
                T_1_K = T_evap_K + total_superheat_K;
                h_1 = CP_INSTANCE.PropsSI('H', 'T', T_1_K, 'P', Pe_Pa, fluid);
                rho_1 = CP_INSTANCE.PropsSI('D', 'T', T_1_K, 'P', Pe_Pa, fluid); // 过热蒸气密度（较小）
                console.log(`[Mode2 Debug] 总过热=${total_superheat_K.toFixed(1)}K，使用过热状态：rho_1=${rho_1.toFixed(3)} kg/m³`);
            }
            
            // Point 3: Condenser Outlet
            let T_3_K, h_3;
            if (subcooling_K <= 0) {
                // 饱和状态：使用干度Q=0计算（更准确）
                T_3_K = T_cond_K; // 饱和温度
                h_3 = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'Q', 0, fluid);
                console.log(`[Mode2 Debug] 过冷度=0，使用饱和状态`);
            } else {
                // 过冷状态：使用温度计算
                T_3_K = T_cond_K - subcooling_K;
                h_3 = CP_INSTANCE.PropsSI('H', 'T', T_3_K, 'P', Pc_Pa, fluid);
            } 

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
                    // 熵值计算：如果总过热=0，使用饱和状态；否则使用温度计算
                    if (total_superheat_K <= 0) {
                        s_suc = CP_INSTANCE.PropsSI('S', 'P', Pe_Pa, 'Q', 1, fluid); // 饱和蒸气熵值
                    } else {
                        s_suc = CP_INSTANCE.PropsSI('S', 'T', T_suc_K, 'P', Pe_Pa, fluid);
                    }
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
            // RCC Pro: 重构功率计算 - 分离等熵效率和机械效率
            // =========================================================
            // Step A: 气体热力学（等熵效率决定气体行为）
            // 单级压缩：从吸气状态等熵压缩到排气压力
            const h_2s = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_suc, fluid);
            
            // 等熵效率（ISENTROPIC_EFF）：决定实际排气焓值和温度
            // 实际排气焓值 = h_suc + (h_2s - h_suc) / η_is
            const h_2a_final = h_suc + (h_2s - h_suc) / eta_s_display;
            const T_2a_final_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h_2a_final, fluid);
            const T_2a_final_C = T_2a_final_K - 273.15;
            
            // 排气温度保护：如果超过 150°C，显示警告
            if (T_2a_final_C > 150) {
                console.warn(`[RCC Pro] 排气温度 ${T_2a_final_C.toFixed(1)}°C 超过 150°C，建议检查输入参数或降低压比`);
            }
            
            // 气体功率（Gas Power）：压缩气体所需的功率
            const P_gas_W = m_dot_suc * (h_2a_final - h_suc);
            
            // Step B: 轴功率计算（机械效率决定摩擦损失）
            // 机械效率（MECHANICAL_EFF）：决定摩擦损失，影响轴功率
            // 轴功率 = 气体功率 / 机械效率
            const MECHANICAL_EFF = 0.95; // 机械效率（基于高能效要求）
            
            if (AppState.currentMode === AppState.MODES.GEOMETRY) {
                // 几何模式：从气体功率计算轴功率
                W_shaft_W = P_gas_W / MECHANICAL_EFF;
            } else {
                // 多项式模式：从轴功率反推等熵效率
                if (W_shaft_W > 0) {
                    // 从轴功率反推气体功率
                    const P_gas_calculated = W_shaft_W * MECHANICAL_EFF;
                    // 从气体功率反推等熵效率
                    const h_2a_calculated = h_suc + P_gas_calculated / m_dot_suc;
                    // 计算等熵效率：η_is = (h_2s - h_suc) / (h_2a - h_suc)
                    const delta_h_ideal = h_2s - h_suc;
                    const delta_h_actual = h_2a_calculated - h_suc;
                    if (delta_h_actual > 0) {
                        eta_s_display = delta_h_ideal / delta_h_actual;
                    }
                }
            }
            
            // Step C: 油冷负荷计算（摩擦热）
            // 摩擦热 = 轴功率 - 气体功率
            // 这是机械损失，必须由油冷系统带走
            const isOilCoolerEnabled = true; // 始终启用，因为摩擦热总是存在
            const Q_oil_W = W_shaft_W - P_gas_W; // 摩擦热 = 轴功率 - 气体功率
            
            // 制冷量计算：使用有用过热度对应的焓值（h_1a）而不是总过热度（h_1）
            // 有用过热计入制冷量，管道过热不计入
            const Q_evap_W = m_dot_suc * (h_1a - h_liq_out); 
            // RCC Pro: 压缩机计算只使用轴功率，不使用输入功率
            // 输入功率 = 轴功率 / 电机效率，但本 app 专注于压缩机性能，只显示轴功率
            
            // =========================================================
            // RCC Pro: 缸头冷却负荷计算（可选/条件性）
            // =========================================================
            // 缸头冷却是可选功能，用于降低排气温度
            // 根据GEA实际情况：冷却负荷约4%轴功率，可降低排气温度约15°C
            let Q_cylinder_head_W = 0;
            let T_2a_after_head_cooling_C = T_2a_final_C; // 缸头冷却后的排气温度
            let cylinderHeadCoolingError = null; // 安全检查错误
            const CYLINDER_HEAD_COOLING_FACTOR = 0.04; // 缸头冷却可带走4%轴功率（根据GEA实际情况）
            const CYLINDER_HEAD_TEMP_REDUCTION = 15; // °C，缸头冷却可降低的排气温度
            // 缸头冷却计算模式：
            // - 'fixed_power': 固定按轴功率百分比带走热量（默认4%）
            // - 'target_dt'  : 优先满足目标温降（默认15°C），由此计算所需负荷（确保能量守恒）
            const CYLINDER_HEAD_COOLING_MODE = 'target_dt';
            
            // 读取缸头冷却配置
            const isCylinderHeadCoolingEnabled = cylinderHeadCoolingEnabledM2?.checked || false;
            
            // 调试信息
            if (isCylinderHeadCoolingEnabled) {
                console.log('[RCC Pro] 缸头冷却已启用');
            }
            
            if (isCylinderHeadCoolingEnabled) {
                // 读取缸头冷却水参数
                const T_head_water_in = parseFloat(cylinderHeadWaterInletTempM2?.value) || 30;
                const T_head_water_out = parseFloat(cylinderHeadWaterOutletTempM2?.value) || 35;
                
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
                    console.error(`[RCC Pro] ${cylinderHeadCoolingError}`);
                    console.log(`[RCC Pro] 缸头冷却参数无效，不启用缸头冷却`);
                    // 如果参数无效，不启用缸头冷却
                    T_2a_after_head_cooling_C = T_2a_final_C; // 保持原始排气温度
                } else if (T_head_water_in < min_head_water_temp) {
                    // 安全检查失败：显示错误
                    cylinderHeadCoolingError = `液击风险！缸头冷却进水温度 (${T_head_water_in.toFixed(1)}°C) 过低。必须 > ${min_head_water_temp.toFixed(1)}°C (蒸发温度 + 10K) 以防止吸气腔结露。`;
                    console.error(`[RCC Pro] ${cylinderHeadCoolingError}`);
                    console.log(`[RCC Pro] 缸头冷却安全检查失败，不启用缸头冷却`);
                    // 如果安全检查失败，不启用缸头冷却
                    T_2a_after_head_cooling_C = T_2a_final_C; // 保持原始排气温度
                } else {
                    // 安全检查通过，计算缸头冷却负荷
                    if (CYLINDER_HEAD_COOLING_MODE === 'target_dt') {
                        // 目标温降模式：根据目标温降计算所需负荷（能量守恒）
                        const T_target_C = Math.max(T_2a_final_C - CYLINDER_HEAD_TEMP_REDUCTION, Te_C + 20);
                        const T_target_K = T_target_C + 273.15;
                        const h_target = CP_INSTANCE.PropsSI('H', 'T', T_target_K, 'P', Pc_Pa, fluid);
                        const delta_h = Math.max(0, h_2a_final - h_target); // J/kg
                        Q_cylinder_head_W = m_dot_suc * delta_h; // J/s = W
                        const implied_factor = W_shaft_W > 0 ? (Q_cylinder_head_W / W_shaft_W) : 0;
                        console.log(`[RCC Pro] 缸头冷却（目标温降模式）:`);
                        console.log(`  目标温降: ${CYLINDER_HEAD_TEMP_REDUCTION} °C, 目标排气温度: ${T_target_C.toFixed(1)} °C`);
                        console.log(`  计算所需负荷: ${(Q_cylinder_head_W/1000).toFixed(2)} kW (约 ${(implied_factor*100).toFixed(1)}% 轴功率)`);
                    } else {
                        // 固定功率模式：按轴功率百分比带走热量
                        Q_cylinder_head_W = W_shaft_W * CYLINDER_HEAD_COOLING_FACTOR;
                        console.log(`[RCC Pro] 缸头冷却（固定功率模式）: 负荷 ${(Q_cylinder_head_W/1000).toFixed(2)} kW (${(CYLINDER_HEAD_COOLING_FACTOR*100).toFixed(0)}% 轴功率)`);
                    }
                    
                    // 注意：实际的温度降低量将在后续根据能量守恒计算（见 h_2a_after_head_cooling 计算）
                }
            } else {
                console.log('[RCC Pro] 缸头冷却未启用');
            }
            
            // 计算缸头冷却后的排气状态（能量守恒）
            let h_2a_after_head_cooling = h_2a_final;
            if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) {
                // 正确的能量守恒：h_2a_after_head_cooling = h_2a_final - (Q_cylinder_head / m_dot)
                const h_reduction_per_kg = Q_cylinder_head_W / m_dot_suc; // J/kg
                h_2a_after_head_cooling = h_2a_final - h_reduction_per_kg;
                
                // 计算实际排气温度降低量
                try {
                    const T_2a_after_head_K = CP_INSTANCE.PropsSI('T', 'H', h_2a_after_head_cooling, 'P', Pc_Pa, fluid);
                    T_2a_after_head_cooling_C = T_2a_after_head_K - 273.15;
                    
                    // 验证能量守恒
                    const h_diff_from_energy = h_2a_final - h_2a_after_head_cooling;
                    const h_diff_expected = Q_cylinder_head_W / m_dot_suc;
                    const temp_reduction_actual = T_2a_final_C - T_2a_after_head_cooling_C;
                    console.log(`[RCC Pro] 缸头冷却能量守恒验证: 焓降=${(h_diff_from_energy/1000).toFixed(1)} kJ/kg (期望=${(h_diff_expected/1000).toFixed(1)} kJ/kg), 实际温降=${temp_reduction_actual.toFixed(1)}°C`);
                } catch (e) {
                    console.warn(`[RCC Pro] 计算缸头冷却后排气温度失败: ${e.message}`);
                    h_2a_after_head_cooling = h_2a_final;
                    // T_2a_after_head_cooling_C 已在前面初始化为 T_2a_final_C，无需重新赋值
                }
            }
            
            // 如果启用了缸头冷却，显示实际的温度降低效果
            if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) {
                const actual_temp_reduction = T_2a_final_C - T_2a_after_head_cooling_C;
                console.log(`[RCC Pro] 缸头冷却效果：`);
                console.log(`  原始排气温度: ${T_2a_final_C.toFixed(1)}°C`);
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
                : T_2a_final_C;
            
            // 优先使用制冷剂类型的限制（主要限制，基于润滑油分解温度）
            const fluidLimits = getDischargeTempLimitsByRefrigerant(fluid);
            
            // 获取压缩机系列的排气温度限制（补充限制，基于硬件设计）
            const brand = compressorBrandM2?.value;
            const series = compressorSeriesM2?.value;
            const seriesLimits = getDischargeTempLimits(brand, series);
            
            // 确定有效的温度限制（取两者中的较小值，或使用系列限制如果是热泵系列）
            const isHeatPumpSeries = series && (
                series.includes('HP') || 
                series.includes('XHP')
            );
            
            let effectiveWarning, effectiveMax;
            if (isHeatPumpSeries && seriesLimits) {
                // 热泵系列：优先使用系列限制（设计用于更高温度工况）
                effectiveWarning = seriesLimits.warning;
                effectiveMax = seriesLimits.trip;
                console.log(`[RCC Pro] 使用热泵系列温度限制: 警告=${effectiveWarning}°C, 最大=${effectiveMax}°C (系列: ${series})`);
            } else {
                // 标准系列：使用更严格的限制（取两者中的较小值）
                effectiveWarning = seriesLimits ? Math.min(fluidLimits.warn, seriesLimits.warning) : fluidLimits.warn;
                effectiveMax = seriesLimits ? Math.min(fluidLimits.max, seriesLimits.trip) : fluidLimits.max;
            }
            
            // 检查排气温度
            if (T_discharge_actual_C > effectiveMax) {
                dischargeTempError = `排气温度 ${T_discharge_actual_C.toFixed(1)}°C 超过最大允许值 ${effectiveMax}°C。必须降低压比或启用缸头冷却。`;
                isOperatingPointInvalid = true;
                console.error(`[RCC Pro] ${dischargeTempError}`);
            } else if (T_discharge_actual_C > effectiveWarning) {
                dischargeTempWarning = `排气温度 ${T_discharge_actual_C.toFixed(1)}°C 超过警告值 ${effectiveWarning}°C，建议检查输入参数或启用缸头冷却。`;
                console.warn(`[RCC Pro] ${dischargeTempWarning}`);
            }
            
            // 如果启用了缸头冷却，在警告/错误信息中显示原始排气温度
            if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0 && T_2a_final_C !== T_2a_after_head_cooling_C) {
                if (dischargeTempError) {
                    dischargeTempError += ` (原始排气温度: ${T_2a_final_C.toFixed(1)}°C，缸头冷却后: ${T_2a_after_head_cooling_C.toFixed(1)}°C)`;
                }
                if (dischargeTempWarning) {
                    dischargeTempWarning += ` (原始排气温度: ${T_2a_final_C.toFixed(1)}°C，缸头冷却后: ${T_2a_after_head_cooling_C.toFixed(1)}°C)`;
                }
            }
            
            // 单级压缩：冷凝器负荷 = 质量流量 × (排气焓 - 冷凝器出口焓)
            // 如果启用缸头冷却，使用修正后的排气焓值
            const h_2_for_cond = (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0)
                ? h_2a_after_head_cooling
                : h_2a_final;
            // 单级压缩：冷凝器负荷 = 质量流量 × (排气焓 - 冷凝器出口焓)
            // 如果启用缸头冷却，使用修正后的排气焓值
            // 注意：如果启用了 SLHX，h_liq_out < h_3，但冷凝器负荷仍应使用 h_3（冷凝器出口）
            const Q_cond_W = m_dot_suc * (h_2_for_cond - h_3);
            
            // =========================================================
            // 总排热量计算：使用能量守恒原理
            // =========================================================
            // 能量守恒：总排热量 = 制冷量 + 轴功率
            // 注意：摩擦热已包含在轴功率中，不应重复计算
            // 总排热量 = 冷凝器排热 + 摩擦热（油冷）+ 缸头冷却排热
            const Q_heating_total_W = Q_evap_W + W_shaft_W;
            
            // 验证：总排热量应该等于各分项之和
            const Q_heating_expected = Q_cond_W + Q_oil_W + Q_cylinder_head_W;
            const balance_error = Math.abs(Q_heating_total_W - Q_heating_expected);
            const balance_error_percent = Q_heating_expected > 0 ? (balance_error / Q_heating_expected) * 100 : 0;
            if (balance_error_percent > 0.1) { // 如果误差超过0.1%，记录警告
                console.warn(`[RCC Pro] 热平衡误差: ${(balance_error/1000).toFixed(2)} kW (${balance_error_percent.toFixed(2)}%)`);
                console.warn(`  总排热量（能量守恒）: ${(Q_heating_total_W/1000).toFixed(2)} kW = 制冷量 ${(Q_evap_W/1000).toFixed(2)} kW + 轴功率 ${(W_shaft_W/1000).toFixed(2)} kW`);
                console.warn(`  总排热量（分项求和）: ${(Q_heating_expected/1000).toFixed(2)} kW = 冷凝器 ${(Q_cond_W/1000).toFixed(2)} kW + 摩擦热 ${(Q_oil_W/1000).toFixed(2)} kW + 缸头冷却 ${(Q_cylinder_head_W/1000).toFixed(2)} kW`);
            }

            // COP 计算：使用轴功率（压缩机性能指标）
            const COP_R = Q_evap_W / W_shaft_W;
            const COP_H = Q_heating_total_W / W_shaft_W;

            // =========================================================
            // SHADOW CALCULATION (Benefit Analysis) - v7.4.2
            // =========================================================
            
            // 1. SLHX Benefit (Current vs No-SLHX)
            let slhxHtml = '';
            let slhxSelection = null;
            if (isSlhxEnabled) {
                const m_dot_base = m_dot_suc * (rho_1 / rho_suc);
                // 基准制冷量也使用有用过热度对应的焓值
                const q_cool_base = m_dot_base * (h_1a - h_liq_in);
                
                // Recalculate base work with original suction state (单级压缩)
                const s_1 = CP_INSTANCE.PropsSI('S', 'H', h_1, 'P', Pe_Pa, fluid);
                const h_2s_base = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_1, fluid);
                const w_ideal_base = m_dot_base * (h_2s_base - h_1);
                const w_shaft_base = w_ideal_base / eta_s_display;

                // 使用轴功率计算基准 COP（压缩机性能指标）
                const q_heat_base = q_cool_base + w_shaft_base;
                const cop_c_base = q_cool_base / w_shaft_base;
                const cop_h_base = q_heat_base / w_shaft_base;

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
            // 如果启用缸头冷却，使用修正后的排气焓值（用于图表显示）
            const h_2_display_chart = (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0)
                ? h_2a_after_head_cooling
                : h_2a_final;
            const pt2 = point('2', h_2_display_chart, Pc_Pa, 'top');
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
            
            // 确定显示用的排气温度和焓值（如果启用缸头冷却，使用修正后的值）
            const T_2_display_C = (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) 
                ? T_2a_after_head_cooling_C 
                : T_2a_final_C;
            const h_2_display_state = (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0)
                ? h_2a_after_head_cooling
                : h_2a_final;
            const desc_2 = (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0)
                ? 'Discharge (After Head Cooling)'
                : 'Discharge';
            
            statePoints.push(
                { name: '2', desc: desc_2, temp: T_2_display_C.toFixed(1), press: (Pc_Pa/1e5).toFixed(2), enth: (h_2_display_state/1000).toFixed(1), flow: m_dot_suc.toFixed(3) },
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
            
            let dischargeTempAlertHtml = '';
            if (dischargeTempError) {
                dischargeTempAlertHtml = `
                    <div class="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded-r-lg">
                        <div class="text-sm font-bold text-red-800">${dischargeTempError}</div>
                    </div>
                `;
            } else if (dischargeTempWarning) {
                dischargeTempAlertHtml = `
                    <div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4 rounded-r-lg">
                        <div class="text-sm font-bold text-yellow-800">${dischargeTempWarning}</div>
                    </div>
                `;
            }
            
            let html = `
                ${cylinderHeadCoolingAlertHtml}
                ${dischargeTempAlertHtml}
                <div class="grid grid-cols-2 gap-4 mb-6">
                    ${createKpiCard(i18next.t('components.coolingCapacity'), (Q_evap_W/1000).toFixed(2), 'kW', `COP: ${COP_R.toFixed(2)}`, 'blue')}
                    ${createKpiCard(i18next.t('components.heatingCapacity'), (Q_heating_total_W/1000).toFixed(2), 'kW', `COP: ${COP_H.toFixed(2)}`, 'orange')}
                </div>
                <div class="space-y-1 bg-white/40 p-4 rounded-2xl border border-white/50 shadow-inner">
                    ${createSectionHeader(i18next.t('components.powerAndEfficiency'))}
                    ${createDetailRow(i18next.t('components.shaftPower'), `${(W_shaft_W/1000).toFixed(2)} kW`, true)}
                    ${createDetailRow('润滑系统摩擦热 (Friction Heat)', `${(Q_oil_W/1000).toFixed(2)} kW (机械损失)`, false)}
                    ${Q_cylinder_head_W > 0 ? createDetailRow('缸头冷却负荷 (Cylinder Head Cooling)', `${(Q_cylinder_head_W/1000).toFixed(2)} kW (低品位排热，温度约30-50°C)`, true) : ''}
                    ${isCylinderHeadCoolingEnabled && Q_cylinder_head_W > 0 ? createDetailRow('缸头冷却后排气温度', `${T_2a_after_head_cooling_C.toFixed(1)} °C (降低 ${(T_2a_final_C - T_2a_after_head_cooling_C).toFixed(1)}°C)`) : ''}
                    ${createDetailRow('Calc Logic', efficiency_info_text)}
                    ${createDetailRow('Volumetric Eff (η_v)', displayEtaV, AppState.currentMode === 'polynomial')}
                    ${createDetailRow('Isentropic Eff (η_s)', displayEtaS, AppState.currentMode === 'polynomial')}
                    
                    ${isVsdEnabled ? createDetailRow('VSD Status', `${currentRpm} RPM / Ratio: ${rpmRatio.toFixed(2)}`) : ''}

                    ${slhxHtml}

                    ${createSectionHeader('过热分析', '🌡️')}
                    <div class="text-xs text-gray-600 space-y-1 mb-3">
                        <div>• <strong>有用过热</strong>: ${useful_superheat_K.toFixed(1)} K (蒸发器内过热，计入制冷量)</div>
                        <div>• <strong>总过热</strong>: ${total_superheat_K.toFixed(1)} K (压缩机吸气口过热)</div>
                        ${line_superheat_K > 0 ? `<div>• <strong>管道过热</strong>: ${line_superheat_K.toFixed(1)} K (管道中获得的过热)</div>` : ''}
                    </div>
                    
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
            lastCalculationData.Q_cylinder_head_W = Q_cylinder_head_W;
            
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
    
    // Cylinder Head Cooling (缸头冷却)
    cylinderHeadCoolingEnabledM2 = document.getElementById('cylinder_head_cooling_enabled_m2');
    cylinderHeadWaterInletTempM2 = document.getElementById('cylinder_head_water_inlet_temp_m2');
    cylinderHeadWaterOutletTempM2 = document.getElementById('cylinder_head_water_outlet_temp_m2');
    cylinderHeadQM2 = document.getElementById('cylinder_head_q_m2');

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
        
        // 添加有用过热度与总过热度输入框的事件监听，以便自动更新效率
        const usefulSuperheatInputM2 = document.getElementById('useful_superheat_m2');
        const superheatInputM2 = document.getElementById('superheat_m2');
        if (usefulSuperheatInputM2) {
            usefulSuperheatInputM2.addEventListener('change', updateAndDisplayEfficienciesM2);
        }
        if (superheatInputM2) {
            superheatInputM2.addEventListener('change', updateAndDisplayEfficienciesM2);
        }

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
        
        // Cylinder Head Cooling toggle
        if (cylinderHeadCoolingEnabledM2) {
            cylinderHeadCoolingEnabledM2.addEventListener('change', () => {
                const isEnabled = cylinderHeadCoolingEnabledM2.checked;
                const settingsDiv = document.getElementById('cylinder-head-cooling-settings-m2');
                const placeholderDiv = document.getElementById('cylinder-head-cooling-placeholder-m2');
                if (settingsDiv) settingsDiv.classList.toggle('hidden', !isEnabled);
                if (placeholderDiv) placeholderDiv.classList.toggle('hidden', isEnabled);
                setButtonStale2();
            });
        }

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