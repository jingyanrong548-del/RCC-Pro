// =====================================================================
// mode2_oil_refrig.js: 模式一 (制冷热泵) - UI 2.0 Apple-Style Edition
// 职责: 执行制冷循环计算，并调用 Component 工厂生成可视化仪表盘。
// =====================================================================

import { updateFluidInfo } from './coolprop_loader.js';
import { calculateEmpiricalEfficiencies } from './efficiency_models.js';
import { 
    createKpiCard, 
    createDetailRow, 
    createSectionHeader, 
    createEcoBadge, 
    createErrorCard 
} from './components.js';

let CP_INSTANCE = null;
// 用于存储最后一次计算的详细数据对象，供打印使用
let lastCalculationData = null; 

// UI 元素引用
let calcButtonM2, resultsDivM2, calcFormM2, printButtonM2, fluidSelectM2, fluidInfoDivM2;
let autoEffCheckboxM2, tempEvapM2, tempCondM2, etaVM2, etaSM2;
let ecoCheckbox, ecoSatTempInput, ecoSuperheatInput, tempDischargeActualM2;

// 状态文本
const BTN_TEXT_CALCULATE = "Calculate Performance";
const BTN_TEXT_RECALCULATE = "Recalculate (Input Changed)";

function setButtonStale2() {
    if (calcButtonM2 && calcButtonM2.innerText !== BTN_TEXT_RECALCULATE) {
        calcButtonM2.innerText = BTN_TEXT_RECALCULATE;
        calcButtonM2.classList.add('opacity-90', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
        // 禁用打印，直到重新计算
        printButtonM2.disabled = true;
        printButtonM2.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

function setButtonFresh2() {
    if (calcButtonM2) {
        calcButtonM2.innerText = BTN_TEXT_CALCULATE;
        calcButtonM2.classList.remove('opacity-90', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
    }
}

// 自动更新效率
function updateAndDisplayEfficienciesM2() {
    if (!CP_INSTANCE || !autoEffCheckboxM2 || !autoEffCheckboxM2.checked) return;
    try {
        const fluid = fluidSelectM2.value;
        const Te_C = parseFloat(tempEvapM2.value);
        const Tc_C = parseFloat(tempCondM2.value);
        if (isNaN(Te_C) || isNaN(Tc_C) || Tc_C <= Te_C) return;
        
        const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', Te_C + 273.15, 'Q', 1, fluid);
        const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', Tc_C + 273.15, 'Q', 1, fluid);
        const pressureRatio = Pc_Pa / Pe_Pa;
        
        const efficiencies = calculateEmpiricalEfficiencies(pressureRatio);
        etaVM2.value = efficiencies.eta_v;
        etaSM2.value = efficiencies.eta_s;
    } catch (error) {
        console.warn("Auto-Eff Error:", error.message);
    }
}

// =====================================================================
// 核心计算逻辑 (保持 v2.9 逻辑完整性)
// =====================================================================
function calculateMode2() {
    resultsDivM2.innerHTML = '<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div></div>';
    
    // 使用 setTimeout 让 UI 有机会渲染 Loading 动画
    setTimeout(() => {
        try {
            // --- 1. 读取基础输入 ---
            const fluid = fluidSelectM2.value;
            const Te_C = parseFloat(document.getElementById('temp_evap_m2').value);
            const Tc_C = parseFloat(document.getElementById('temp_cond_m2').value);
            const superheat_K = parseFloat(document.getElementById('superheat_m2').value);
            const subcooling_K = parseFloat(document.getElementById('subcooling_m2').value);
            const T_2a_est_C = parseFloat(tempDischargeActualM2.value);
            const flow_mode = document.querySelector('input[name="flow_mode_m2"]:checked').value;
            const eff_mode = document.querySelector('input[name="eff_mode_m2"]:checked').value;
            const motor_eff = parseFloat(document.getElementById('motor_eff_m2').value);
            const eta_v = parseFloat(etaVM2.value);
            const eta_s_input = parseFloat(etaSM2.value);

            // ECO Inputs
            const isEcoEnabled = ecoCheckbox.checked;
            const ecoType = document.querySelector('input[name="eco_type_m2"]:checked').value; 
            const ecoPressMode = document.querySelector('input[name="eco_press_mode_m2"]:checked').value; 
            const eco_superheat_K = parseFloat(document.getElementById('eco_superheat_m2').value);

            // Validation
            if (T_2a_est_C <= Tc_C) throw new Error(`排气温度预估值 (${T_2a_est_C}°C) 必须高于冷凝温度 (${Tc_C}°C)。`);
            if (isNaN(Te_C) || isNaN(eta_v) || isNaN(eta_s_input)) throw new Error("请输入有效的数字参数。");

            // --- 2. 状态点计算 (CoolProp) ---
            const T_evap_K = Te_C + 273.15;
            const T_cond_K = Tc_C + 273.15;
            const Pe_Pa = CP_INSTANCE.PropsSI('P', 'T', T_evap_K, 'Q', 1, fluid);
            const Pc_Pa = CP_INSTANCE.PropsSI('P', 'T', T_cond_K, 'Q', 1, fluid);

            // Point 1: Suction
            const T_1_K = T_evap_K + superheat_K;
            const h_1 = CP_INSTANCE.PropsSI('H', 'T', T_1_K, 'P', Pe_Pa, fluid);
            const s_1 = CP_INSTANCE.PropsSI('S', 'T', T_1_K, 'P', Pe_Pa, fluid);
            const rho_1 = CP_INSTANCE.PropsSI('D', 'T', T_1_K, 'P', Pe_Pa, fluid);

            // Point 3: Liquid
            const T_3_K = T_cond_K - subcooling_K;
            const h_3 = CP_INSTANCE.PropsSI('H', 'T', T_3_K, 'P', Pc_Pa, fluid); 
            
            // --- 3. 流量计算 ---
            let V_th_m3_s, rpm_display = "-";
            if (flow_mode === 'rpm') {
                const rpm = parseFloat(document.getElementById('rpm_m2').value);
                const disp = parseFloat(document.getElementById('displacement_m2').value);
                V_th_m3_s = rpm * (disp / 1e6) / 60.0;
                rpm_display = `${rpm} RPM`;
            } else {
                const flow_m3h = parseFloat(document.getElementById('flow_m3h_m2').value);
                V_th_m3_s = flow_m3h / 3600.0;
            }
            const V_act_m3_s = V_th_m3_s * eta_v;
            const m_dot_suc = V_act_m3_s * rho_1;

            // --- 4. ECO 计算 ---
            let m_dot_inj = 0;
            let m_dot_total = m_dot_suc;
            let h_liquid_to_evap = h_3;
            let P_eco_Pa = 0, T_eco_sat_K = 0, h_inj = 0;
            let Q_evap_W_no_eco = m_dot_suc * (h_1 - h_3);
            let eco_badge_val = 0;

            if (isEcoEnabled) {
                if (ecoPressMode === 'auto') {
                    P_eco_Pa = Math.sqrt(Pe_Pa * Pc_Pa);
                    T_eco_sat_K = CP_INSTANCE.PropsSI('T', 'P', P_eco_Pa, 'Q', 0, fluid);
                } else {
                    const T_eco_sat_C_Input = parseFloat(ecoSatTempInput.value);
                    if (isNaN(T_eco_sat_C_Input)) throw new Error("手动模式需输入补气饱和温度");
                    T_eco_sat_K = T_eco_sat_C_Input + 273.15;
                    P_eco_Pa = CP_INSTANCE.PropsSI('P', 'T', T_eco_sat_K, 'Q', 0.5, fluid);
                }

                if (ecoType === 'flash_tank') {
                    h_inj = CP_INSTANCE.PropsSI('H', 'T', T_eco_sat_K, 'Q', 1, fluid);
                    const h_liq_sat_eco = CP_INSTANCE.PropsSI('H', 'T', T_eco_sat_K, 'Q', 0, fluid);
                    h_liquid_to_evap = h_liq_sat_eco;
                    const x_flash = (h_3 - h_liq_sat_eco) / (h_inj - h_liq_sat_eco);
                    m_dot_inj = m_dot_suc * (x_flash / (1 - x_flash));
                } else {
                    const T_inj_K = T_eco_sat_K + eco_superheat_K;
                    h_inj = CP_INSTANCE.PropsSI('H', 'T', T_inj_K, 'P', P_eco_Pa, fluid);
                    const h_liq_out = CP_INSTANCE.PropsSI('H', 'T', T_eco_sat_K + 5.0, 'P', Pc_Pa, fluid); 
                    h_liquid_to_evap = h_liq_out;
                    m_dot_inj = (m_dot_suc * (h_3 - h_liquid_to_evap)) / (h_inj - h_3);
                }
                m_dot_total = m_dot_suc + m_dot_inj;
            }

            const h_4 = h_liquid_to_evap;
            
            // --- 5. 功耗计算 ---
            let W_ideal_W = 0;
            if (!isEcoEnabled) {
                const h_2s = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_1, fluid);
                W_ideal_W = m_dot_suc * (h_2s - h_1);
            } else {
                const h_mid_1s = CP_INSTANCE.PropsSI('H', 'P', P_eco_Pa, 'S', s_1, fluid);
                const W_s1 = m_dot_suc * (h_mid_1s - h_1);
                const h_mix_s = (m_dot_suc * h_mid_1s + m_dot_inj * h_inj) / m_dot_total;
                const s_mix = CP_INSTANCE.PropsSI('S', 'H', h_mix_s, 'P', P_eco_Pa, fluid);
                const h_2s_stage2 = CP_INSTANCE.PropsSI('H', 'P', Pc_Pa, 'S', s_mix, fluid);
                const W_s2 = m_dot_total * (h_2s_stage2 - h_mix_s);
                W_ideal_W = W_s1 + W_s2;
            }

            let W_shaft_W, W_input_W, eta_total_display;
            if (eff_mode === 'shaft') {
                W_shaft_W = W_ideal_W / eta_s_input;
                W_input_W = W_shaft_W / motor_eff;
                eta_total_display = W_ideal_W / W_input_W;
            } else {
                W_input_W = W_ideal_W / eta_s_input;
                W_shaft_W = W_input_W * motor_eff;
                eta_total_display = eta_s_input;
            }

            // --- 6. 热平衡修正 ---
            const Q_evap_W = m_dot_suc * (h_1 - h_4);
            const h_system_in = (m_dot_suc * h_1 + m_dot_inj * h_inj);
            const T_2a_est_K = T_2a_est_C + 273.15;
            const h_2a_target = CP_INSTANCE.PropsSI('H', 'T', T_2a_est_K, 'P', Pc_Pa, fluid);
            const energy_out_gas = m_dot_total * h_2a_target;
            
            let Q_oil_W = W_shaft_W - (energy_out_gas - h_system_in);
            let T_2a_final_C = T_2a_est_C;
            let isAdishargeCorrection = false;

            if (Q_oil_W < 0) {
                Q_oil_W = 0;
                const h_2a_real = (h_system_in + W_shaft_W) / m_dot_total;
                const T_2a_real_K = CP_INSTANCE.PropsSI('T', 'P', Pc_Pa, 'H', h_2a_real, fluid);
                T_2a_final_C = T_2a_real_K - 273.15;
                isAdishargeCorrection = true;
            }
            
            // Final Condenser Load
            const h_2a_final = (h_system_in + W_shaft_W - Q_oil_W) / m_dot_total;
            const Q_cond_W = m_dot_total * (h_2a_final - h_3);
            const Q_heating_total_W = Q_cond_W + Q_oil_W;

            // ECO Improvement
            if (isEcoEnabled) {
                eco_badge_val = ((Q_evap_W - Q_evap_W_no_eco) / Q_evap_W_no_eco) * 100;
            }

            // --- 7. 构建 HTML 仪表盘 ---
            const COP_R = Q_evap_W / W_input_W;
            const COP_H = Q_heating_total_W / W_input_W;

            // 保存数据供打印
            lastCalculationData = {
                fluid, Te_C, Tc_C, P_e: Pe_Pa/1e5, P_c: Pc_Pa/1e5,
                m_dot: m_dot_total, Q_evap_W, W_input_W, Q_cond_W, Q_oil_W,
                COP_R, COP_H, T_2a: T_2a_final_C,
                eco: isEcoEnabled ? { P: P_eco_Pa/1e5, alpha: m_dot_inj/m_dot_suc } : null
            };

            let html = `
                <div class="grid grid-cols-2 gap-4 mb-6">
                    ${createKpiCard('制冷量 (Cooling)', (Q_evap_W/1000).toFixed(2), 'kW', `COP: ${COP_R.toFixed(2)}`, 'blue')}
                    ${createKpiCard('总供热 (Heating)', (Q_heating_total_W/1000).toFixed(2), 'kW', `COP: ${COP_H.toFixed(2)}`, 'orange')}
                </div>
                <div class="space-y-1 bg-white/40 p-4 rounded-2xl border border-white/50 shadow-inner">
                    ${createSectionHeader('Compressor Flow')}
                    ${createDetailRow('吸气流量 (Mass Flow)', `${m_dot_suc.toFixed(4)} kg/s`)}
                    ${createDetailRow('吸气容积 (Vol Flow)', `${(V_act_m3_s*3600).toFixed(1)} m³/h`)}
                    ${createDetailRow('转速 (Speed)', rpm_display)}
                    
                    ${createSectionHeader('Thermodynamics')}
                    ${createDetailRow('吸气 (Inlet)', `${Te_C.toFixed(1)}°C / ${(Pe_Pa/1e5).toFixed(2)} bar`)}
                    ${createDetailRow('排气 (Discharge)', `${Tc_C.toFixed(1)}°C / ${(Pc_Pa/1e5).toFixed(2)} bar`)}
                    ${createDetailRow('排气温度 (T2a)', `${T_2a_final_C.toFixed(1)}°C`, isAdishargeCorrection)}
                    ${isAdishargeCorrection ? '<div class="text-[10px] text-orange-500 text-right">*Energy Corrected</div>' : ''}

                    ${createSectionHeader('Energy & Efficiencies')}
                    ${createDetailRow('输入功率 (Input)', `${(W_input_W/1000).toFixed(2)} kW`, true)}
                    ${createDetailRow('轴功率 (Shaft)', `${(W_shaft_W/1000).toFixed(2)} kW`)}
                    ${createDetailRow('油冷负荷 (Oil Load)', `${(Q_oil_W/1000).toFixed(2)} kW`)}
                    ${createDetailRow('总等熵效率 (η_total)', eta_total_display.toFixed(3))}
            `;

            if (isEcoEnabled) {
                html += `
                    ${createSectionHeader('Economizer (ECO)', '⚡')}
                    ${createDetailRow('补气状态', `${(P_eco_Pa/1e5).toFixed(2)} bar ${createEcoBadge(eco_badge_val)}`)}
                    ${createDetailRow('补气流量', `${m_dot_inj.toFixed(4)} kg/s`)}
                `;
            }

            html += `</div>`;
            
            resultsDivM2.innerHTML = html;
            setButtonFresh2();
            
            // 启用打印
            printButtonM2.disabled = false;
            printButtonM2.classList.remove('opacity-50', 'cursor-not-allowed');

        } catch (error) {
            resultsDivM2.innerHTML = createErrorCard(error.message);
            console.error(error);
            printButtonM2.disabled = true;
        }
    }, 50); // Small delay to allow UI render
}

// 打印逻辑适配
function printReportMode2() {
    if (!lastCalculationData) return;
    
    // 填充隐藏的打印容器
    const container = document.getElementById('print-container');
    const table = container.querySelector('.print-table');
    const resultDiv = container.querySelector('.print-results');
    
    // 清空旧内容
    table.innerHTML = '';
    
    const d = lastCalculationData;
    const rows = [
        ['Mode', 'Refrigeration / Heat Pump'],
        ['Fluid', d.fluid],
        ['Evap (Te)', `${d.Te_C} °C`],
        ['Cond (Tc)', `${d.Tc_C} °C`],
        ['Input Power', `${(d.W_input_W/1000).toFixed(3)} kW`],
        ['Cooling Cap', `${(d.Q_evap_W/1000).toFixed(3)} kW`],
        ['Heating Cap', `${((d.Q_cond_W+d.Q_oil_W)/1000).toFixed(3)} kW`],
        ['COP (Cooling)', d.COP_R.toFixed(3)],
        ['COP (Heating)', d.COP_H.toFixed(3)]
    ];
    
    rows.forEach(row => {
        table.innerHTML += `<tr class="border-b border-gray-200"><th class="py-2 pr-4 text-gray-600 font-medium w-1/3">${row[0]}</th><td class="py-2 text-gray-900 font-mono">${row[1]}</td></tr>`;
    });

    resultDiv.innerText = `Detailed Report Generated at ${new Date().toLocaleString()}\n------------------------------------------------\nDischarge Temp: ${d.T_2a.toFixed(2)} °C\nOil Cooler Load: ${(d.Q_oil_W/1000).toFixed(3)} kW\nMass Flow: ${d.m_dot.toFixed(4)} kg/s`;

    // 触发浏览器打印
    window.print();
}

// 导出接口
export function triggerMode2EfficiencyUpdate() {
    if (autoEffCheckboxM2 && autoEffCheckboxM2.checked) {
        updateAndDisplayEfficienciesM2();
    }
}

// 初始化
export function initMode2(CP) {
    CP_INSTANCE = CP;
    calcButtonM2 = document.getElementById('calc-button-mode-2');
    resultsDivM2 = document.getElementById('results-mode-2');
    calcFormM2 = document.getElementById('calc-form-mode-2');
    printButtonM2 = document.getElementById('print-button-mode-2');
    fluidSelectM2 = document.getElementById('fluid_m2');
    fluidInfoDivM2 = document.getElementById('fluid-info-m2');
    tempDischargeActualM2 = document.getElementById('temp_discharge_actual_m2');
    
    autoEffCheckboxM2 = document.getElementById('auto-eff-m2');
    tempEvapM2 = document.getElementById('temp_evap_m2');
    tempCondM2 = document.getElementById('temp_cond_m2');
    etaVM2 = document.getElementById('eta_v_m2');
    etaSM2 = document.getElementById('eta_s_m2');
    
    // ECO UI Ref
    ecoCheckbox = document.getElementById('enable_eco_m2');
    ecoSatTempInput = document.getElementById('temp_eco_sat_m2');
    ecoSuperheatInput = document.getElementById('eco_superheat_m2');

    if (calcFormM2) {
        calcFormM2.addEventListener('submit', (e) => { e.preventDefault(); calculateMode2(); });
        
        // Input Change Listeners
        const inputs = calcFormM2.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('input', setButtonStale2);
            input.addEventListener('change', setButtonStale2);
        });

        // Fluid Change
        fluidSelectM2.addEventListener('change', () => {
            updateFluidInfo(fluidSelectM2, fluidInfoDivM2, CP_INSTANCE);
        });
        
        // Auto Eff Triggers
        [tempEvapM2, tempCondM2, autoEffCheckboxM2].forEach(el => {
            if(el) el.addEventListener('change', updateAndDisplayEfficienciesM2);
        });

        if (printButtonM2) {
            printButtonM2.addEventListener('click', printReportMode2);
        }
    }
    console.log("Mode 2 (UI 2.0) initialized.");
}