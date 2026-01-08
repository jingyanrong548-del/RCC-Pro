// =====================================================================
// mode7_ammonia_heatpump.js: 氨热泵模式 - 完全借鉴制冷热泵单级
// 职责: “双核计算” + VSD + 影子计算
// 特点: 制冷剂固定为氨 (R717)
// =====================================================================

import { openMobileSheet } from './ui.js';
import { updateFluidInfo } from './coolprop_loader.js';
import { calculateReciprocatingVolumetricEfficiency, calculateEfficiencies } from './efficiency_models.js';
import { 
    createKpiCard, 
    createDetailRow, 
    createSectionHeader, 
    createErrorCard,
    createStateTable
} from './components.js';
import { drawPHDiagram, drawTSDiagram, getChartInstance, drawSystemDiagramM7 } from './charts.js';
import { HistoryDB, SessionState } from './storage.js';
import { AppState } from './state.js';
import i18next from './i18n.js'; 
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

let CP_INSTANCE = null;
let lastCalculationData = null; 

// UI References
let calcButtonM7, calcFormM7, printButtonM7, fluidSelectM7, fluidInfoDivM7;
let resultsDesktopM7, resultsMobileM7, summaryMobileM7;
let autoEffCheckboxM7, tempEvapM7, tempCondM7, etaVM7, etaSM7;
let polyRefRpmInputM7, polyRefDispInputM7, vsdCheckboxM7, ratedRpmInputM7, polyCorrectionPanelM7;
// Compressor Model Selectors
let compressorBrandM7, compressorSeriesM7, compressorModelM7, modelDisplacementInfoM7, modelDisplacementValueM7;
let flowM3hM7;
// Water Circuit Heat Exchangers
let waterInletTempM7, waterOutletTempM7, waterFlowDisplayM7;
let subcoolerEnabledM7, subcoolerApproachTempM7, subcoolerQM7, subcoolerWaterOutM7;
let oilCoolerApproachTempM7, oilCoolerQM7, oilCoolerWaterOutM7;
let condenserEnabledM7, condenserApproachTempM7, condenserQM7, condenserWaterOutM7;
let desuperheaterEnabledM7, desuperheaterApproachTempM7, desuperheaterTargetTempM7, desuperheaterQM7, desuperheaterWaterOutM7;
let cylinderHeadCoolingEnabledM7, cylinderHeadWaterInletTempM7, cylinderHeadWaterOutletTempM7, cylinderHeadQM7;

// Button States
const getBtnTextCalculate = () => i18next.t('mode2.calculatePerformance');
const getBtnTextRecalculate = () => i18next.t('common.recalculate');

// ---------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------

function setButtonStale7() {
    if (calcButtonM7 && calcButtonM7.innerText !== getBtnTextRecalculate()) {
        calcButtonM7.innerText = getBtnTextRecalculate();
        calcButtonM7.classList.add('opacity-90', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
        if(printButtonM7) {
            printButtonM7.disabled = true;
            printButtonM7.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
}

function setButtonFresh7() {
    if (calcButtonM7) {
        calcButtonM7.innerText = getBtnTextCalculate();
        calcButtonM7.classList.remove('opacity-90', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
    }
}

function renderToAllViews(htmlContent) {
    if(resultsDesktopM7) {
        resultsDesktopM7.innerHTML = htmlContent;
    }
    if(resultsMobileM7) {
        resultsMobileM7.innerHTML = htmlContent;
    }
}

function updateMobileSummary(kpi1Label, kpi1Value, kpi2Label, kpi2Value) {
    if (!summaryMobileM7) return;
    summaryMobileM7.innerHTML = `
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

function updateAndDisplayEfficienciesM7() {
    if (!CP_INSTANCE || !autoEffCheckboxM7 || !autoEffCheckboxM7.checked) return;
    if (AppState.currentMode !== AppState.MODES.GEOMETRY) return; 

    try {
        const fluid = 'R717'; // 固定为氨
        const Te_C = parseFloat(tempEvapM7.value);
        const Tc_C = parseFloat(tempCondM7.value);
        if (isNaN(Te_C) || isNaN(Tc_C) || Tc_C <= Te_C) return;
        
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', Te_C + 273.15, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', Tc_C + 273.15, 'Q', 1, fluid);
        
        if (!Pe_Pa || !Pc_Pa) return;

        // RCC Pro: 使用活塞压缩机容积效率计算
        // 效率计算使用总过热（压缩机吸气状态）
        let total_superheat_K_eff = parseFloat(document.getElementById('superheat_m7')?.value);
        if (isNaN(total_superheat_K_eff) || total_superheat_K_eff < 0) {
            // 如果总过热未输入或无效，尝试使用有用过热
            const useful_superheat_K_eff = parseFloat(document.getElementById('useful_superheat_m7')?.value);
            total_superheat_K_eff = isNaN(useful_superheat_K_eff) || useful_superheat_K_eff < 0 ? 5 : useful_superheat_K_eff;
        }
        // 注意：保留0值用于判断饱和状态，不要强制改为0.01
        // 如果总过热=0，使用饱和温度；否则使用 Te_C + total_superheat_K_eff
        const T_suc_K = (total_superheat_K_eff <= 0) ? (Te_C + 273.15) : (Te_C + 273.15 + total_superheat_K_eff);
        
        // 尝试从选中的压缩机型号获取余隙容积
        let clearance_factor = 0.04; // 默认值
        const brand = compressorBrandM7?.value;
        const series = compressorSeriesM7?.value;
        const model = compressorModelM7?.value;
        
        // 修复：优先从UI输入获取余隙容积（如果用户手动输入了）
        const clearanceInput = document.getElementById('clearance_volume_m7');
        if (clearanceInput && clearanceInput.value !== '') {
            const clearancePercent = parseFloat(clearanceInput.value);
            if (!isNaN(clearancePercent) && clearancePercent > 0) {
                clearance_factor = clearancePercent / 100.0;
            }
        } else if (brand && series && model) {
            // 如果没有手动输入，才从压缩机型号获取
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
            console.warn('[Mode7] Failed to get k value from CoolProp, using default 1.3');
        }
        
        // 使用新的半经验工程公式计算效率（针对GEA Grasso V高端压缩机优化）
        // 传递实际的余隙容积值（从压缩机型号或用户输入获取）
        const efficiencies = calculateEfficiencies(pressureRatio, k_value, Tc_C, clearance_factor);
        const eta_v = efficiencies.eta_v;
        const eta_s = efficiencies.eta_is;
        
        if (etaVM7) etaVM7.value = eta_v.toFixed(4);
        if (etaSM7) etaSM7.value = eta_s.toFixed(3);

    } catch (error) {
        console.warn("Auto-Eff Error (Ignored):", error.message);
    }
}

// ---------------------------------------------------------------------
// Compressor Model Selection Handlers
// ---------------------------------------------------------------------

function initCompressorModelSelectorsM7() {
    // Populate brand dropdown (Mode 7: 使用m7的过滤器，因为逻辑相同)
    const brands = getFilteredBrands('m7');
    compressorBrandM7.innerHTML = `<option value="">${i18next.t('common.selectBrand')}</option>`;
    brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        compressorBrandM7.appendChild(option);
    });

    // Brand change handler
    compressorBrandM7.addEventListener('change', () => {
        const brand = compressorBrandM7.value;
        compressorSeriesM7.innerHTML = `<option value="">${i18next.t('common.selectSeries')}</option>`;
        compressorModelM7.innerHTML = `<option value="">${i18next.t('common.selectModel')}</option>`;
        compressorSeriesM7.disabled = !brand;
        compressorModelM7.disabled = true;
        modelDisplacementInfoM7.classList.add('hidden');

        if (brand) {
            const series = getFilteredSeriesByBrand('m7', brand);
            series.forEach(s => {
                const option = document.createElement('option');
                option.value = s;
                option.textContent = s;
                compressorSeriesM7.appendChild(option);
            });
            compressorSeriesM7.disabled = false;
        }
    });

    // Series change handler
    compressorSeriesM7.addEventListener('change', () => {
        const brand = compressorBrandM7.value;
        const series = compressorSeriesM7.value;
        compressorModelM7.innerHTML = `<option value="">${i18next.t('common.selectModel')}</option>`;
        compressorModelM7.disabled = !series;
        modelDisplacementInfoM7.classList.add('hidden');

        if (brand && series) {
            const models = getModelsBySeries(brand, series);
            models.forEach(m => {
                const option = document.createElement('option');
                option.value = m.model;
                option.textContent = m.model;
                compressorModelM7.appendChild(option);
            });
            compressorModelM7.disabled = false;
        }
    });

    // Model change handler - Auto-fill displacement and switch to volume mode
    compressorModelM7.addEventListener('change', () => {
        const brand = compressorBrandM7.value;
        const series = compressorSeriesM7.value;
        const model = compressorModelM7.value;

        if (brand && series && model) {
            const detail = getModelDetail(brand, series, model);
            if (detail && detail.displacement !== null && detail.displacement !== undefined) {
                const displacement = detail.displacement;
                modelDisplacementValueM7.textContent = displacement.toFixed(0);
                
                // 对于GEA系列，显示转速范围和理论流量说明
                if (brand === 'GEA Grasso' && detail.rpm_range && Array.isArray(detail.rpm_range) && detail.rpm_range.length === 2) {
                    const [minRpm, maxRpm] = detail.rpm_range;
                    modelDisplacementInfoM7.innerHTML = `
                        <span class="font-bold">理论流量:</span> <span id="model_displacement_value_m7">${displacement.toFixed(0)}</span> m³/h
                        <span class="ml-2 text-xs text-gray-600">(最大转速 ${maxRpm} RPM)</span>
                        <br>
                        <span class="text-xs text-gray-600">转速范围: ${minRpm}-${maxRpm} RPM</span>
                    `;
                } else if (brand === 'MYCOM' && detail.referenceRpm && detail.rpm_range && Array.isArray(detail.rpm_range) && detail.rpm_range.length === 2) {
                    // MYCOM系列：显示参考转速下的排量并注明rpm，同时显示转速范围
                    const [minRpm, maxRpm] = detail.rpm_range;
                    const referenceRpm = detail.referenceRpm;
                    modelDisplacementInfoM7.innerHTML = `
                        <span class="font-bold">理论排量:</span> <span id="model_displacement_value_m7">${displacement.toFixed(0)}</span> m³/h
                        <span class="ml-2 text-xs text-gray-600">(@ ${referenceRpm} RPM)</span>
                        <br>
                        <span class="text-xs text-gray-600">转速范围: ${minRpm}-${maxRpm} RPM</span>
                    `;
                } else {
                    // 其他品牌或没有转速范围信息的，显示基本排量信息
                    let infoHtml = `<span class="font-bold">理论排量:</span> <span id="model_displacement_value_m7">${displacement.toFixed(0)}</span> m³/h`;
                    if (detail.referenceRpm) {
                        infoHtml += ` <span class="ml-2 text-xs text-gray-600">(@ ${detail.referenceRpm} RPM)</span>`;
                    }
                    if (detail.rpm_range && Array.isArray(detail.rpm_range) && detail.rpm_range.length === 2) {
                        const [minRpm, maxRpm] = detail.rpm_range;
                        infoHtml += `<br><span class="text-xs text-gray-600">转速范围: ${minRpm}-${maxRpm} RPM</span>`;
                    }
                    modelDisplacementInfoM7.innerHTML = infoHtml;
                }
                modelDisplacementInfoM7.classList.remove('hidden');
                
                // 更新转速输入框的转速范围提示
                if (detail.rpm_range && Array.isArray(detail.rpm_range) && detail.rpm_range.length === 2) {
                    const [minRpm, maxRpm] = detail.rpm_range;
                    const rpmInput = document.getElementById('rpm_m7');
                    const rpmLabel = rpmInput?.parentElement?.querySelector('label');
                    
                    // 在转速输入框下方添加或更新转速范围提示
                    let rpmRangeHint = rpmInput?.parentElement?.querySelector('.rpm-range-hint');
                    if (!rpmRangeHint && rpmInput?.parentElement) {
                        rpmRangeHint = document.createElement('div');
                        rpmRangeHint.className = 'rpm-range-hint text-xs text-gray-500 mt-1 ml-1';
                        rpmInput.parentElement.appendChild(rpmRangeHint);
                    }
                    if (rpmRangeHint) {
                        rpmRangeHint.textContent = `转速范围: ${minRpm}-${maxRpm} RPM`;
                    }
                }
                
                // Automatically switch to volume mode (流量定义)
                const volModeRadio = document.querySelector('input[name="flow_mode_m7"][value="vol"]');
                const rpmModeRadio = document.querySelector('input[name="flow_mode_m7"][value="rpm"]');
                if (volModeRadio && rpmModeRadio) {
                    volModeRadio.checked = true;
                    rpmModeRadio.checked = false;
                    
                    // Update UI panels manually to ensure visibility
                    const rpmPanel = document.getElementById('rpm-inputs-m7');
                    const volPanel = document.getElementById('vol-inputs-m7');
                    if (rpmPanel) rpmPanel.style.display = 'none';
                    if (volPanel) volPanel.style.display = 'block';
                    
                    // Trigger change event to update UI (in case listeners are registered)
                    volModeRadio.dispatchEvent(new Event('change', { bubbles: true }));
                }
                
                // Auto-fill flow_m3h_m7
                if (flowM3hM7) {
                    flowM3hM7.value = displacement.toFixed(2);
                    setButtonStale7();
                }
            } else {
                modelDisplacementInfoM7.classList.add('hidden');
                // 清除转速范围提示
                const rpmInput = document.getElementById('rpm_m7');
                const rpmRangeHint = rpmInput?.parentElement?.querySelector('.rpm-range-hint');
                if (rpmRangeHint) {
                    rpmRangeHint.textContent = '';
                }
            }
        } else {
            modelDisplacementInfoM7.classList.add('hidden');
            // 清除转速范围提示
            const rpmInput = document.getElementById('rpm_m7');
            const rpmRangeHint = rpmInput?.parentElement?.querySelector('.rpm-range-hint');
            if (rpmRangeHint) {
                rpmRangeHint.textContent = '';
            }
        }
    });

    // Flow mode change handler - Auto-fill when switching to volume mode
    document.querySelectorAll('input[name="flow_mode_m7"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'vol' && compressorModelM7.value) {
                const brand = compressorBrandM7.value;
                const series = compressorSeriesM7.value;
                const model = compressorModelM7.value;
                const displacement = getDisplacementByModel(brand, series, model);
                if (displacement !== null && flowM3hM7) {
                    flowM3hM7.value = displacement.toFixed(2);
                    setButtonStale7();
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
 * 生成等压路径的T-s数据点
 * @param {string} fluid - 工质名称
 * @param {number} P_Pa - 压力 (Pa)
 * @param {number} h_start - 起始焓值 (J/kg)
 * @param {number} h_end - 结束焓值 (J/kg)
 * @param {number} numPoints - 数据点数量
 * @returns {Array} T-s 数据点数组，格式为 [s (kJ/kg·K), T (°C)]
 */
function generateIsobaricPathTS(fluid, P_Pa, h_start, h_end, numPoints = 20) {
    if (!CP_INSTANCE) return [];
    
    const points = [];
    
    for (let i = 0; i <= numPoints; i++) {
        const ratio = i / numPoints;
        const h = h_start + (h_end - h_start) * ratio;
        
        try {
            const T_K = CP_INSTANCE.PropsSI('T', 'H', h, 'P', P_Pa, fluid);
            const s_J = CP_INSTANCE.PropsSI('S', 'H', h, 'P', P_Pa, fluid);
            points.push([s_J / 1000, T_K - 273.15]); // [s (kJ/kg·K), T (°C)]
        } catch (e) {
            continue;
        }
    }
    
    return points;
}

/**
 * 生成等温等压路径（冷凝过程）的T-s数据点
 * @param {string} fluid - 工质名称
 * @param {number} P_Pa - 压力 (Pa)
 * @param {number} T_K - 温度 (K)
 * @param {number} numPoints - 数据点数量
 * @returns {Array} T-s 数据点数组，格式为 [s (kJ/kg·K), T (°C)]
 */
function generateIsothermalIsobaricPathTS(fluid, P_Pa, T_K, numPoints = 20) {
    if (!CP_INSTANCE) return [];
    
    const points = [];
    
    try {
        // 从饱和气体(Q=1)到饱和液体(Q=0)
        const h_vap = CP_INSTANCE.PropsSI('H', 'P', P_Pa, 'Q', 1, fluid);
        const h_liq = CP_INSTANCE.PropsSI('H', 'P', P_Pa, 'Q', 0, fluid);
        
        for (let i = 0; i <= numPoints; i++) {
            const ratio = i / numPoints;
            const h = h_vap + (h_liq - h_vap) * ratio;
            const s_J = CP_INSTANCE.PropsSI('S', 'H', h, 'P', P_Pa, fluid);
            points.push([s_J / 1000, T_K - 273.15]); // [s (kJ/kg·K), T (°C)]
        }
    } catch (e) {
        // 如果失败，返回空数组
        return [];
    }
    
    return points;
}

/**
 * 生成等焓路径（节流过程）的T-s数据点
 * @param {string} fluid - 工质名称
 * @param {number} h_J - 焓值 (J/kg)
 * @param {number} P_start_Pa - 起始压力 (Pa)
 * @param {number} P_end_Pa - 结束压力 (Pa)
 * @param {number} numPoints - 数据点数量
 * @returns {Array} T-s 数据点数组，格式为 [s (kJ/kg·K), T (°C)]
 */
function generateIsenthalpicPathTS(fluid, h_J, P_start_Pa, P_end_Pa, numPoints = 20) {
    if (!CP_INSTANCE) return [];
    
    const points = [];
    
    for (let i = 0; i <= numPoints; i++) {
        const ratio = i / numPoints;
        const logP_start = Math.log10(P_start_Pa);
        const logP_end = Math.log10(P_end_Pa);
        const logP = logP_start + (logP_end - logP_start) * ratio;
        const P_Pa = Math.pow(10, logP);
        
        try {
            const T_K = CP_INSTANCE.PropsSI('T', 'H', h_J, 'P', P_Pa, fluid);
            const s_J = CP_INSTANCE.PropsSI('S', 'H', h_J, 'P', P_Pa, fluid);
            points.push([s_J / 1000, T_K - 273.15]); // [s (kJ/kg·K), T (°C)]
        } catch (e) {
            continue;
        }
    }
    
    return points;
}

/**
 * 生成压缩过程的T-s数据点
 * @param {string} fluid - 工质名称
 * @param {number} h_start - 起始焓值 (J/kg)
 * @param {number} P_start_Pa - 起始压力 (Pa)
 * @param {number} h_end - 结束焓值 (J/kg)
 * @param {number} P_end_Pa - 结束压力 (Pa)
 * @param {number} numPoints - 数据点数量
 * @returns {Array} T-s 数据点数组，格式为 [s (kJ/kg·K), T (°C)]
 */
function generateCompressionPathTS(fluid, h_start, P_start_Pa, h_end, P_end_Pa, numPoints = 20) {
    if (!CP_INSTANCE) return [];
    
    const points = [];
    
    for (let i = 0; i <= numPoints; i++) {
        const ratio = i / numPoints;
        
        // 焓值插值
        const h = h_start + (h_end - h_start) * ratio;
        // 压力对数插值
        const logP_start = Math.log10(P_start_Pa);
        const logP_end = Math.log10(P_end_Pa);
        const logP = logP_start + (logP_end - logP_start) * ratio;
        const P_Pa = Math.pow(10, logP);
        
        try {
            const T_K = CP_INSTANCE.PropsSI('T', 'H', h, 'P', P_Pa, fluid);
            const s_J = CP_INSTANCE.PropsSI('S', 'H', h, 'P', P_Pa, fluid);
            points.push([s_J / 1000, T_K - 273.15]); // [s (kJ/kg·K), T (°C)]
        } catch (e) {
            continue;
        }
    }
    
    return points;
}

/**
 * 为Mode7生成正确的T-s图路径点
 * @param {string} fluid - 工质名称
 * @param {Object} cycleData - 循环数据
 * @param {number} cycleData.h_1 - 点1的焓值 (J/kg)
 * @param {number} cycleData.h_2 - 点2的焓值 (J/kg)
 * @param {number} cycleData.h_2b - 点2b的焓值 (J/kg)，可选
 * @param {number} cycleData.h_3 - 点3的焓值 (J/kg)
 * @param {number} cycleData.h_3p - 点3'的焓值 (J/kg)，可选
 * @param {number} cycleData.h_4 - 点4的焓值 (J/kg)
 * @param {number} cycleData.Pe_Pa - 蒸发压力 (Pa)
 * @param {number} cycleData.Pc_Pa - 冷凝压力 (Pa)
 * @param {number} cycleData.Te_C - 蒸发温度 (°C)
 * @param {number} cycleData.Tc_C - 冷凝温度 (°C)
 * @param {boolean} cycleData.isDesuperheaterEnabled - 是否启用降低过热器
 * @param {boolean} cycleData.isSubcoolerEnabled - 是否启用过冷器
 * @returns {Array} T-s 图的主循环点数组，格式为 { name, value: [s, T], label }
 */
function generateTSPathM7(fluid, cycleData) {
    if (!CP_INSTANCE) return [];
    
    const {
        h_1, h_2, h_2b, h_3, h_3p, h_4,
        Pe_Pa, Pc_Pa, Te_C, Tc_C,
        isDesuperheaterEnabled, isSubcoolerEnabled
    } = cycleData;
    
    const tsPoints = [];
    const Te_K = Te_C + 273.15;
    const Tc_K = Tc_C + 273.15;
    
    // 辅助函数：添加关键点
    const addPoint = (name, h_J, p_Pa, labelPos = 'right') => {
        try {
            const s_J = CP_INSTANCE.PropsSI('S', 'H', h_J, 'P', p_Pa, fluid);
            const T_K = CP_INSTANCE.PropsSI('T', 'H', h_J, 'P', p_Pa, fluid);
            const T_C = T_K - 273.15;
            tsPoints.push({
                name: name,
                value: [s_J / 1000, T_C],
                label: { position: labelPos, show: true }
            });
        } catch (e) {
            console.warn(`Failed to add point ${name} to T-S:`, e);
        }
    };
    
    // 辅助函数：添加路径点（不显示标签）
    const addPathPoints = (pathPoints) => {
        pathPoints.forEach(pt => {
            tsPoints.push({
                name: '',
                value: pt,
                label: { show: false }
            });
        });
    };
    
    // 1. 点1（蒸发器出口/压缩机入口）
    addPoint('1', h_1, Pe_Pa, 'right');
    
    // 2. 压缩过程：1 -> 2（等熵压缩的近似）
    const compressionPath = generateCompressionPathTS(fluid, h_1, Pe_Pa, h_2, Pc_Pa, 30);
    addPathPoints(compressionPath);
    
    // 3. 点2（压缩机出口）
    addPoint('2', h_2, Pc_Pa, 'top');
    
    // 4. 等压降温过程：2 -> 2b（如果启用降低过热器）
    if (isDesuperheaterEnabled && h_2b !== undefined) {
        const desuperPath = generateIsobaricPathTS(fluid, Pc_Pa, h_2, h_2b, 15);
        addPathPoints(desuperPath);
        
        // 点2b
        addPoint('2b', h_2b, Pc_Pa, 'top');
        
        // 5. 冷凝过程：2b -> 3
        // 5a. 2b到饱和气体点（等压降温）
        const T_2b_K = CP_INSTANCE.PropsSI('T', 'H', h_2b, 'P', Pc_Pa, fluid);
        const h_sat_vap = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'Q', 1, fluid);
        const path2bToSatVap = generateIsobaricPathTS(fluid, Pc_Pa, h_2b, h_sat_vap, 10);
        addPathPoints(path2bToSatVap);
        
        // 5b. 饱和气体到饱和液体（等温等压冷凝）
        const condensationPath = generateIsothermalIsobaricPathTS(fluid, Pc_Pa, Tc_K, 20);
        addPathPoints(condensationPath);
        
        // 5c. 到达饱和液体点（点3应该在饱和液体线上）
        // 不再需要额外的路径，因为点3就是饱和液体点
    } else {
        // 如果没有降低过热器，直接从点2到点3
        // 5a. 2到饱和气体点（等压降温）
        const h_sat_vap = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'Q', 1, fluid);
        const path2ToSatVap = generateIsobaricPathTS(fluid, Pc_Pa, h_2, h_sat_vap, 10);
        addPathPoints(path2ToSatVap);
        
        // 5b. 饱和气体到饱和液体（等温等压冷凝）
        const condensationPath = generateIsothermalIsobaricPathTS(fluid, Pc_Pa, Tc_K, 20);
        addPathPoints(condensationPath);
        
        // 5c. 到达饱和液体点（点3应该在饱和液体线上）
        // 不再需要额外的路径，因为点3就是饱和液体点
    }
    
    // 6. 点3（冷凝器出口，应该是饱和液体）
    // 注意：在实际计算中h_3可能已经考虑了基础过冷度，
    // 但在T-s图中，点3应该显示在饱和液体线上（标准冷凝器出口状态）
    // 我们使用饱和液体状态来绘制点3
    const h_sat_liq_cond = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'Q', 0, fluid);
    addPoint('3', h_sat_liq_cond, Pc_Pa, 'top');
    
    // 7. 等压过冷过程：3 -> 3'（如果启用过冷器）
    if (isSubcoolerEnabled && h_3p !== undefined) {
        // 从饱和液体到过冷液体（点3'），应该在饱和线下方
        // 使用实际计算的点3'状态（已经过冷）
        const subcoolPath = generateIsobaricPathTS(fluid, Pc_Pa, h_sat_liq_cond, h_3p, 15);
        addPathPoints(subcoolPath);
        
        // 点3'（过冷液体，在饱和线下方）
        addPoint("3'", h_3p, Pc_Pa, 'bottom');
        
        // 8. 等焓节流：3' -> 4
        const expansionPath = generateIsenthalpicPathTS(fluid, h_3p, Pc_Pa, Pe_Pa, 20);
        addPathPoints(expansionPath);
    } else {
        // 如果没有过冷器，直接从点3（饱和液体）节流到点4
        const h_sat_liq_cond = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'Q', 0, fluid);
        const expansionPath = generateIsenthalpicPathTS(fluid, h_sat_liq_cond, Pc_Pa, Pe_Pa, 20);
        addPathPoints(expansionPath);
    }
    
    // 9. 点4（节流阀出口/蒸发器入口）
    // 注意：等焓节流后的点4应该在两相区，4点左边不应该有额外的线
    addPoint('4', h_4, Pe_Pa, 'bottom');
    
    // 10. 蒸发过程：4 -> 1
    // 根据用户描述：4点等温等压到饱和气体线，然后等压升温到1点
    // 注意：4点左边没有线，等焓节流直接到4点，然后从4点向右开始蒸发
    const h_sat_vap_evap = CP_INSTANCE.PropsSI('H', 'P', Pe_Pa, 'Q', 1, fluid);
    const h_sat_liq_evap = CP_INSTANCE.PropsSI('H', 'P', Pe_Pa, 'Q', 0, fluid);
    
    // 10a. 等温等压蒸发：从点4到饱和气体（水平线）
    // 等焓节流后的点4应该已经在两相区
    // 从点4的实际位置开始，向右（熵增加方向）到饱和气体
    if (h_4 <= h_sat_vap_evap && h_4 >= h_sat_liq_evap) {
        // 点4在两相区，从点4直接到饱和气体（等温等压，水平线）
        const path4ToSatVap = generateIsobaricPathTS(fluid, Pe_Pa, h_4, h_sat_vap_evap, 15);
        addPathPoints(path4ToSatVap);
    } else if (h_4 < h_sat_liq_evap) {
        // 点4在过冷区（理论上不应该发生，但处理这种情况）
        // 先从点4到饱和液体，然后等温等压到饱和气体
        const path4ToSatLiq = generateIsobaricPathTS(fluid, Pe_Pa, h_4, h_sat_liq_evap, 5);
        addPathPoints(path4ToSatLiq);
        const pathSatLiqToSatVap = generateIsobaricPathTS(fluid, Pe_Pa, h_sat_liq_evap, h_sat_vap_evap, 15);
        addPathPoints(pathSatLiqToSatVap);
    }
    
    // 10b. 等压升温：从饱和气体到点1（过热）
    // 如果点4已经在过热区，直接从点4到点1
    if (h_4 > h_sat_vap_evap) {
        const path4To1 = generateIsobaricPathTS(fluid, Pe_Pa, h_4, h_1, 15);
        addPathPoints(path4To1);
    } else if (h_1 > h_sat_vap_evap) {
        // 如果点1在过热区，从饱和气体到点1
        const pathSatVapTo1 = generateIsobaricPathTS(fluid, Pe_Pa, h_sat_vap_evap, h_1, 15);
        addPathPoints(pathSatVapTo1);
    }
    
    // 最后再添加点1，确保循环闭合
    addPoint('1', h_1, Pe_Pa, 'right');
    
    return tsPoints;
}

/**
 * 将 P-h 图的点转换为 T-s 图的点（保留用于向后兼容）
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
function calculateMode7() {
    renderToAllViews('<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div></div>');
    ['chart-desktop-m7', 'chart-mobile-m7'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    
    setTimeout(() => {
        try {
            // --- Common Input Reading ---
            const fluid = 'R717'; // 固定为氨
            const Te_C = parseFloat(document.getElementById('temp_evap_m7').value);
            const Tc_C = parseFloat(document.getElementById('temp_cond_m7').value);
            // =========================================================
            // 过热分析：区分有用过热和总过热
            // =========================================================
            // =========================================================
            // 过热分析：读取并处理有用过热和总过热
            // =========================================================
            // 注意：保留原始值用于判断饱和状态，不要强制改为0.01
            let useful_superheat_K_raw = parseFloat(document.getElementById('useful_superheat_m7')?.value);
            if (isNaN(useful_superheat_K_raw) || useful_superheat_K_raw < 0) useful_superheat_K_raw = 5; // 默认值
            const useful_superheat_K = useful_superheat_K_raw; // 保留原始值，包括0
            
            let total_superheat_K_raw = parseFloat(document.getElementById('superheat_m7').value);
            if (isNaN(total_superheat_K_raw) || total_superheat_K_raw < 0) {
                // 如果总过热未输入或无效，默认等于有用过热
                total_superheat_K_raw = useful_superheat_K_raw;
            }
            // 确保总过热 >= 有用过热（物理约束）
            let total_superheat_K;
            if (total_superheat_K_raw < useful_superheat_K) {
                console.warn('[Mode7] 总过热小于有用过热，已自动调整为等于有用过热');
                total_superheat_K = useful_superheat_K; // 调整为等于有用过热
            } else {
                total_superheat_K = total_superheat_K_raw; // 保留原始值，包括0
            }
            
            // 计算管道过热（使用实际值，包括0）
            const line_superheat_K = total_superheat_K - useful_superheat_K;
            
            let subcooling_K = parseFloat(document.getElementById('subcooling_m7').value);
            if (subcooling_K === 0) subcooling_K = 0.01;
            
            // VSD Inputs
            const isVsdEnabled = vsdCheckboxM7.checked;
            const ratedRpm = parseFloat(ratedRpmInputM7.value) || 2900;
            const currentRpm = parseFloat(document.getElementById('rpm_m7').value) || 2900;
            const rpmRatio = isVsdEnabled ? (currentRpm / ratedRpm) : 1.0;

            AppState.updateVSD(isVsdEnabled, ratedRpm, currentRpm);

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
                console.log(`[Mode7 Debug] 总过热=0，使用饱和状态：rho_1=${rho_1.toFixed(3)} kg/m³`);
            } else {
                // 过热状态：使用温度计算
                T_1_K = T_evap_K + total_superheat_K;
                h_1 = CP_INSTANCE.PropsSI('H', 'T', T_1_K, 'P', Pe_Pa, fluid);
                rho_1 = CP_INSTANCE.PropsSI('D', 'T', T_1_K, 'P', Pe_Pa, fluid); // 过热蒸气密度（较小）
                console.log(`[Mode7 Debug] 总过热=${total_superheat_K.toFixed(1)}K，使用过热状态：rho_1=${rho_1.toFixed(3)} kg/m³`);
            } 
            
            // Point 3: Condenser Outlet
            const T_3_K = T_cond_K - subcooling_K;
            const h_3 = CP_INSTANCE.PropsSI('H', 'T', T_3_K, 'P', Pc_Pa, fluid); 

            // =========================================================
            // Suction Properties
            // =========================================================
            const T_suc_K = T_1_K;
            const h_suc = h_1;
            const rho_suc = rho_1;
            // 熵值计算：如果总过热=0，使用饱和状态；否则使用温度计算
            let s_suc;
            if (total_superheat_K <= 0) {
                s_suc = CP_INSTANCE.PropsSI('S', 'P', Pe_Pa, 'Q', 1, fluid); // 饱和蒸气熵值
            } else {
                s_suc = CP_INSTANCE.PropsSI('S', 'T', T_suc_K, 'P', Pe_Pa, fluid);
            }
            let m_dot_suc = 0, W_shaft_W = 0;
            const h_liq_out = h_3; 

            let eta_v_display = null, eta_s_display = null;
            let efficiency_info_text = "";

            // Mass Flow Calculation
                if (AppState.currentMode === AppState.MODES.GEOMETRY) {
                    const flow_mode = document.querySelector('input[name="flow_mode_m7"]:checked').value;
                    const eta_v_input = parseFloat(etaVM7.value);
                    if (isNaN(eta_v_input)) throw new Error("Invalid Volumetric Efficiency.");

                    let V_th_m3_s = 0;
                    if (flow_mode === 'rpm') {
                        // RCC Pro: 基于转速的线性插值计算扫气量
                        const brand = compressorBrandM7?.value;
                        const series = compressorSeriesM7?.value;
                        const model = compressorModelM7?.value;
                        
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
                                const disp = parseFloat(document.getElementById('displacement_m7').value);
                                V_th_m3_s = currentRpm * (disp / 1e6) / 60.0;
                            }
                        } else {
                            // 如果没有选择压缩机型号，使用旧逻辑
                            const disp = parseFloat(document.getElementById('displacement_m7').value);
                            V_th_m3_s = currentRpm * (disp / 1e6) / 60.0;
                        }
                    } else {
                        const flow_m3h = parseFloat(flowM3hM7.value);
                        V_th_m3_s = flow_m3h / 3600.0;
                    }
                    m_dot_suc = V_th_m3_s * eta_v_input * rho_suc;
                    
                    // 调试日志：验证质量流量计算
                    console.log(`[Mode7 Debug] 质量流量计算：总过热=${total_superheat_K.toFixed(1)}K, V_th=${(V_th_m3_s*3600).toFixed(2)} m³/h, eta_v=${eta_v_input.toFixed(3)}, rho_suc=${rho_suc.toFixed(3)} kg/m³, m_dot=${(m_dot_suc*3600).toFixed(2)} kg/h`);
                    
                    eta_v_display = eta_v_input;
                    eta_s_display = parseFloat(etaSM7.value);
                    // 修复：添加等熵效率验证，确保效率设定起作用
                    if (isNaN(eta_s_display) || eta_s_display <= 0 || eta_s_display > 1) {
                        throw new Error("Invalid Isentropic Efficiency. Please enter a value between 0 and 1.");
                    }
                    efficiency_info_text = isVsdEnabled ? `Geo (VSD @ ${currentRpm})` : "Standard Geometry";

                } else {
                    // Polynomial Mode
                    const cInputs = Array.from(document.querySelectorAll('input[name="poly_flow_m7"]')).map(i => i.value);
                    const dInputs = Array.from(document.querySelectorAll('input[name="poly_power_m7"]')).map(i => i.value);
                    const corrInputs = Array.from(document.querySelectorAll('input[name="poly_corr_m7"]')).map(i => i.value);
                    AppState.updateCoeffs('massFlow', cInputs);
                    AppState.updateCoeffs('power', dInputs);
                    AppState.updateCoeffs('correction', corrInputs);

                    let m_poly = calculatePolyVSD(AppState.polynomial.massFlowCoeffs, AppState.polynomial.correctionCoeffs, Te_C, Tc_C, rpmRatio);
                    m_dot_suc = m_poly; 

                    const P_poly = calculatePolyVSD(AppState.polynomial.powerCoeffs, AppState.polynomial.correctionCoeffs, Te_C, Tc_C, rpmRatio);
                    W_shaft_W = P_poly * 1000;

                    const refRpm = parseFloat(polyRefRpmInputM7.value) || 2900;
                    const refDisp = parseFloat(polyRefDispInputM7.value) || 437.5;
                    const V_th_current = (isVsdEnabled ? currentRpm : refRpm) * (refDisp / 1e6) / 60.0;
                    eta_v_display = m_dot_suc / (rho_suc * V_th_current);
                    efficiency_info_text = isVsdEnabled ? "Poly (VSD Corr)" : "Poly-Fit";
            } 

            // =========================================================
            // Work & Finalization
            // =========================================================
            // RCC Pro: 重构功率计算 - 分离等熵效率和机械效率
            // =========================================================
            // Step A: 气体热力学（等熵效率决定气体行为）
            const h_2s = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_suc, fluid);
            
            // 等熵效率（ISENTROPIC_EFF）：决定实际排气焓值和温度
            // 实际排气焓值 = h_suc + (h_2s - h_suc) / η_is
            const h_2a_final = h_suc + (h_2s - h_suc) / eta_s_display;
            const T_2a_final_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h_2a_final, fluid);
            let T_2a_final_C = T_2a_final_K - 273.15;
            
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

            // =========================================================
            // 制冷量计算：基于有用过热（蒸发器内吸收的热量）
            // =========================================================
            // Q_evap_W will be recalculated after water circuit if subcooler is enabled
            // 使用 h_1a（蒸发器出口，基于有用过热）而不是 h_1（压缩机吸气，基于总过热）
            let Q_evap_W = m_dot_suc * (h_1a - h_liq_out);
            
            // 管道过热吸收的热量（通常很小，用于参考）
            const Q_evap_line_W = m_dot_suc * (h_1 - h_1a); 
            const h_system_in = m_dot_suc * h_suc;
            
            // =========================================================
            // RCC Pro: 缸头冷却负荷计算（可选/条件性）
            // =========================================================
            // 缸头冷却是可选功能，用于降低排气温度
            // 根据荆工要求：冷却负荷约4%轴功率，可降低排气温度约15°C
            let Q_cylinder_head_W = 0;
            let T_2a_after_head_cooling_C = T_2a_final_C; // 缸头冷却后的排气温度
            let cylinderHeadCoolingError = null; // 安全检查错误
            const CYLINDER_HEAD_COOLING_FACTOR = 0.04; // 缸头冷却可带走4%轴功率（根据荆工要求）
            const CYLINDER_HEAD_TEMP_REDUCTION = 15; // °C，缸头冷却可降低的排气温度
            // 缸头冷却计算模式：
            // - 'fixed_power': 固定按轴功率百分比带走热量（默认4%）
            // - 'target_dt'  : 优先满足目标温降（默认15°C），由此计算所需负荷（确保能量守恒）
            const CYLINDER_HEAD_COOLING_MODE = 'target_dt';
            
            // 读取缸头冷却配置
            const isCylinderHeadCoolingEnabled = cylinderHeadCoolingEnabledM7?.checked || false;
            
            // 调试信息
            if (isCylinderHeadCoolingEnabled) {
                console.log('[RCC Pro] 缸头冷却已启用');
            }
            
            if (isCylinderHeadCoolingEnabled) {
                // 读取缸头冷却水参数
                const T_head_water_in = parseFloat(cylinderHeadWaterInletTempM7?.value) || 30;
                const T_head_water_out = parseFloat(cylinderHeadWaterOutletTempM7?.value) || 35;
                
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
            
            // =========================================================
            // RCC Pro: 排气温度限制检查（基于修正后的排气温度）
            // =========================================================
            // 注意：如果启用缸头冷却，使用修正后的排气温度进行检查
            let dischargeTempWarning = null;
            let dischargeTempError = null;
            let isOperatingPointInvalid = false;
            
            // 使用修正后的排气温度（如果启用缸头冷却）
            // 注意：T_2a_after_head_cooling_C 现在是根据能量守恒计算的实际温度
            const T_discharge_actual_C = (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) 
                ? T_2a_after_head_cooling_C 
                : T_2a_final_C;
            
            // 如果启用了缸头冷却，显示实际的温度降低效果
            if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) {
                const actual_temp_reduction = T_2a_final_C - T_2a_after_head_cooling_C;
                console.log(`[RCC Pro] 缸头冷却效果：`);
                console.log(`  原始排气温度: ${T_2a_final_C.toFixed(1)}°C`);
                console.log(`  修正后排气温度: ${T_2a_after_head_cooling_C.toFixed(1)}°C`);
                console.log(`  实际温度降低: ${actual_temp_reduction.toFixed(1)}°C`);
            }
            
            // 优先使用制冷剂类型的限制（主要限制，基于润滑油分解温度）
            const fluidLimits = getDischargeTempLimitsByRefrigerant(fluid);
            
            // 获取压缩机系列的排气温度限制（补充限制，基于硬件设计）
            const brand = compressorBrandM7?.value;
            const series = compressorSeriesM7?.value;
            const seriesLimits = getDischargeTempLimits(brand, series);
            
            // RCC Pro: 对于热泵系列（V HP/XHP, MYCOM HS/HK），优先使用系列限制（设计用于更高温度）
            // 对于标准系列（V, M-II），使用更严格的限制（取两者中的较小值）
            // 特殊处理：Grasso 5HP 系列虽然包含 HP，但主要用于 CO2，如果使用氨制冷剂，应使用氨的限制
            const isHeatPumpSeries = series && (
                series.includes('HP') || 
                series.includes('XHP') ||
                series.includes('HS Series') ||  // MYCOM HS 系列（高压热泵）
                series.includes('HK Series')     // MYCOM HK 系列（高压CO2/热泵）
            );
            
            // 特殊处理：Grasso 5HP 系列主要用于 CO2，如果使用氨制冷剂，应使用氨的限制而不是 CO2 限制
            const is5HPSeries = series && series.includes('5HP');
            const shouldUseFluidLimits = is5HPSeries && fluid === 'R717' && seriesLimits && seriesLimits.warning < fluidLimits.warn;
            
            let effectiveWarning, effectiveMax;
            if (shouldUseFluidLimits) {
                // Grasso 5HP 使用氨制冷剂时，使用氨的限制（因为 5HP 的限制是 CO2 的，对氨来说太保守）
                effectiveWarning = fluidLimits.warn;
                effectiveMax = fluidLimits.max;
                console.log(`[RCC Pro] Grasso 5HP 使用氨制冷剂，使用氨的限制: 警告=${effectiveWarning}°C, 最大=${effectiveMax}°C`);
            } else if (isHeatPumpSeries && seriesLimits) {
                // 热泵系列：优先使用系列限制（设计用于更高温度工况）
                effectiveWarning = seriesLimits.warning;
                effectiveMax = seriesLimits.trip;
                console.log(`[RCC Pro] 使用热泵系列温度限制: 警告=${effectiveWarning}°C, 最大=${effectiveMax}°C (系列: ${series})`);
            } else {
                // 标准系列：使用更严格的限制（取两者中的较小值）
                effectiveWarning = Math.min(fluidLimits.warn, seriesLimits?.warning || fluidLimits.warn);
                effectiveMax = Math.min(fluidLimits.max, seriesLimits?.trip || fluidLimits.max);
                console.log(`[RCC Pro] 使用标准系列温度限制: 警告=${effectiveWarning}°C, 最大=${effectiveMax}°C (系列: ${series})`);
            }
            
            // 检查排气温度限制（使用修正后的温度）
            if (T_discharge_actual_C > effectiveMax) {
                // 超过最大限制：显示危险错误，标记操作点为无效
                dischargeTempError = `DANGER: 排气温度 ${T_discharge_actual_C.toFixed(1)}°C 超过最大限制 ${effectiveMax}°C。存在润滑油分解风险！`;
                isOperatingPointInvalid = true;
                console.error(`[RCC Pro] ${dischargeTempError}`);
            } else if (T_discharge_actual_C > effectiveWarning) {
                // 超过警告限制：显示警告
                dischargeTempWarning = `排气温度 ${T_discharge_actual_C.toFixed(1)}°C 超过警告限制 ${effectiveWarning}°C。请检查运行参数。`;
                console.warn(`[RCC Pro] ${dischargeTempWarning}`);
            }
            
            // 如果启用缸头冷却，在警告/错误信息中说明原始排气温度和修正后的温度
            if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0 && T_2a_final_C !== T_2a_after_head_cooling_C) {
                if (dischargeTempError) {
                    dischargeTempError += ` (原始排气温度: ${T_2a_final_C.toFixed(1)}°C，缸头冷却后: ${T_2a_after_head_cooling_C.toFixed(1)}°C)`;
                } else if (dischargeTempWarning) {
                    dischargeTempWarning += ` (原始排气温度: ${T_2a_final_C.toFixed(1)}°C，缸头冷却后: ${T_2a_after_head_cooling_C.toFixed(1)}°C)`;
                }
            }
            
            // =========================================================
            // Water Circuit Heat Exchangers Calculation
            // =========================================================
            const c_p_water = 4186; // J/(kg·K) - 水的比热容
            
            // Read water circuit inputs
            const T_water_in = parseFloat(waterInletTempM7?.value) || 40;
            const T_water_out = parseFloat(waterOutletTempM7?.value) || 70;
            
            // Read heat exchanger configurations
            const isSubcoolerEnabled = subcoolerEnabledM7?.checked || false;
            // RCC Pro: 活塞压缩机油冷用于润滑系统（冷却轴承、曲轴、轴封），不是喷油冷却
            // 对于热泵工况（V HP/XHP 系列），通常需要油冷却器以控制油温（ISO VG 68）
            // 修复：冷凝器是必配项，强制启用
            const isCondenserEnabled = true; // 冷凝器必配
            const isDesuperheaterEnabled = desuperheaterEnabledM7?.checked || false;
            
            // 注意：isOilCoolerEnabled 已在前面声明，始终为 true（摩擦热总是存在）
            
            // Approach temperatures (K) - 逼近温差
            const approach_subcooler = parseFloat(subcoolerApproachTempM7?.value) || 5; // K
            const approach_oil_cooler = parseFloat(oilCoolerApproachTempM7?.value) || 10; // K
            const approach_condenser = parseFloat(condenserApproachTempM7?.value) || 5; // K
            const approach_desuperheater = parseFloat(desuperheaterApproachTempM7?.value) || 8; // K
            const T_desuperheater_target = parseFloat(desuperheaterTargetTempM7?.value) || 90;
            
            // Initialize heat exchanger results
            let Q_subcooler_W = 0;
            let Q_oil_cooler_W = 0;
            let Q_cond_W = 0;
            let Q_desuperheater_W = 0;
            
            // =========================================================
            // RCC Pro: 计算缸头冷却后的排气状态（如果启用）
            // =========================================================
            // 注意：缸头冷却在排气温度计算之后，降低过热器之前
            // 如果启用缸头冷却，排气温度会降低，需要重新计算排气焓值
            // 注意：T_2a_after_head_cooling_C 已在前面声明（第987行）
            let h_2a_after_head_cooling = h_2a_final;
            
            // 调试日志已移除（避免控制台错误）
            
            if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) {
                // =========================================================
                // 修复：缸头冷却应该根据实际带走的热量来计算焓降
                // 而不是通过降低温度来反推焓值，这样才能保证能量守恒
                // =========================================================
                // 正确的能量守恒：h_2a_after_head_cooling = h_2a_final - (Q_cylinder_head / m_dot)
                const h_reduction_per_kg = Q_cylinder_head_W / m_dot_suc; // J/kg
                h_2a_after_head_cooling = h_2a_final - h_reduction_per_kg;
                
                // 根据修正后的焓值反算实际的排气温度
                const T_2a_after_head_K = CP_INSTANCE.PropsSI('T', 'H', h_2a_after_head_cooling, 'P', Pc_Pa, fluid);
                T_2a_after_head_cooling_C = T_2a_after_head_K - 273.15;
                
                // #region agent log - Energy Balance Debug
                const h_diff_from_energy = h_2a_final - h_2a_after_head_cooling;
                const h_diff_expected = Q_cylinder_head_W / m_dot_suc;
                const temp_reduction_actual = T_2a_final_C - T_2a_after_head_cooling_C;
                // 调试日志已移除（避免控制台错误）
            } else {
                // 未启用或安全检查失败，使用原始排气状态
                h_2a_after_head_cooling = h_2a_final;
                // T_2a_after_head_cooling_C 已在前面初始化为 T_2a_final_C，无需重新赋值
            }
            
            let h_2a_after_desuper = h_2a_after_head_cooling;
            let h_3_final = h_3;
            let T_2a_after_desuper_C = T_2a_after_head_cooling_C;
            
            // Calculate Desuperheater (if enabled) - reduces discharge temperature
            // 注意：降低过热器使用缸头冷却后的排气状态作为入口
            if (isDesuperheaterEnabled) {
                // 确保目标温度合理（必须高于冷凝温度，但低于排气温度）
                const T_desuper_target_valid = Math.max(Tc_C + 0.5, Math.min(T_desuperheater_target, T_2a_after_head_cooling_C - 1));
                const T_2a_target_K = T_desuper_target_valid + 273.15;
                h_2a_after_desuper = CP_INSTANCE.PropsSI('H', 'T', T_2a_target_K, 'P', Pc_Pa, fluid);
                
                // 检查计算结果是否有效
                if (!h_2a_after_desuper || !isFinite(h_2a_after_desuper) || h_2a_after_desuper <= 0) {
                    // 如果计算失败，尝试使用饱和状态
                    const T_sat_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'Q', 1, fluid);
                    if (T_desuper_target_valid > T_sat_K - 273.15) {
                        // 目标温度高于饱和温度，使用过热状态
                        h_2a_after_desuper = CP_INSTANCE.PropsSI('H', 'T', T_2a_target_K, 'P', Pc_Pa, fluid);
                    } else {
                        // 目标温度太低，使用饱和蒸气状态
                        h_2a_after_desuper = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'Q', 1, fluid);
                    }
                }
                
                // 再次验证
                if (!h_2a_after_desuper || !isFinite(h_2a_after_desuper) || h_2a_after_desuper <= 0) {
                    throw new Error(`降低过热器计算失败：目标温度 ${T_desuper_target_valid.toFixed(1)}°C 在压力 ${(Pc_Pa/1e5).toFixed(2)} bar 下无效`);
                }
                
                Q_desuperheater_W = m_dot_suc * (h_2a_after_head_cooling - h_2a_after_desuper);
                T_2a_after_desuper_C = T_desuper_target_valid;
            } else {
                // 修复：如果未启用降低过热器，确保 h_2a_after_desuper 等于缸头冷却后的状态
                h_2a_after_desuper = h_2a_after_head_cooling;
                T_2a_after_desuper_C = T_2a_after_head_cooling_C;
                Q_desuperheater_W = 0;
            }
            
            // Calculate Condenser - uses desuperheater outlet if enabled, or head cooling outlet
            if (isCondenserEnabled) {
                // 修复：确保使用正确的入口焓值
                // 优先级：降低过热器出口 > 缸头冷却出口 > 原始排气
                const h_cond_in = isDesuperheaterEnabled ? h_2a_after_desuper : 
                                 (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError ? h_2a_after_head_cooling : h_2a_final);
                Q_cond_W = m_dot_suc * (h_cond_in - h_3);
                
                // 调试日志已移除（避免控制台错误）
            } else {
                Q_cond_W = 0;
            }
            
            // Calculate Subcooler (if enabled) - further subcools condenser outlet
            if (isSubcoolerEnabled) {
                // 根据逼近温差严格计算：制冷剂出口温度 = 热水入口温度 + 逼近温差
                // 过冷器是第一个换热器，热水入口温度就是 T_water_in
                const T_3_subcooled_C = T_water_in + approach_subcooler;
                const T_3_subcooled_K = T_3_subcooled_C + 273.15;
                // 确保过冷后的温度不超过冷凝器出口温度（物理限制）
                const T_3_subcooled_K_final = Math.min(T_3_subcooled_K, T_3_K);
                const h_3_subcooled = CP_INSTANCE.PropsSI('H', 'T', T_3_subcooled_K_final, 'P', Pc_Pa, fluid);
                Q_subcooler_W = m_dot_suc * (h_3 - h_3_subcooled);
                h_3_final = h_3_subcooled;
            } else {
                h_3_final = h_3;
            }
            
            // RCC Pro: 活塞压缩机油冷负荷（仅摩擦热，不是气体冷却）
            // 油冷始终启用，因为摩擦热总是存在（由油泵决定，不是用户选择）
            Q_oil_cooler_W = Q_oil_W; // 始终等于摩擦热，因为油冷始终启用
            
            // 调试日志已移除（避免控制台错误）
            
            // Calculate total heat transfer
            const Q_total_W = Q_subcooler_W + Q_oil_cooler_W + Q_cond_W + Q_desuperheater_W;
            
            // Calculate water flow rate from total heat balance
            const deltaT_water_total = T_water_out - T_water_in;
            let m_dot_water = 0;
            if (deltaT_water_total > 0 && Q_total_W > 0) {
                m_dot_water = Q_total_W / (c_p_water * deltaT_water_total); // kg/s
            } else if (Q_total_W > 0 && deltaT_water_total <= 0) {
                // Warning: water outlet temperature should be higher than inlet
                console.warn('Water outlet temperature must be higher than inlet temperature for heat transfer.');
            }
            
            // =========================================================
            // 热水流程计算（修正后的顺序）
            // 流程：过冷器与油冷却（并联）-> 冷凝器 -> 降低过热器
            // =========================================================
            // 根据流程图，热水流程与制冷剂流程重叠：
            // - 制冷剂：压缩机 -> 降低过热器 -> 冷凝器 -> 过冷器 -> 节流阀 -> 蒸发器
            // - 热水：过冷器与油冷却（并联）-> 冷凝器 -> 降低过热器
            // =========================================================
            
            const waterTemps = {};
            const approachWarnings = []; // Collect warnings for display
            
            // 第一步：过冷器与油冷却器并联（热水从入口分流，然后汇合）
            // 假设热水流量平均分配（如果两个都启用）
            let T_water_after_parallel = T_water_in;
            let Q_parallel_total_W = 0;
            
            // 1a. 过冷器（如果启用）
            if (isSubcoolerEnabled && Q_subcooler_W > 0) {
                // 计算过冷器需要的流量（假设平均分配，或根据换热量比例分配）
                // 简化处理：假设总流量平均分配到启用的并联换热器
                const num_parallel = (isSubcoolerEnabled ? 1 : 0) + (Q_oil_cooler_W > 0 ? 1 : 0);
                const m_dot_subcooler = num_parallel > 0 ? m_dot_water / num_parallel : m_dot_water;
                
                let T_water_out_subcooler = T_water_in;
                if (m_dot_subcooler > 0) {
                    const deltaT_subcooler = Q_subcooler_W / (m_dot_subcooler * c_p_water);
                    T_water_out_subcooler = T_water_in + deltaT_subcooler;
                }
                
                // 验证逼近温差约束
                const T_refrigerant_out_subcooler = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h_3_final, fluid) - 273.15;
                const actual_approach = T_refrigerant_out_subcooler - T_water_in;
                const max_water_inlet = T_refrigerant_out_subcooler - approach_subcooler;
                
                if (T_water_in > max_water_inlet || actual_approach < approach_subcooler) {
                    approachWarnings.push(`过冷器: 实际逼近温差(${actual_approach.toFixed(1)}K) 小于设定值(${approach_subcooler.toFixed(1)}K)`);
                }
                
                waterTemps.subcooler = {
                    inlet: T_water_in,
                    outlet: T_water_out_subcooler,
                    Q_kW: Q_subcooler_W / 1000,
                    approach: approach_subcooler,
                    approachSatisfied: T_water_in <= max_water_inlet
                };
                
                Q_parallel_total_W += Q_subcooler_W;
            } else if (isSubcoolerEnabled) {
                waterTemps.subcooler = {
                    inlet: T_water_in,
                    outlet: T_water_in,
                    Q_kW: Q_subcooler_W / 1000,
                    approach: approach_subcooler,
                    approachSatisfied: true
                };
            }
            
            // 1b. 油冷却器（始终启用）
            if (Q_oil_cooler_W > 0) {
                // 计算油冷却器需要的流量（假设平均分配）
                const num_parallel = (isSubcoolerEnabled ? 1 : 0) + 1;
                const m_dot_oil = num_parallel > 0 ? m_dot_water / num_parallel : m_dot_water;
                
                let T_water_out_oil = T_water_in;
                if (m_dot_oil > 0) {
                    const deltaT_oil = Q_oil_cooler_W / (m_dot_oil * c_p_water);
                    T_water_out_oil = T_water_in + deltaT_oil;
                }
                
                // 验证逼近温差约束
                const T_oil_out_est = T_2a_final_C - 20; // 估算油出口温度
                const actual_approach = T_oil_out_est - T_water_in;
                const max_water_inlet = T_oil_out_est - approach_oil_cooler;
                
                if (T_water_in > max_water_inlet || actual_approach < approach_oil_cooler) {
                    approachWarnings.push(`润滑系统油冷: 实际逼近温差(${actual_approach.toFixed(1)}K) 小于设定值(${approach_oil_cooler.toFixed(1)}K)`);
                }
                
                waterTemps.oil_cooler = {
                    inlet: T_water_in,
                    outlet: T_water_out_oil,
                    Q_kW: Q_oil_cooler_W / 1000,
                    approach: approach_oil_cooler,
                    approachSatisfied: T_water_in <= max_water_inlet
                };
                
                Q_parallel_total_W += Q_oil_cooler_W;
            } else {
                // 即使换热量为0，也记录油冷器状态（始终存在）
                waterTemps.oil_cooler = {
                    inlet: T_water_in,
                    outlet: T_water_in,
                    Q_kW: Q_oil_cooler_W / 1000,
                    approach: approach_oil_cooler,
                    approachSatisfied: true
                };
            }
            
            // 1c. 计算并联汇合后的热水温度（能量平衡）
            // 汇合温度 = (m1*T1 + m2*T2) / (m1 + m2)，简化后如果流量相等，则为平均温度
            if (m_dot_water > 0 && Q_parallel_total_W > 0) {
                // 根据总换热量计算汇合后的温度
                const deltaT_parallel = Q_parallel_total_W / (m_dot_water * c_p_water);
                T_water_after_parallel = T_water_in + deltaT_parallel;
            }
            
            // 第二步：冷凝器（使用汇合后的热水作为入口）
            let T_water_after_condenser = T_water_after_parallel;
            if (isCondenserEnabled && Q_cond_W > 0) {
                // 如果冷凝器是最后一个启用的换热器（没有降低过热器），其出水温度 = 用户输入的总出水温度
                if (!isDesuperheaterEnabled) {
                    T_water_after_condenser = T_water_out;
                } else {
                    // 主要计算：根据换热量和流量计算热水出口温度
                    if (m_dot_water > 0) {
                        const deltaT_cond = Q_cond_W / (m_dot_water * c_p_water);
                        T_water_after_condenser = T_water_after_parallel + deltaT_cond;
                    }
                }
                
                // 验证逼近温差约束
                // 对于冷凝器，逼近温差 = 冷凝温度 - 热水出口温度
                // 因为最小温差出现在热水出口端（逆流换热）
                const actual_approach = Tc_C - T_water_after_condenser;
                const max_water_outlet = Tc_C - approach_condenser;
                
                // 检查：实际逼近温差是否小于设定值
                if (actual_approach < approach_condenser) {
                    approachWarnings.push(`冷凝器: 实际逼近温差(${actual_approach.toFixed(1)}K) 小于设定值(${approach_condenser.toFixed(1)}K)，热水出口温度(${T_water_after_condenser.toFixed(1)}°C) 过高`);
                }
                
                waterTemps.condenser = {
                    inlet: T_water_after_parallel,
                    outlet: T_water_after_condenser,
                    Q_kW: Q_cond_W / 1000,
                    approach: approach_condenser,
                    approachSatisfied: actual_approach >= approach_condenser
                };
            }
            
            // 第三步：降低过热器（使用冷凝器出口的热水作为入口）
            if (isDesuperheaterEnabled && Q_desuperheater_W > 0) {
                // 降低过热器是最后一个，其出水温度 = 用户输入的总出水温度
                const T_water_out_desuper = T_water_out;
                
                // 验证逼近温差约束
                const actual_approach = T_2a_after_desuper_C - T_water_after_condenser;
                const max_water_inlet = T_2a_after_desuper_C - approach_desuperheater;
                
                if (T_water_after_condenser > max_water_inlet || actual_approach < approach_desuperheater) {
                    approachWarnings.push(`降低过热器: 实际逼近温差(${actual_approach.toFixed(1)}K) 小于设定值(${approach_desuperheater.toFixed(1)}K)`);
                }
                
                waterTemps.desuperheater = {
                    inlet: T_water_after_condenser,
                    outlet: T_water_out_desuper,
                    Q_kW: Q_desuperheater_W / 1000,
                    approach: approach_desuperheater,
                    approachSatisfied: T_water_after_condenser <= max_water_inlet
                };
            }
            
            // Update h_liq_out if subcooler is enabled
            const h_liq_out_final = isSubcoolerEnabled ? h_3_final : h_liq_out;
            
            // Recalculate Q_evap_W if subcooler changed h_liq_out
            // 仍然基于有用过热（h_1a）计算制冷量
            if (isSubcoolerEnabled) {
                Q_evap_W = m_dot_suc * (h_1a - h_liq_out_final);
                // 管道过热吸收的热量不变（与过冷器无关）
            }
            
            // 调试日志已移除（避免控制台错误）
            
            // =========================================================
            // 总排热计算（用于能量守恒验证）
            // =========================================================
            // 总排热量计算：使用能量守恒原理
            // =========================================================
            // 能量守恒：总排热量 = 制冷量 + 轴功率
            // 注意：摩擦热已包含在轴功率中，不应重复计算
            // 总排热量 = 冷凝器排热 + 摩擦热（油冷）+ 过冷器 + 降低过热器 + 缸头冷却排热
            const Q_total_rejected_W = Q_cond_W + Q_oil_cooler_W + Q_subcooler_W + Q_desuperheater_W + Q_cylinder_head_W;
            
            // 验证：总排热量应该等于能量守恒值
            const Q_heating_expected = Q_evap_W + W_shaft_W;
            const balance_error = Math.abs(Q_total_rejected_W - Q_heating_expected);
            const balance_error_percent = Q_heating_expected > 0 ? (balance_error / Q_heating_expected) * 100 : 0;
            if (balance_error_percent > 0.1) { // 如果误差超过0.1%，记录警告
                console.warn(`[RCC Pro] 热平衡误差: ${(balance_error/1000).toFixed(2)} kW (${balance_error_percent.toFixed(2)}%)`);
                console.warn(`  总排热量（能量守恒）: ${(Q_heating_expected/1000).toFixed(2)} kW = 制冷量 ${(Q_evap_W/1000).toFixed(2)} kW + 轴功率 ${(W_shaft_W/1000).toFixed(2)} kW`);
                console.warn(`  总排热量（分项求和）: ${(Q_total_rejected_W/1000).toFixed(2)} kW`);
            }
            
            // =========================================================
            // 可利用供热计算（工程实际应用）
            // =========================================================
            // 可利用供热 = 冷凝器 + 油冷 + 过冷器 + 降低过热器
            // 注意：缸头冷却温度较低（30-50°C），通常不直接用于供热，因此不计入可利用供热
            const Q_heating_usable_W = Q_cond_W + Q_oil_cooler_W + Q_subcooler_W + Q_desuperheater_W;
            
            // 为了向后兼容，保留 Q_heating_total_W 作为总排热
            const Q_heating_total_W = Q_total_rejected_W;
            // 调试日志已移除（避免控制台错误）

            // COP 计算使用轴功率
            // 修复：防止除以零导致 -Infinity
            // 注意：COP_H 使用可利用供热（更符合工程实际）
            const COP_R = W_shaft_W > 0 ? (Q_evap_W / W_shaft_W) : 0;
            const COP_H = W_shaft_W > 0 ? (Q_heating_usable_W / W_shaft_W) : 0;
            const COP_H_total = W_shaft_W > 0 ? (Q_total_rejected_W / W_shaft_W) : 0; // 总排热COP（用于参考）


            // --- Chart ---
            // Note: h_3_final and h_liq_out_final are calculated after water circuit section
            // We need to ensure they are available here
            
            // =========================================================
            // RCC Pro: 计算用于显示的排气状态（考虑缸头冷却）
            // =========================================================
            // 注意：如果启用缸头冷却，点2显示降低后的排气温度
            const T_2_display_C = (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) 
                ? T_2a_after_head_cooling_C 
                : T_2a_final_C;
            const h_2_display = (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0)
                ? h_2a_after_head_cooling
                : h_2a_final;
            const desc_2 = (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0)
                ? 'Discharge (After Head Cooling)'
                : 'Discharge';
            
            const point = (name, h_j, p_pa, pos='top') => ({ name, value: [h_j/1000, p_pa/1e5], label: { position: pos, show: true } });
            
            const pt1 = point('1', h_1, Pe_Pa, 'bottom');
            // 如果启用缸头冷却，使用降低后的排气状态
            const pt2 = point('2', h_2_display, Pc_Pa, 'top');
            let pt2b = null;
            if (isDesuperheaterEnabled) {
                pt2b = point('2b', h_2a_after_desuper, Pc_Pa, 'top');
            }
            // Point 3: Condenser outlet (before subcooler if enabled)
            const pt3 = point('3', h_3, Pc_Pa, 'top');
            let pt3p = null;
            // Point 3': After subcooler (if enabled)
            if (isSubcoolerEnabled) {
                pt3p = point("3'", h_3_final, Pc_Pa, 'top');
            }
            // Point 4: Isenthalpic expansion from point 3' (if subcooler) or point 3
            const pt4 = point('4', h_liq_out_final, Pe_Pa, 'bottom'); 
            
            const mainPoints = [pt1, pt2];
            if (pt2b) mainPoints.push(pt2b);
            mainPoints.push(pt3);
            if (pt3p) mainPoints.push(pt3p);
            mainPoints.push(pt4, pt1);

            // 生成饱和线数据
            const satLinesPH = generateSaturationLinesPH(fluid, Pe_Pa, Pc_Pa);
            const satLinesTS = generateSaturationLinesTS(fluid, Te_C, Tc_C);
            
            // 生成 T-s 图数据点（使用新的路径生成函数）
            const mainPointsTS = generateTSPathM7(fluid, {
                h_1: h_1,
                h_2: h_2a_final,
                h_2b: isDesuperheaterEnabled ? h_2a_after_desuper : undefined,
                h_3: h_3,
                h_3p: isSubcoolerEnabled ? h_3_final : undefined,
                h_4: h_liq_out_final,
                Pe_Pa: Pe_Pa,
                Pc_Pa: Pc_Pa,
                Te_C: Te_C,
                Tc_C: Tc_C,
                isDesuperheaterEnabled: isDesuperheaterEnabled,
                isSubcoolerEnabled: isSubcoolerEnabled
            });
            
            // 保存图表数据以便切换
            lastCalculationData = lastCalculationData || {};
            lastCalculationData.chartData = {
                chartType: 'ph', // 默认显示 P-h 图
                fluid,
                mainPoints,
                mainPointsTS,
                satLinesPH,
                satLinesTS
            };
            
            // 绘制 P-h 图（默认）
            ['chart-desktop-m7', 'chart-mobile-m7'].forEach(id => {
                drawPHDiagram(id, {
                    title: `P-h Diagram (${fluid})`,
                    mainPoints, 
                    saturationLiquidPoints: satLinesPH.liquidPH,
                    saturationVaporPoints: satLinesPH.vaporPH,
                    xLabel: 'Enthalpy (kJ/kg)', 
                    yLabel: 'Pressure (bar)'
                });
            });

            // 绘制系统示意图
            // 先收集节点数据（在statePoints创建之前需要的数据）
            // 图表显示使用总过热（压缩机吸气状态）
            // 如果总过热=0，使用饱和温度；否则使用 Te_C + total_superheat_K
            const T_1_C_diagram = (total_superheat_K <= 0) ? Te_C : (Te_C + total_superheat_K);
            const T_4_C_diagram = CP_INSTANCE.PropsSI('T','P',Pe_Pa,'H',h_liq_out_final,fluid) - 273.15;
            const T_3_final_C_diagram = isSubcoolerEnabled ? (CP_INSTANCE.PropsSI('T','P',Pc_Pa,'H',h_3_final,fluid)-273.15) : (T_3_K-273.15);
            
            // 点3：冷凝器出口（过冷器前）
            const T_3_C_diagram = T_3_K - 273.15;
            
            const nodeDataForDiagram = {
                point1: {
                    T: T_1_C_diagram,
                    P: Pe_Pa / 1e5,
                    h: h_1 / 1000
                },
                point2: {
                    T: T_2_display_C,
                    P: Pc_Pa / 1e5,
                    h: h_2_display / 1000
                },
                point3: {
                    T: T_3_C_diagram,
                    P: Pc_Pa / 1e5,
                    h: h_3 / 1000
                },
                point4: {
                    T: T_4_C_diagram,
                    P: Pe_Pa / 1e5,
                    h: h_liq_out_final / 1000
                },
                isDesuperheaterEnabled: isDesuperheaterEnabled,
                isSubcoolerEnabled: isSubcoolerEnabled,
                isOilCoolerEnabled: isOilCoolerEnabled,
                isCylinderHeadCoolingEnabled: isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0,
                water: m_dot_water > 0 ? {
                    inlet: T_water_in,
                    outlet: T_water_out
                } : null
            };

            // Add point 2b if desuperheater is enabled
            if (isDesuperheaterEnabled) {
                nodeDataForDiagram.point2b = {
                    T: T_2a_after_desuper_C,
                    P: Pc_Pa / 1e5,
                    h: h_2a_after_desuper / 1000
                };
            }

            // Add point 3' if subcooler is enabled
            if (isSubcoolerEnabled) {
                const T_3p_C = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h_3_final, fluid) - 273.15;
                nodeDataForDiagram.point3p = {
                    T: T_3p_C,
                    P: Pc_Pa / 1e5,
                    h: h_3_final / 1000
                };
            }

            // 添加热水回路各节点温度信息
            if (m_dot_water > 0 && waterTemps) {
                nodeDataForDiagram.waterTemps = {};
                if (isSubcoolerEnabled && waterTemps.subcooler) {
                    nodeDataForDiagram.waterTemps.subcooler = {
                        inlet: waterTemps.subcooler.inlet,
                        outlet: waterTemps.subcooler.outlet,
                        flow: m_dot_water
                    };
                }
                // 油冷始终存在，记录其状态
                if (waterTemps.oil_cooler) {
                    nodeDataForDiagram.waterTemps.oil_cooler = {
                        inlet: waterTemps.oil_cooler.inlet,
                        outlet: waterTemps.oil_cooler.outlet,
                        flow: m_dot_water
                    };
                }
                if (isCondenserEnabled && waterTemps.condenser) {
                    nodeDataForDiagram.waterTemps.condenser = {
                        inlet: waterTemps.condenser.inlet,
                        outlet: waterTemps.condenser.outlet,
                        flow: m_dot_water
                    };
                }
                if (isDesuperheaterEnabled && waterTemps.desuperheater) {
                    nodeDataForDiagram.waterTemps.desuperheater = {
                        inlet: waterTemps.desuperheater.inlet,
                        outlet: waterTemps.desuperheater.outlet,
                        flow: m_dot_water
                    };
                }
            }

            // 绘制系统示意图（桌面和移动端）
            ['system-diagram-m7', 'system-diagram-m7-mobile'].forEach(id => {
                const diagramContainer = document.getElementById(id);
                if (diagramContainer) {
                    diagramContainer.classList.remove('hidden');
                    drawSystemDiagramM7(id, nodeDataForDiagram);
                }
            });

            // --- HTML Table ---
            // 注意：T_2_display_C, h_2_display, desc_2 已在前面定义（第1295-1305行）
            // 点1：压缩机吸气口（基于总过热）
            const T_1_C = T_1_K - 273.15;
            const statePoints = [
                { name: '1', desc: 'Compressor Suction', temp: T_1_C.toFixed(1), press: (Pe_Pa/1e5).toFixed(2), enth: (h_1/1000).toFixed(1), flow: m_dot_suc.toFixed(3) },
                { name: '2', desc: desc_2, temp: T_2_display_C.toFixed(1), press: (Pc_Pa/1e5).toFixed(2), enth: (h_2_display/1000).toFixed(1), flow: m_dot_suc.toFixed(3) }
            ];
            
            if (isDesuperheaterEnabled) {
                statePoints.push({ name: '2b', desc: 'After Desuperheater', temp: T_2a_after_desuper_C.toFixed(1), press: (Pc_Pa/1e5).toFixed(2), enth: (h_2a_after_desuper/1000).toFixed(1), flow: m_dot_suc.toFixed(3) });
            }
            
            const T_3_final_C = isSubcoolerEnabled ? (CP_INSTANCE.PropsSI('T','P',Pc_Pa,'H',h_3_final,fluid)-273.15) : (T_3_K-273.15);
            const desc_3 = isSubcoolerEnabled ? 'Subcooler Out' : 'Cond Out';
            
            // 修复：计算 POINT 4 温度，添加错误处理防止 Infinity
            let T_4_C = 0;
            try {
                const T_4_K = CP_INSTANCE.PropsSI('T','P',Pe_Pa,'H',h_liq_out_final,fluid);
                if (isFinite(T_4_K) && T_4_K > 0) {
                    T_4_C = T_4_K - 273.15;
                } else {
                    // 如果计算失败，使用蒸发温度作为近似值
                    T_4_C = Te_C;
                    console.warn(`[RCC Pro] Failed to calculate Point 4 temperature, using evaporation temperature ${Te_C}°C as approximation.`);
                }
            } catch (e) {
                // 如果 CoolProp 计算失败，使用蒸发温度作为近似值
                T_4_C = Te_C;
                console.warn(`[RCC Pro] Error calculating Point 4 temperature: ${e.message}, using evaporation temperature ${Te_C}°C as approximation.`);
            }
            
            statePoints.push(
                { name: '3', desc: desc_3, temp: T_3_final_C.toFixed(1), press: (Pc_Pa/1e5).toFixed(2), enth: (h_3_final/1000).toFixed(1), flow: m_dot_suc.toFixed(3) },
                { name: '4', desc: 'Evap In', temp: T_4_C.toFixed(1), press: (Pe_Pa/1e5).toFixed(2), enth: (h_liq_out_final/1000).toFixed(1), flow: m_dot_suc.toFixed(3) }
            );

            // Render
            const displayEtaV = eta_v_display !== null ? eta_v_display.toFixed(3) : "---";
            const displayEtaS = eta_s_display !== null ? eta_s_display.toFixed(3) : "---";

            // Water Circuit Info HTML
            let waterCircuitHtml = '';
            if (m_dot_water > 0) {
                const m_dot_water_m3h = m_dot_water * 3600 / 1000; // Convert to m³/h
                waterCircuitHtml = `
                    <div class="space-y-1 bg-cyan-50/40 p-4 rounded-2xl border border-cyan-200/50 shadow-inner mt-4">
                        ${createSectionHeader('Water Circuit', '💧')}
                        ${createDetailRow('Water Flow Rate', `${m_dot_water.toFixed(3)} kg/s (${m_dot_water_m3h.toFixed(2)} m³/h)`, true)}
                        ${createDetailRow('Water Inlet Temp', `${T_water_in.toFixed(1)} °C`)}
                        ${createDetailRow('Water Outlet Temp', `${T_water_out.toFixed(1)} °C`)}
                        ${createDetailRow('Total Heat Transfer', `${(Q_total_W/1000).toFixed(2)} kW`)}
                    </div>
                `;
                
                // Heat Exchanger Details (Simple)
                const heDetails = [];
                if (isSubcoolerEnabled && waterTemps.subcooler) {
                    heDetails.push(`<div class="text-xs py-1 border-b border-cyan-100"><span class="font-semibold text-cyan-700">Subcooler:</span> ${waterTemps.subcooler.Q_kW.toFixed(2)} kW | Water: ${waterTemps.subcooler.inlet.toFixed(1)} → ${waterTemps.subcooler.outlet.toFixed(1)} °C</div>`);
                }
                // 油冷始终存在，显示其状态
                if (waterTemps.oil_cooler) {
                    heDetails.push(`<div class="text-xs py-1 border-b border-cyan-100"><span class="font-semibold text-cyan-700">Oil Cooler:</span> ${waterTemps.oil_cooler.Q_kW.toFixed(2)} kW | Water: ${waterTemps.oil_cooler.inlet.toFixed(1)} → ${waterTemps.oil_cooler.outlet.toFixed(1)} °C</div>`);
                }
                if (isCondenserEnabled && waterTemps.condenser) {
                    heDetails.push(`<div class="text-xs py-1 border-b border-cyan-100"><span class="font-semibold text-cyan-700">Condenser:</span> ${waterTemps.condenser.Q_kW.toFixed(2)} kW | Water: ${waterTemps.condenser.inlet.toFixed(1)} → ${waterTemps.condenser.outlet.toFixed(1)} °C</div>`);
                }
                if (isDesuperheaterEnabled && waterTemps.desuperheater) {
                    heDetails.push(`<div class="text-xs py-1"><span class="font-semibold text-cyan-700">Desuperheater:</span> ${waterTemps.desuperheater.Q_kW.toFixed(2)} kW | Water: ${waterTemps.desuperheater.inlet.toFixed(1)} → ${waterTemps.desuperheater.outlet.toFixed(1)} °C</div>`);
                }
                
                if (heDetails.length > 0) {
                    waterCircuitHtml += `
                        <div class="bg-cyan-50/40 p-3 rounded-xl border border-cyan-200/50 mt-3">
                            <div class="text-xs font-bold text-cyan-700 mb-2">Heat Exchanger Details:</div>
                            ${heDetails.join('')}
                        </div>
                    `;
                }
                
                // Add approach temperature warnings if any
                if (approachWarnings.length > 0) {
                    waterCircuitHtml += `
                        <div class="bg-amber-50/60 p-3 rounded-xl border border-amber-300/50 mt-3">
                            <div class="text-xs font-bold text-amber-800 mb-2 flex items-center gap-2">
                                <span>⚠️ 逼近温差约束警告</span>
                            </div>
                            <div class="text-xs text-amber-700 space-y-1">
                                ${approachWarnings.map(w => `<div>• ${w}</div>`).join('')}
                            </div>
                            <div class="text-xs text-amber-600 mt-2 italic">
                                提示: 逼近温差是设计约束条件，当前计算结果可能不满足换热器设计要求。建议调整热水流量或换热器参数。
                            </div>
                        </div>
                    `;
                }
                
                // Heat Exchanger Selection Parameters (Detailed for manufacturer)
                const heSelectionParams = [];
                
                // 1. Subcooler (过冷器) Selection Parameters
                if (isSubcoolerEnabled && Q_subcooler_W > 0) {
                    const T_refrigerant_in_subcooler = T_3_K - 273.15; // Condenser outlet temperature
                    const T_refrigerant_out_subcooler = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h_3_final, fluid) - 273.15;
                    const m_dot_refrigerant_subcooler = m_dot_suc; // kg/s
                    const m_dot_refrigerant_subcooler_kg_h = m_dot_refrigerant_subcooler * 3600;
                    
                    heSelectionParams.push(`
                        <div class="bg-white/60 p-4 rounded-xl border border-cyan-300/50 mb-3">
                            <div class="text-sm font-bold text-cyan-800 mb-3 flex items-center gap-2">
                                <span>🔧 过冷器 (Subcooler) 选型参数</span>
                            </div>
                            <div class="grid grid-cols-2 gap-3 text-xs">
                                <div class="space-y-2">
                                    <div class="font-semibold text-gray-700 mb-1">换热量:</div>
                                    <div class="pl-2">${(Q_subcooler_W/1000).toFixed(2)} kW</div>
                                    <div class="font-semibold text-gray-700 mb-1 mt-2">制冷剂侧 (R717):</div>
                                    <div class="pl-2 space-y-1">
                                        <div>入口温度: ${T_refrigerant_in_subcooler.toFixed(1)} °C</div>
                                        <div>出口温度: ${T_refrigerant_out_subcooler.toFixed(1)} °C</div>
                                        <div>压力: ${(Pc_Pa/1e5).toFixed(2)} bar</div>
                                        <div>流量: ${m_dot_refrigerant_subcooler.toFixed(3)} kg/s (${m_dot_refrigerant_subcooler_kg_h.toFixed(2)} kg/h)</div>
                                        <div>状态: 过冷液体</div>
                                    </div>
                                </div>
                                <div class="space-y-2">
                                    <div class="font-semibold text-gray-700 mb-1">热水侧:</div>
                                    <div class="pl-2 space-y-1">
                                        <div>入口温度: ${waterTemps.subcooler.inlet.toFixed(1)} °C</div>
                                        <div>出口温度: ${waterTemps.subcooler.outlet.toFixed(1)} °C</div>
                                        <div>流量: ${m_dot_water.toFixed(3)} kg/s (${(m_dot_water*3600/1000).toFixed(2)} m³/h)</div>
                                        <div>温升: ${(waterTemps.subcooler.outlet - waterTemps.subcooler.inlet).toFixed(1)} K</div>
                                    </div>
                                    <div class="font-semibold text-gray-700 mb-1 mt-2">设计参数:</div>
                                    <div class="pl-2 space-y-1">
                                        <div>逼近温差: ${approach_subcooler.toFixed(1)} K</div>
                                        <div>传热方式: 液-液换热</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `);
                }
                
                // 2. Oil Cooler (油冷) Selection Parameters - 无论是否启用都显示选型参数
                if (Q_oil_W > 0) {
                    const T_oil_in_est = T_2a_final_C; // Oil temperature at compressor discharge
                    const T_oil_out_est = T_2a_final_C - 20; // Estimated oil outlet temperature
                    const m_dot_oil_est = m_dot_suc * 0.1; // Estimated oil flow (10% of refrigerant flow)
                    const m_dot_oil_est_kg_h = m_dot_oil_est * 3600;
                    
                    // 油冷始终启用，使用实际换热量
                    const oilCoolerQ_kW = Q_oil_cooler_W / 1000;
                    const hasWaterTemps = waterTemps.oil_cooler !== undefined;
                    
                    let waterSideHtml = '';
                    if (hasWaterTemps) {
                        // 启用状态：显示热水侧信息
                        waterSideHtml = `
                            <div class="font-semibold text-gray-700 mb-1">热水侧:</div>
                            <div class="pl-2 space-y-1">
                                <div>入口温度: ${waterTemps.oil_cooler.inlet.toFixed(1)} °C</div>
                                <div>出口温度: ${waterTemps.oil_cooler.outlet.toFixed(1)} °C</div>
                                <div>流量: ${m_dot_water.toFixed(3)} kg/s (${(m_dot_water*3600/1000).toFixed(2)} m³/h)</div>
                                <div>温升: ${(waterTemps.oil_cooler.outlet - waterTemps.oil_cooler.inlet).toFixed(1)} K</div>
                            </div>
                        `;
                    } else {
                        // 未启用状态：显示备注说明
                        waterSideHtml = `
                            <div class="font-semibold text-gray-700 mb-1">冷却侧:</div>
                            <div class="pl-2 space-y-1">
                                <div class="text-amber-700 font-semibold">⚠️ 需要外配冷源</div>
                                <div class="text-gray-600 italic text-xs mt-1">
                                    建议：尽量应用油冷热量至热水回路以提高供热量与系统能效
                                </div>
                                <div class="text-gray-500 text-xs mt-2">
                                    如需外配冷却，请根据油侧参数选择合适的冷却器
                                </div>
                            </div>
                        `;
                    }
                    
                    heSelectionParams.push(`
                        <div class="bg-white/60 p-4 rounded-xl border border-cyan-300/50 mb-3">
                            <div class="text-sm font-bold text-cyan-800 mb-3 flex items-center gap-2">
                                <span>🔧 润滑系统油冷 (Lubrication Oil Cooler) 选型参数</span>
                                <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">始终启用</span>
                            </div>
                            <div class="text-xs text-gray-600 mb-2 italic bg-blue-50 p-2 rounded">
                                <strong>重要说明：</strong>GEA 活塞压缩机的油冷系统仅用于冷却润滑系统（轴承、曲轴、轴封），
                                带走摩擦热（约6%轴功率）。压缩气体的热量主要留在气体中，通过冷凝器/降低过热器排出。
                                这与喷油螺杆压缩机的"喷油冷却"原理完全不同。
                            </div>
                            <div class="grid grid-cols-2 gap-3 text-xs">
                                <div class="space-y-2">
                                    <div class="font-semibold text-gray-700 mb-1">换热量:</div>
                                    <div class="pl-2">${oilCoolerQ_kW.toFixed(2)} kW</div>
                                    <div class="font-semibold text-gray-700 mb-1 mt-2">油侧 (润滑系统):</div>
                                    <div class="pl-2 space-y-1">
                                        <div>入口温度: ${T_oil_in_est.toFixed(1)} °C (估算)</div>
                                        <div>出口温度: ${T_oil_out_est.toFixed(1)} °C (估算)</div>
                                        <div>流量: ${m_dot_oil_est.toFixed(3)} kg/s (${m_dot_oil_est_kg_h.toFixed(2)} kg/h) (估算)</div>
                                        <div>介质: 润滑油 (ISO VG 68)</div>
                                        <div class="text-xs text-gray-500 italic mt-1">仅带走摩擦热，不用于冷却压缩气体</div>
                                    </div>
                                </div>
                                <div class="space-y-2">
                                    ${waterSideHtml}
                                    <div class="font-semibold text-gray-700 mb-1 mt-2">设计参数:</div>
                                    <div class="pl-2 space-y-1">
                                        <div>逼近温差: ${approach_oil_cooler.toFixed(1)} K</div>
                                        <div>传热方式: 油-水换热</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `);
                }
                
                // 3. Condenser (冷凝器) Selection Parameters
                if (isCondenserEnabled && Q_cond_W > 0) {
                    const T_refrigerant_in_cond = isDesuperheaterEnabled ? T_2a_after_desuper_C : T_2a_final_C;
                    const T_refrigerant_out_cond = T_3_K - 273.15;
                    const m_dot_refrigerant_cond = m_dot_suc;
                    const m_dot_refrigerant_cond_kg_h = m_dot_refrigerant_cond * 3600;
                    
                    heSelectionParams.push(`
                        <div class="bg-white/60 p-4 rounded-xl border border-cyan-300/50 mb-3">
                            <div class="text-sm font-bold text-cyan-800 mb-3 flex items-center gap-2">
                                <span>🔧 冷凝器 (Condenser) 选型参数</span>
                            </div>
                            <div class="grid grid-cols-2 gap-3 text-xs">
                                <div class="space-y-2">
                                    <div class="font-semibold text-gray-700 mb-1">换热量:</div>
                                    <div class="pl-2">${(Q_cond_W/1000).toFixed(2)} kW</div>
                                    <div class="font-semibold text-gray-700 mb-1 mt-2">制冷剂侧 (R717):</div>
                                    <div class="pl-2 space-y-1">
                                        <div>入口温度: ${T_refrigerant_in_cond.toFixed(1)} °C</div>
                                        <div>冷凝温度: ${Tc_C.toFixed(1)} °C</div>
                                        <div>出口温度: ${T_refrigerant_out_cond.toFixed(1)} °C</div>
                                        <div>压力: ${(Pc_Pa/1e5).toFixed(2)} bar</div>
                                        <div>流量: ${m_dot_refrigerant_cond.toFixed(3)} kg/s (${m_dot_refrigerant_cond_kg_h.toFixed(2)} kg/h)</div>
                                        <div>状态: 过热蒸汽 → 饱和液体</div>
                                    </div>
                                </div>
                                <div class="space-y-2">
                                    <div class="font-semibold text-gray-700 mb-1">热水侧:</div>
                                    <div class="pl-2 space-y-1">
                                        <div>入口温度: ${waterTemps.condenser.inlet.toFixed(1)} °C</div>
                                        <div>出口温度: ${waterTemps.condenser.outlet.toFixed(1)} °C</div>
                                        <div>流量: ${m_dot_water.toFixed(3)} kg/s (${(m_dot_water*3600/1000).toFixed(2)} m³/h)</div>
                                        <div>温升: ${(waterTemps.condenser.outlet - waterTemps.condenser.inlet).toFixed(1)} K</div>
                                    </div>
                                    <div class="font-semibold text-gray-700 mb-1 mt-2">设计参数:</div>
                                    <div class="pl-2 space-y-1">
                                        <div>逼近温差: ${approach_condenser.toFixed(1)} K</div>
                                        <div>传热方式: 冷凝-水换热</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `);
                }
                
                // 4. Desuperheater (降低过热器) Selection Parameters
                if (isDesuperheaterEnabled && Q_desuperheater_W > 0) {
                    // 降低过热器的入口温度应该是缸头冷却后的排气温度（如果启用）
                    const T_refrigerant_in_desuper = (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0)
                        ? T_2a_after_head_cooling_C
                        : T_2a_final_C;
                    const T_refrigerant_out_desuper = T_2a_after_desuper_C;
                    const m_dot_refrigerant_desuper = m_dot_suc;
                    const m_dot_refrigerant_desuper_kg_h = m_dot_refrigerant_desuper * 3600;
                    
                    heSelectionParams.push(`
                        <div class="bg-white/60 p-4 rounded-xl border border-cyan-300/50 mb-3">
                            <div class="text-sm font-bold text-cyan-800 mb-3 flex items-center gap-2">
                                <span>🔧 降低过热器 (Desuperheater) 选型参数</span>
                            </div>
                            <div class="grid grid-cols-2 gap-3 text-xs">
                                <div class="space-y-2">
                                    <div class="font-semibold text-gray-700 mb-1">换热量:</div>
                                    <div class="pl-2">${(Q_desuperheater_W/1000).toFixed(2)} kW</div>
                                    <div class="font-semibold text-gray-700 mb-1 mt-2">制冷剂侧 (R717):</div>
                                    <div class="pl-2 space-y-1">
                                        <div>入口温度: ${T_refrigerant_in_desuper.toFixed(1)} °C</div>
                                        <div>出口温度: ${T_refrigerant_out_desuper.toFixed(1)} °C</div>
                                        <div>压力: ${(Pc_Pa/1e5).toFixed(2)} bar</div>
                                        <div>流量: ${m_dot_refrigerant_desuper.toFixed(3)} kg/s (${m_dot_refrigerant_desuper_kg_h.toFixed(2)} kg/h)</div>
                                        <div>状态: 过热蒸汽</div>
                                    </div>
                                </div>
                                <div class="space-y-2">
                                    <div class="font-semibold text-gray-700 mb-1">热水侧:</div>
                                    <div class="pl-2 space-y-1">
                                        <div>入口温度: ${waterTemps.desuperheater.inlet.toFixed(1)} °C</div>
                                        <div>出口温度: ${waterTemps.desuperheater.outlet.toFixed(1)} °C</div>
                                        <div>流量: ${m_dot_water.toFixed(3)} kg/s (${(m_dot_water*3600/1000).toFixed(2)} m³/h)</div>
                                        <div>温升: ${(waterTemps.desuperheater.outlet - waterTemps.desuperheater.inlet).toFixed(1)} K</div>
                                    </div>
                                    <div class="font-semibold text-gray-700 mb-1 mt-2">设计参数:</div>
                                    <div class="pl-2 space-y-1">
                                        <div>逼近温差: ${approach_desuperheater.toFixed(1)} K</div>
                                        <div>目标排气温度: ${T_desuperheater_target.toFixed(1)} °C</div>
                                        <div>传热方式: 过热蒸汽-水换热</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `);
                }
                
                // 4. Cylinder Head Cooling (缸头冷却) Selection Parameters
                if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) {
                    const T_head_water_in = parseFloat(cylinderHeadWaterInletTempM7?.value) || 30;
                    const T_head_water_out = parseFloat(cylinderHeadWaterOutletTempM7?.value) || 35;
                    const c_p_water = 4186; // J/(kg·K)
                    const m_dot_head_water = Q_cylinder_head_W / (c_p_water * (T_head_water_out - T_head_water_in));
                    const m_dot_head_water_m3_h = m_dot_head_water * 3600 / 1000;
                    
                    heSelectionParams.push(`
                        <div class="bg-white/70 rounded-xl p-4 border-2 border-amber-300/50 mb-3">
                            <div class="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
                                <span>🔧 缸头冷却 (Cylinder Head Cooling)</span>
                            </div>
                            <div class="grid grid-cols-2 gap-4 text-xs">
                                <div class="space-y-2">
                                    <div class="font-semibold text-gray-700 mb-1">冷却水侧:</div>
                                    <div class="pl-2 space-y-1">
                                        <div>入口温度: ${T_head_water_in.toFixed(1)} °C</div>
                                        <div>出口温度: ${T_head_water_out.toFixed(1)} °C</div>
                                        <div>流量: ${m_dot_head_water.toFixed(3)} kg/s (${m_dot_head_water_m3_h.toFixed(2)} m³/h)</div>
                                        <div>温升: ${(T_head_water_out - T_head_water_in).toFixed(1)} K</div>
                                    </div>
                                </div>
                                <div class="space-y-2">
                                    <div class="font-semibold text-gray-700 mb-1">设计参数:</div>
                                    <div class="pl-2 space-y-1">
                                        <div>换热量: ${(Q_cylinder_head_W/1000).toFixed(2)} kW</div>
                                        <div>排气温度降低: ${(T_2a_final_C - T_2a_after_head_cooling_C).toFixed(1)} °C</div>
                                        <div>传热方式: 水冷缸头 (Water-Cooled Cylinder Heads)</div>
                                        <div class="text-[10px] text-amber-700 font-semibold mt-1">⚠️ 安全要求: 进水温度 > (蒸发温度 + 10K)</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `);
                }
                
                // Add selection parameters section if any heat exchangers are enabled
                if (heSelectionParams.length > 0) {
                    waterCircuitHtml += `
                        <div class="bg-gradient-to-br from-cyan-50/60 to-blue-50/60 p-4 rounded-2xl border-2 border-cyan-300/50 mt-4">
                            <div class="text-sm font-bold text-cyan-900 mb-3 flex items-center gap-2">
                                <span>📋 换热器选型参数 (Heat Exchanger Selection Parameters)</span>
                            </div>
                            <div class="text-xs text-gray-600 mb-3 italic">
                                以下参数可用于提供给换热器厂家进行选型设计
                            </div>
                            ${heSelectionParams.join('')}
                        </div>
                    `;
                }
            }
            
            // 构建缸头冷却安全检查错误消息 HTML
            let cylinderHeadCoolingAlertHtml = '';
            if (cylinderHeadCoolingError) {
                cylinderHeadCoolingAlertHtml = `
                    <div class="bg-red-50/90 p-4 rounded-2xl border-2 border-red-500/70 shadow-lg mb-4">
                        <div class="flex items-start gap-3">
                            <div class="text-2xl">⚠️</div>
                            <div class="flex-1">
                                <div class="text-sm font-bold text-red-800 mb-2">${cylinderHeadCoolingError}</div>
                                <div class="text-xs text-red-700">
                                    <strong>安全说明：</strong>如果缸头冷却水温度过低，会导致吸气腔内结露甚至液化，引发严重的<strong>液击 (Liquid Hammer)</strong>风险，可能损坏压缩机。
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            // 构建排气温度警告/错误消息 HTML
            let dischargeTempAlertHtml = '';
            if (dischargeTempError) {
                // 危险错误：红色警告框
                dischargeTempAlertHtml = `
                    <div class="bg-red-50/90 p-4 rounded-2xl border-2 border-red-500/70 shadow-lg mb-4">
                        <div class="flex items-start gap-3">
                            <div class="text-2xl">🚨</div>
                            <div class="flex-1">
                                <div class="text-sm font-bold text-red-800 mb-2">${dischargeTempError}</div>
                                <div class="text-xs text-red-700 mb-2">
                                    <strong>操作点状态：</strong><span class="font-bold text-red-900">无效 (Invalid Operating Point)</span>
                                </div>
                                <div class="text-xs text-red-700 mb-2">
                                    <strong>建议：</strong>
                                    <ul class="list-disc list-inside ml-2 mt-1 space-y-1">
                                        <li>当前压力比对于单级压缩过高。请考虑使用<strong>两级压缩</strong>系统以降低排气温度。</li>
                                        <li>或者启用<strong>缸头冷却</strong>（可降低约15°C排气温度，带走约4%轴功率的热量）。</li>
                                        <li>或者使用<strong>喷液冷却</strong>（Liquid Injection）来降低排气温度。</li>
                                    </ul>
                                </div>
                                <div class="text-xs text-red-600 italic">
                                    注意：活塞压缩机与螺杆压缩机不同，无法通过调整油流量来降低排气温度。高排气温度通常意味着压力比超出单级压缩的合理范围。
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (dischargeTempWarning) {
                // 警告：黄色警告框
                dischargeTempAlertHtml = `
                    <div class="bg-amber-50/90 p-4 rounded-2xl border-2 border-amber-400/70 shadow-md mb-4">
                        <div class="flex items-start gap-3">
                            <div class="text-xl">⚠️</div>
                            <div class="flex-1">
                                <div class="text-sm font-semibold text-amber-800 mb-1">${dischargeTempWarning}</div>
                                <div class="text-xs text-amber-700">
                                    <strong>建议：</strong>
                                    <ul class="list-disc list-inside ml-2 mt-1 space-y-1">
                                        <li>请监控排气温度，确保不超过最大限制。</li>
                                        <li>如持续超过警告值，建议考虑启用<strong>缸头冷却</strong>（可降低约15°C排气温度，带走约4%轴功率的热量）。</li>
                                        <li>或考虑使用<strong>两级压缩</strong>系统以降低排气温度。</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            let html = `
                ${cylinderHeadCoolingAlertHtml}
                ${dischargeTempAlertHtml}
                <div class="grid grid-cols-2 gap-4 mb-6">
                    ${createKpiCard(i18next.t('components.coolingCapacity'), (Q_evap_W/1000).toFixed(2), 'kW', `COP: ${COP_R.toFixed(2)}`, 'blue')}
                    ${createKpiCard(i18next.t('components.heatingCapacity'), (Q_heating_usable_W/1000).toFixed(2), 'kW', `COP: ${COP_H.toFixed(2)}`, 'orange')}
                </div>
                <div class="mb-4 p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs">
                    <div class="font-semibold text-blue-800 mb-1">🌡️ 过热分析：</div>
                    <div class="text-blue-700 space-y-0.5">
                        <div>• <strong>有用过热</strong>: ${useful_superheat_K.toFixed(1)} K (蒸发器内过热，计入制冷量)</div>
                        <div>• <strong>管道过热</strong>: ${line_superheat_K.toFixed(1)} K (管道传热产生)</div>
                        <div>• <strong>总过热</strong>: ${total_superheat_K.toFixed(1)} K (压缩机吸气口过热)</div>
                        ${line_superheat_K > 0 ? `<div class="text-blue-600 italic mt-1">管道过热吸收热量: ${(Q_evap_line_W/1000).toFixed(2)} kW</div>` : ''}
                    </div>
                </div>
                ${Q_cylinder_head_W > 0 ? `
                <div class="mb-4 p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs">
                    <div class="font-semibold text-amber-800 mb-1">📊 热量统计说明：</div>
                    <div class="text-amber-700 space-y-0.5">
                        <div>• <strong>可利用供热</strong>: ${(Q_heating_usable_W/1000).toFixed(2)} kW (高品位热量，可直接用于供热)</div>
                        <div>• <strong>缸头冷却排热</strong>: ${(Q_cylinder_head_W/1000).toFixed(2)} kW (低品位热量，温度约30-50°C，通常不直接利用)</div>
                        <div>• <strong>总排热</strong>: ${(Q_total_rejected_W/1000).toFixed(2)} kW (用于能量守恒验证)</div>
                    </div>
                </div>
                ` : ''}
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

                    ${createSectionHeader('State Points Detail', '📊')}
                    ${createStateTable(statePoints)}
                </div>
                ${waterCircuitHtml}
            `;

            renderToAllViews(html);
            updateMobileSummary(i18next.t('mode2.coolingCapacity'), `${(Q_evap_W/1000).toFixed(1)} kW`, 'COP', COP_R.toFixed(2));
            openMobileSheet('m7');
            
            // Update water flow display
            if (waterFlowDisplayM7 && m_dot_water > 0) {
                const m_dot_water_m3h = m_dot_water * 3600 / 1000;
                waterFlowDisplayM7.textContent = `${m_dot_water.toFixed(3)} kg/s (${m_dot_water_m3h.toFixed(2)} m³/h)`;
            }
            
            // Update heat exchanger displays
            if (subcoolerQM7 && isSubcoolerEnabled) {
                subcoolerQM7.textContent = waterTemps.subcooler ? waterTemps.subcooler.Q_kW.toFixed(2) : '0.00';
                if (subcoolerWaterOutM7 && waterTemps.subcooler) {
                    subcoolerWaterOutM7.textContent = waterTemps.subcooler.outlet.toFixed(1);
                }
            } else if (subcoolerQM7) {
                subcoolerQM7.textContent = '--';
                if (subcoolerWaterOutM7) subcoolerWaterOutM7.textContent = '--';
            }
            
            // 油冷始终启用，更新显示
            if (oilCoolerQM7) {
                oilCoolerQM7.textContent = waterTemps.oil_cooler ? waterTemps.oil_cooler.Q_kW.toFixed(2) : '0.00';
                if (oilCoolerWaterOutM7 && waterTemps.oil_cooler) {
                    oilCoolerWaterOutM7.textContent = waterTemps.oil_cooler.outlet.toFixed(1);
                }
            }
            
            if (condenserQM7 && isCondenserEnabled) {
                condenserQM7.textContent = waterTemps.condenser ? waterTemps.condenser.Q_kW.toFixed(2) : '0.00';
                if (condenserWaterOutM7 && waterTemps.condenser) {
                    condenserWaterOutM7.textContent = waterTemps.condenser.outlet.toFixed(1);
                }
            } else if (condenserQM7) {
                condenserQM7.textContent = '--';
                if (condenserWaterOutM7) condenserWaterOutM7.textContent = '--';
            }
            
            if (desuperheaterQM7 && isDesuperheaterEnabled) {
                desuperheaterQM7.textContent = waterTemps.desuperheater ? waterTemps.desuperheater.Q_kW.toFixed(2) : '0.00';
                if (desuperheaterWaterOutM7 && waterTemps.desuperheater) {
                    desuperheaterWaterOutM7.textContent = waterTemps.desuperheater.outlet.toFixed(1);
                }
            } else if (desuperheaterQM7) {
                desuperheaterQM7.textContent = '--';
                if (desuperheaterWaterOutM7) desuperheaterWaterOutM7.textContent = '--';
            }
            
            // Update Cylinder Head Cooling display
            if (cylinderHeadQM7) {
                if (isCylinderHeadCoolingEnabled && !cylinderHeadCoolingError && Q_cylinder_head_W > 0) {
                    cylinderHeadQM7.textContent = (Q_cylinder_head_W / 1000).toFixed(2);
                } else {
                    cylinderHeadQM7.textContent = '--';
                }
            }
            
            setButtonFresh7();
            if(printButtonM7) printButtonM7.disabled = false;

            // 更新 lastCalculationData，保留图表数据
            lastCalculationData.fluid = fluid;
            lastCalculationData.statePoints = statePoints;
            lastCalculationData.COP_R = COP_R;
            lastCalculationData.COP_H = COP_H;
            lastCalculationData.COP_H_total = COP_H_total;
            lastCalculationData.Q_evap_W = Q_evap_W;
            lastCalculationData.Q_evap_line_W = Q_evap_line_W;
            lastCalculationData.Q_cond_W = Q_cond_W;
            lastCalculationData.Q_oil_W = Q_oil_W;
            lastCalculationData.Q_heating_usable_W = Q_heating_usable_W;
            lastCalculationData.Q_total_rejected_W = Q_total_rejected_W;
            lastCalculationData.Q_cylinder_head_W = Q_cylinder_head_W;
            lastCalculationData.useful_superheat_K = useful_superheat_K;
            lastCalculationData.total_superheat_K = total_superheat_K;
            lastCalculationData.line_superheat_K = line_superheat_K;
            lastCalculationData.waterCircuit = {
                m_dot_water,
                T_water_in,
                T_water_out,
                Q_total_W,
                heatExchangers: waterTemps
            };
            
            AppState.updateVSD(isVsdEnabled, ratedRpm, currentRpm);
            const inputState = SessionState.collectInputs('calc-form-mode-7');
            HistoryDB.add('M7', `${fluid} • ${(Q_evap_W/1000).toFixed(1)} kW`, inputState, { 'COP': COP_R.toFixed(2) });

        } catch (error) {
            renderToAllViews(createErrorCard(error.message));
            console.error(error);
            if(printButtonM7) printButtonM7.disabled = true;
        }
    }, 50);
}

// ... Init & Exports
export function initMode7(CP) {
    CP_INSTANCE = CP;
    calcButtonM7 = document.getElementById('calc-button-mode-7');
    calcFormM7 = document.getElementById('calc-form-mode-7');
    printButtonM7 = document.getElementById('print-button-mode-7');
    fluidSelectM7 = document.getElementById('fluid_m7');
    fluidInfoDivM7 = document.getElementById('fluid-info-m7');
    resultsDesktopM7 = document.getElementById('results-desktop-m7');
    resultsMobileM7 = document.getElementById('mobile-results-m7');
    summaryMobileM7 = document.getElementById('mobile-summary-m7');
    autoEffCheckboxM7 = document.getElementById('auto-eff-m7');
    tempEvapM7 = document.getElementById('temp_evap_m7');
    tempCondM7 = document.getElementById('temp_cond_m7');
    etaVM7 = document.getElementById('eta_v_m7');
    etaSM7 = document.getElementById('eta_s_m7');
    
    // Water Circuit Heat Exchangers
    waterInletTempM7 = document.getElementById('water_inlet_temp_m7');
    waterOutletTempM7 = document.getElementById('water_outlet_temp_m7');
    waterFlowDisplayM7 = document.getElementById('water_flow_display_m7');
    
    // Heat Exchanger Configs
    subcoolerEnabledM7 = document.getElementById('subcooler_enabled_m7');
    subcoolerApproachTempM7 = document.getElementById('subcooler_approach_temp_m7');
    subcoolerQM7 = document.getElementById('subcooler_q_m7');
    subcoolerWaterOutM7 = document.getElementById('subcooler_water_out_m7');
    
    // 修复：油冷不再需要用户选择，始终启用（摩擦热总是存在）
    oilCoolerApproachTempM7 = document.getElementById('oil_cooler_approach_temp_m7');
    oilCoolerQM7 = document.getElementById('oil_cooler_q_m7');
    oilCoolerWaterOutM7 = document.getElementById('oil_cooler_water_out_m7');
    
    condenserEnabledM7 = document.getElementById('condenser_enabled_m7');
    // 修复：冷凝器是必配项，禁用复选框并强制启用
    if (condenserEnabledM7) {
        condenserEnabledM7.checked = true;
        condenserEnabledM7.disabled = true;
        condenserEnabledM7.title = '冷凝器是必配项，不可禁用';
    }
    condenserApproachTempM7 = document.getElementById('condenser_approach_temp_m7');
    condenserQM7 = document.getElementById('condenser_q_m7');
    condenserWaterOutM7 = document.getElementById('condenser_water_out_m7');
    
    desuperheaterEnabledM7 = document.getElementById('desuperheater_enabled_m7');
    desuperheaterApproachTempM7 = document.getElementById('desuperheater_approach_temp_m7');
    desuperheaterTargetTempM7 = document.getElementById('desuperheater_target_temp_m7');
    desuperheaterQM7 = document.getElementById('desuperheater_q_m7');
    desuperheaterWaterOutM7 = document.getElementById('desuperheater_water_out_m7');
    
    // 初始化降低过热器目标温度（基于冷凝温度 + 2）
    if (tempCondM7 && desuperheaterTargetTempM7) {
        const tc = parseFloat(tempCondM7.value);
        if (!isNaN(tc)) desuperheaterTargetTempM7.value = (tc + 2).toFixed(1);
    }
    
    // Cylinder Head Cooling (缸头冷却)
    cylinderHeadCoolingEnabledM7 = document.getElementById('cylinder_head_cooling_enabled_m7');
    cylinderHeadWaterInletTempM7 = document.getElementById('cylinder_head_water_inlet_temp_m7');
    cylinderHeadWaterOutletTempM7 = document.getElementById('cylinder_head_water_outlet_temp_m7');
    cylinderHeadQM7 = document.getElementById('cylinder_head_q_m7');
    
    // VSD / Poly Inputs
    polyRefRpmInputM7 = document.getElementById('poly_ref_rpm_m7');
    polyRefDispInputM7 = document.getElementById('poly_ref_disp_m7');
    vsdCheckboxM7 = document.getElementById('enable_vsd_m7');
    ratedRpmInputM7 = document.getElementById('rated_rpm_m7');
    polyCorrectionPanelM7 = document.getElementById('poly-correction-panel-m7');

    // Compressor Model Selectors
    compressorBrandM7 = document.getElementById('compressor_brand_m7');
    compressorSeriesM7 = document.getElementById('compressor_series_m7');
    compressorModelM7 = document.getElementById('compressor_model_m7');
    modelDisplacementInfoM7 = document.getElementById('model_displacement_info_m7');
    modelDisplacementValueM7 = document.getElementById('model_displacement_value_m7');
    flowM3hM7 = document.getElementById('flow_m3h_m7');

    // 固定制冷剂为氨，并禁用选择器
    if (fluidSelectM7) {
        fluidSelectM7.value = 'R717';
        fluidSelectM7.disabled = true;
        fluidSelectM7.style.opacity = '0.6';
        fluidSelectM7.style.cursor = 'not-allowed';
    }

    // Initialize compressor model selectors
    if (compressorBrandM7 && compressorSeriesM7 && compressorModelM7) {
        initCompressorModelSelectorsM7();
        
        // 设置默认压缩机型号（调试用）
        setTimeout(() => {
            if (compressorBrandM7 && compressorSeriesM7 && compressorModelM7) {
                // 默认案例：GEA Grasso / Grasso 5HP (50 bar) / 35HP（与截图一致）
                compressorBrandM7.value = 'GEA Grasso';
                compressorBrandM7.dispatchEvent(new Event('change', { bubbles: true }));
                
                setTimeout(() => {
                    compressorSeriesM7.value = 'Grasso 5HP (50 bar)';
                    compressorSeriesM7.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    setTimeout(() => {
                        compressorModelM7.value = '35HP';
                        compressorModelM7.dispatchEvent(new Event('change', { bubbles: true }));
                    }, 50);
                }, 50);
            }
        }, 100);
    }

    if (calcFormM7) {
        calcFormM7.addEventListener('submit', (e) => { e.preventDefault(); calculateMode7(); });
        
        calcFormM7.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('input', setButtonStale7);
            input.addEventListener('change', setButtonStale7);
        });

        if (fluidSelectM7) {
            fluidSelectM7.addEventListener('change', () => updateFluidInfo(fluidSelectM7, fluidInfoDivM7, CP_INSTANCE));
        }
        
        [tempEvapM7, tempCondM7, autoEffCheckboxM7].forEach(el => {
            if(el) el.addEventListener('change', updateAndDisplayEfficienciesM7);
        });
        
        // 监听余隙容积输入变化
        // 修复：当余隙容积改变时，如果自动效率计算启用，立即更新效率
        const clearanceInputM7 = document.getElementById('clearance_volume_m7');
        if (clearanceInputM7) {
            clearanceInputM7.addEventListener('change', () => {
                // 如果自动效率计算启用，立即更新效率
                if (autoEffCheckboxM7 && autoEffCheckboxM7.checked) {
                    updateAndDisplayEfficienciesM7();
                }
                setButtonStale7();
            });
            // 也监听 input 事件，实现实时更新
            clearanceInputM7.addEventListener('input', () => {
                if (autoEffCheckboxM7 && autoEffCheckboxM7.checked) {
                    updateAndDisplayEfficienciesM7();
                }
            });
        }
        
        // Water circuit inputs - trigger recalculation
        [waterInletTempM7, waterOutletTempM7, 
         subcoolerEnabledM7, subcoolerApproachTempM7,
         oilCoolerApproachTempM7,
         condenserEnabledM7, condenserApproachTempM7,
         desuperheaterEnabledM7, desuperheaterApproachTempM7, desuperheaterTargetTempM7,
         cylinderHeadCoolingEnabledM7, cylinderHeadWaterInletTempM7, cylinderHeadWaterOutletTempM7].forEach(el => {
            if(el) el.addEventListener('change', setButtonStale7);
        });
        
        // 冷凝温度改变时，自动更新降低过热器目标温度（默认 Tc + 2°C）
        if (tempCondM7 && desuperheaterTargetTempM7) {
            let isAutoAdjustingDesuper = true; // 标记是否应该自动调整
            
            // 监听降低过热器目标温度的手动输入（用户开始编辑时，暂停自动调整）
            desuperheaterTargetTempM7.addEventListener('focus', () => {
                isAutoAdjustingDesuper = false;
            });
            
            // 监听降低过热器目标温度的手动修改完成
            desuperheaterTargetTempM7.addEventListener('change', () => {
                // 用户手动修改后，检查是否与自动计算值一致
                const tc = parseFloat(tempCondM7.value);
                const expected = tc + 2;
                const current = parseFloat(desuperheaterTargetTempM7.value);
                // 如果用户输入的值与自动计算值接近（±0.5°C），则恢复自动调整
                if (!isNaN(tc) && !isNaN(current) && Math.abs(current - expected) <= 0.5) {
                    isAutoAdjustingDesuper = true;
                } else {
                    isAutoAdjustingDesuper = false;
                }
            });
            
            // 监听冷凝温度改变
            tempCondM7.addEventListener('change', () => {
                const tc = parseFloat(tempCondM7.value);
                if (!isNaN(tc) && isAutoAdjustingDesuper) {
                    desuperheaterTargetTempM7.value = (tc + 2).toFixed(1);
                    setButtonStale7();
                }
            });
        }
        
        // 过热分析：更新管道过热显示
        const usefulSuperheatInputM7 = document.getElementById('useful_superheat_m7');
        const totalSuperheatInputM7 = document.getElementById('superheat_m7');
        const lineSuperheatDisplayM7 = document.getElementById('line_superheat_display_m7');
        
        function updateLineSuperheatDisplay() {
            if (lineSuperheatDisplayM7 && usefulSuperheatInputM7 && totalSuperheatInputM7) {
                const useful = parseFloat(usefulSuperheatInputM7.value) || 0;
                const total = parseFloat(totalSuperheatInputM7.value) || 0;
                const line = Math.max(0, total - useful);
                lineSuperheatDisplayM7.textContent = line.toFixed(1);
                
                // 如果总过热小于有用过热，显示警告颜色
                if (total < useful) {
                    lineSuperheatDisplayM7.parentElement.classList.add('text-red-600');
                    lineSuperheatDisplayM7.parentElement.classList.remove('text-gray-500');
                } else {
                    lineSuperheatDisplayM7.parentElement.classList.remove('text-red-600');
                    lineSuperheatDisplayM7.parentElement.classList.add('text-gray-500');
                }
            }
        }
        
        // 监听有用过热和总过热的变化，自动更新管道过热显示
        if (usefulSuperheatInputM7) {
            usefulSuperheatInputM7.addEventListener('input', updateLineSuperheatDisplay);
            usefulSuperheatInputM7.addEventListener('change', () => {
                updateLineSuperheatDisplay();
                // 如果自动效率计算启用，触发效率更新（总过热用于效率计算）
                if (autoEffCheckboxM7 && autoEffCheckboxM7.checked) {
                    updateAndDisplayEfficienciesM7();
                }
            });
        }
        if (totalSuperheatInputM7) {
            totalSuperheatInputM7.addEventListener('input', updateLineSuperheatDisplay);
            totalSuperheatInputM7.addEventListener('change', () => {
                updateLineSuperheatDisplay();
                // 如果自动效率计算启用，触发效率更新
                if (autoEffCheckboxM7 && autoEffCheckboxM7.checked) {
                    updateAndDisplayEfficienciesM7();
                }
            });
        }
        
        // 初始化管道过热显示
        updateLineSuperheatDisplay();
        
        // 如果自动效率计算已启用，初始化时触发一次计算
        if (autoEffCheckboxM7 && autoEffCheckboxM7.checked) {
            setTimeout(() => {
                updateAndDisplayEfficienciesM7();
            }, 200);
        }

        if (vsdCheckboxM7) {
            vsdCheckboxM7.addEventListener('change', () => {
                const isVSD = vsdCheckboxM7.checked;
                const vsdInputs = document.getElementById('vsd-inputs-m7');
                if (vsdInputs) vsdInputs.classList.toggle('hidden', !isVSD);
                if (polyCorrectionPanelM7 && AppState.currentMode === AppState.MODES.POLYNIAL) {
                    polyCorrectionPanelM7.classList.toggle('hidden', !isVSD);
                }
                setButtonStale7();
            });
        }

        document.querySelectorAll('input[name="model_select_m7"]').forEach(radio => {
            radio.addEventListener('change', () => {
                if (polyCorrectionPanelM7 && vsdCheckboxM7.checked) {
                    polyCorrectionPanelM7.classList.toggle('hidden', radio.value !== 'polynomial');
                }
            });
        });

        if (printButtonM7) printButtonM7.addEventListener('click', printReportMode7);
        
        // 绑定图表切换按钮
        const toggleBtn = document.getElementById('chart-toggle-m7');
        const toggleBtnMobile = document.getElementById('chart-toggle-m7-mobile');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', toggleChartTypeM7);
        }
        if (toggleBtnMobile) {
            toggleBtnMobile.addEventListener('click', toggleChartTypeM7);
        }
    }
    console.log("Mode 7 (Ammonia Heat Pump) initialized.");
}

function printReportMode7() {
    if (!lastCalculationData) return;
    const d = lastCalculationData;
    const resultDiv = document.querySelector('.print-results');
    let tableText = "\n\nState Points:\n----------------------------------------\nPoint\tT(C)\tP(bar)\th(kJ)\tm(kg/s)\n";
    d.statePoints.forEach(p => { tableText += `${p.name}\t${p.temp}\t${p.press}\t${p.enth}\t${p.flow}\n`; });
    resultDiv.innerText = `Full report generated at ${new Date().toLocaleString()}` + tableText;
    window.print();
}

// 图表切换函数
function toggleChartTypeM7() {
    if (!lastCalculationData || !lastCalculationData.chartData) return;
    
    const chartData = lastCalculationData.chartData;
    const currentType = chartData.chartType;
    const newType = currentType === 'ph' ? 'ts' : 'ph';
    chartData.chartType = newType;
    
    // 确保图表容器可见
    ['chart-desktop-m7', 'chart-mobile-m7'].forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.classList.remove('hidden');
        }
    });
    
    if (newType === 'ph') {
        // 切换到 P-h 图
        ['chart-desktop-m7', 'chart-mobile-m7'].forEach(id => {
            // 清除旧图表配置
            const chart = getChartInstance(id);
            if (chart) {
                chart.clear();
            }
            
            drawPHDiagram(id, {
                title: `P-h Diagram (${chartData.fluid})`,
                mainPoints: chartData.mainPoints,
                saturationLiquidPoints: chartData.satLinesPH.liquidPH,
                saturationVaporPoints: chartData.satLinesPH.vaporPH,
                xLabel: 'Enthalpy (kJ/kg)',
                yLabel: 'Pressure (bar)'
            });
        });
    } else {
        // 切换到 T-S 图
        ['chart-desktop-m7', 'chart-mobile-m7'].forEach(id => {
            // 清除旧图表配置
            const chart = getChartInstance(id);
            if (chart) {
                chart.clear();
            }
            
            drawTSDiagram(id, {
                title: `T-s Diagram (${chartData.fluid})`,
                mainPoints: chartData.mainPointsTS,
                saturationLiquidPoints: chartData.satLinesTS.liquid,
                saturationVaporPoints: chartData.satLinesTS.vapor,
                xLabel: 'Entropy (kJ/kg·K)',
                yLabel: 'Temperature (°C)'
            });
        });
    }
    
    // 更新按钮文本
    const toggleBtn = document.getElementById('chart-toggle-m7');
    const toggleBtnMobile = document.getElementById('chart-toggle-m7-mobile');
    if (toggleBtn) {
        toggleBtn.textContent = newType === 'ph' ? i18next.t('ui.switchToTS') : i18next.t('ui.switchToPH');
    }
    if (toggleBtnMobile) {
        toggleBtnMobile.textContent = newType === 'ph' ? i18next.t('ui.switchToTS') : i18next.t('ui.switchToPH');
    }
}

export function triggerMode7EfficiencyUpdate() {
    if (autoEffCheckboxM7 && autoEffCheckboxM7.checked) updateAndDisplayEfficienciesM7();
}