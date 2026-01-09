// =====================================================================
// efficiency_models.js: 经验效率模型
// 版本: v2.0 (2024 Modern Screw Compressor)
// 职责: 根据压力比(PR)估算容积效率和等熵/等温效率。
// 基于: 2024年国际先进螺杆压缩机技术发展水平
// =====================================================================

/**
 * 根据压力比计算经验效率值（2024年现代螺杆机水平）
 * @param {number} pressureRatio - 压力比 (Pc / Pe)
 * @returns {object} 包含 { eta_v, eta_s, eta_iso } 的效率对象
 */
export function calculateEmpiricalEfficiencies(pressureRatio) {
    // 确保压力比有效，防止计算错误
    if (isNaN(pressureRatio) || pressureRatio < 1) {
        return { eta_v: 0.92, eta_s: 0.80, eta_iso: 0.75 }; // 返回一组安全的默认值（2024年水平）
    }

    // --- 1. 容积效率 (η_v) 模型: 改进的非线性衰减模型 ---
    // 现代螺杆机（2024）：低压力比时可达0.96-0.98，高压力比时仍能保持0.80-0.90
    const ETA_V_BASE = 0.97;         // 基础容积效率 (PR=1时，2024年水平)
    const PENALTY_V_LOW = 0.008;     // 低压力比区域衰减系数（PR < 3）
    const PENALTY_V_HIGH = 0.012;    // 高压力比区域衰减系数（PR >= 3）
    const ETA_V_MIN = 0.75;          // 最小容积效率（2024年改进）
    
    let eta_v;
    if (pressureRatio < 3.0) {
        // 低压力比区域：线性衰减，衰减较慢
        eta_v = ETA_V_BASE - (pressureRatio - 1) * PENALTY_V_LOW;
    } else {
        // 高压力比区域：分段衰减，衰减加快
        const baseAtPR3 = ETA_V_BASE - (3.0 - 1) * PENALTY_V_LOW;
        eta_v = baseAtPR3 - (pressureRatio - 3.0) * PENALTY_V_HIGH;
    }
    eta_v = Math.max(ETA_V_MIN, eta_v); // 确保不低于下限

    // --- 2. 等熵效率 (η_s) 模型: 改进的抛物线模型 ---
    // 现代螺杆机（2024）：最佳工况（PR=3-5）可达0.85-0.90，极端工况也能保持0.70-0.80
    const ETA_S_PEAK = 0.87;         // 峰值等熵效率（2024年水平提升）
    const PR_SWEET_SPOT = 4.0;       // 最佳效率点对应的压力比
    const PENALTY_S_NEAR = 0.012;    // 接近最佳点区域的衰减系数
    const PENALTY_S_FAR = 0.020;     // 远离最佳点区域的衰减系数
    const ETA_S_MIN = 0.68;          // 最小等熵效率（2024年改进）
    
    const prDiff = Math.abs(pressureRatio - PR_SWEET_SPOT);
    let eta_s;
    if (prDiff <= 2.0) {
        // 接近最佳点区域：衰减较慢
        eta_s = ETA_S_PEAK - prDiff * PENALTY_S_NEAR;
    } else {
        // 远离最佳点区域：衰减加快
        const baseAtPR2 = ETA_S_PEAK - 2.0 * PENALTY_S_NEAR;
        eta_s = baseAtPR2 - (prDiff - 2.0) * PENALTY_S_FAR;
    }
    eta_s = Math.max(ETA_S_MIN, eta_s); // 确保不低于下限

    // 等温效率与等熵效率关联（2024年水平）
    const ISO_FACTOR = 0.94;         // 等温效率因子（2024年略有提升）
    let eta_iso = eta_s * ISO_FACTOR;

    // 返回计算结果，保留3位小数
    return {
        eta_v: parseFloat(eta_v.toFixed(3)),
        eta_s: parseFloat(eta_s.toFixed(3)),
        eta_iso: parseFloat(eta_iso.toFixed(3))
    };
}

/**
 * 计算氨喷油螺杆压缩机效率
 * 基于 Mycom/Mayekawa 等工业氨机的一般特性曲线拟合
 * @param {number} Pd_abs - 排气绝对压力 (bar)
 * @param {number} Ps_abs - 吸气绝对压力 (bar)
 * @param {number} Vi - 内容积比 (通常为 2.6, 3.6, 5.8 等，或无级调节)
 * @param {boolean} hasEconomizer - 是否带经济器 (影响容积效率修正)
 * @returns {Object} { eta_v (容积效率), eta_is (绝热效率/等熵效率) }
 */
export function calculateScrewEfficiency(Pd_abs, Ps_abs, Vi, hasEconomizer = false) {
    // 1. 计算系统运行压比
    const pi_system = Pd_abs / Ps_abs;
    
    // 2. 氨绝热指数 (k) - 平均值，虽随温度变化，但用于效率估算 1.3 足够精确
    const k = 1.31; 
    
    // 3. 计算内建压比 (Built-in Pressure Ratio)
    // pi_i = Vi ^ k
    const pi_internal = Math.pow(Vi, k);

    // ==========================================
    // A. 容积效率 (Volumetric Efficiency) 计算
    // ==========================================
    // 氨机通常容积效率较高，主要受压比影响
    // 经验公式: eta_v = 0.96 - 0.015 * (Pd/Ps) (简化版)
    // 进阶版 (考虑 Vi 对泄漏路径的影响):
    let eta_v = 0.95 - 0.012 * pi_system;
    
    // 修正: 极高压比下衰减加速
    if (pi_system > 8) {
        eta_v -= 0.005 * (pi_system - 8);
    }
    
    // 经济器补气会稍微降低吸气侧的容积效率（因为占据了齿槽容积）
    if (hasEconomizer) {
        eta_v *= 0.98; 
    }

    // 边界保护
    eta_v = Math.max(0.6, Math.min(0.99, eta_v));


    // ==========================================
    // B. 等熵效率 (Isentropic Efficiency) 计算
    // ==========================================
    // 核心算法：基于"欠压缩"或"过压缩"损失模型
    
    // 峰值效率 (取决于机器制造精度，Mycom/Howden 大机组通常在 0.80-0.85)
    const peak_efficiency = 0.82; 

    // 计算不匹配系数 (Mismatch factor)
    // 当运行压比 = 内建压比时，效率最高
    // 公式参考自 Stosic 螺杆压缩机通用模型
    
    let mismatch_loss = 0;
    
    if (pi_system !== pi_internal) {
        // 相对偏差
        const deviation = Math.abs(pi_system - pi_internal) / pi_internal;
        
        // 过压缩 (System < Internal) 损失通常比 欠压缩 (System > Internal) 小
        // 因为过压缩只是多做了功，而欠压缩会导致气体回流冲击
        const penalty_factor = pi_system > pi_internal ? 0.08 : 0.06;
        
        mismatch_loss = penalty_factor * Math.pow(deviation, 2) + 0.02 * deviation;
    }

    let eta_is = peak_efficiency - mismatch_loss;
    
    // 机械效率修正 (摩擦损失)
    const eta_mech = 0.94; // 喷油螺杆机械效率通常很高
    
    // 最终等熵效率 (考虑机械损失)
    // 注意：有些厂家定义的等熵效率已经包含机械效率，此处需根据 Mycom 定义调整
    eta_is = eta_is * eta_mech;

    // 边界保护
    eta_is = Math.max(0.4, Math.min(0.88, eta_is));

    return {
        eta_v: parseFloat(eta_v.toFixed(4)),
        eta_is: parseFloat(eta_is.toFixed(4)),
        pi_system: parseFloat(pi_system.toFixed(2)),
        pi_internal: parseFloat(pi_internal.toFixed(2))
    };
}

/**
 * 计算活塞压缩机容积效率（基于余隙容积）
 * 公式: λ = 1 - C × ((P_dis/P_suc)^(1/n) - 1)
 * 其中 C 是相对余隙容积，n 是多变指数（通常接近等熵指数 k）
 * 
 * @param {number} P_dis_Pa - 排气绝对压力 (Pa)
 * @param {number} P_suc_Pa - 吸气绝对压力 (Pa)
 * @param {number} clearance_factor - 相对余隙容积 (0.03-0.05，默认 0.04)
 * @param {number} polytropic_index - 多变指数 (默认 null，将从 CoolProp 获取等熵指数 k)
 * @param {Object} CP_INSTANCE - CoolProp 实例 (可选，用于获取等熵指数)
 * @param {string} fluid - 制冷剂名称 (可选，用于获取等熵指数)
 * @param {number} T_suc_K - 吸气温度 (K) (可选，用于获取等熵指数)
 * @returns {number} 容积效率 (0-1)
 */
export function calculateReciprocatingVolumetricEfficiency(
    P_dis_Pa,
    P_suc_Pa,
    clearance_factor = 0.04,
    polytropic_index = null,
    CP_INSTANCE = null,
    fluid = null,
    T_suc_K = null
) {
    // 参数验证
    if (isNaN(P_dis_Pa) || isNaN(P_suc_Pa) || P_dis_Pa <= 0 || P_suc_Pa <= 0) {
        console.warn('[Reciprocating Efficiency] Invalid pressure values');
        return 0.85; // 返回安全的默认值
    }

    if (isNaN(clearance_factor) || clearance_factor < 0.01 || clearance_factor > 0.10) {
        console.warn('[Reciprocating Efficiency] Invalid clearance factor, using default 0.04');
        clearance_factor = 0.04;
    }

    // 计算压力比
    const pressureRatio = P_dis_Pa / P_suc_Pa;
    if (pressureRatio < 1) {
        console.warn('[Reciprocating Efficiency] Pressure ratio < 1, invalid');
        return 0.85;
    }

    // 确定多变指数 n
    let n = polytropic_index;
    if (n === null || isNaN(n)) {
        // 尝试从 CoolProp 获取等熵指数 k
        if (CP_INSTANCE && fluid && T_suc_K) {
            try {
                const k = CP_INSTANCE.PropsSI('CPMOLAR', 'T', T_suc_K, 'P', P_suc_Pa, fluid) / 
                          CP_INSTANCE.PropsSI('CVMOLAR', 'T', T_suc_K, 'P', P_suc_Pa, fluid);
                n = k; // 对于活塞压缩机，多变指数通常接近等熵指数
            } catch (e) {
                // 如果获取失败，使用默认值
                console.warn('[Reciprocating Efficiency] Failed to get isentropic index from CoolProp, using default 1.3');
                n = 1.3; // 氨的典型值
            }
        } else {
            // 使用默认值（氨的典型等熵指数）
            n = 1.3;
        }
    }

    // 计算容积效率
    // λ = 1 - C × ((P_dis/P_suc)^(1/n) - 1)
    const expansion_factor = Math.pow(pressureRatio, 1.0 / n) - 1.0;
    let eta_v = 1.0 - clearance_factor * expansion_factor;

    // 边界保护：容积效率应在合理范围内
    eta_v = Math.max(0.5, Math.min(0.99, eta_v));

    return parseFloat(eta_v.toFixed(4));
}

/**
 * 计算 MYCOM 活塞压缩机效率（基于 MYCOM 技术水平）
 * MYCOM 活塞压缩机特点：
 * - 容积效率：略低于 GEA，但设计更注重可靠性和长期稳定性
 * - 等熵效率：在标准工况下表现良好，高压力比时略有下降
 * 
 * @param {number} ratio - 压力比 (P_dis / P_suc)
 * @param {number} k_value - 等熵指数 k (绝热指数)
 * @param {number} T_cond_celsius - 冷凝温度 (°C)
 * @param {number} clearance_factor_input - 相对余隙容积（可选，默认0.04）
 * @returns {Object} { eta_v: 容积效率, eta_is: 等熵效率 }
 */
export function calculateMycomEfficiencies(ratio, k_value, T_cond_celsius, clearance_factor_input) {
    // ==========================================
    // 1. MYCOM 专用常数（基于 MYCOM 技术水平）
    // ==========================================
    // Volumetric Efficiency: MYCOM 设计更保守，注重可靠性
    const CLEARANCE_C = clearance_factor_input || 0.04;  // MYCOM 典型余隙容积（略低于 GEA）
    const FLOW_RESISTANCE_FACTOR = 0.94;                  // MYCOM 流动阻力因子（略低于 GEA 的 0.96）
    const LEAKAGE_COEFFICIENT = 0.015;                    // MYCOM 泄漏系数（1.5%损失/压力比，略高于 GEA）
    
    // Isentropic Efficiency: MYCOM 机械效率略低于 GEA，但设计更稳健
    const MECHANICAL_EFF_BASE = 0.92;                     // MYCOM 机械效率（略低于 GEA 的 0.95）

    // 参数验证
    if (isNaN(ratio) || ratio < 1) {
        console.warn('[MYCOM Efficiency] Invalid pressure ratio');
        return { eta_v: 0.72, eta_is: 0.68 };
    }
    if (isNaN(k_value) || k_value < 1.0 || k_value > 2.0) {
        console.warn('[MYCOM Efficiency] Invalid k value, using default 1.3');
        k_value = 1.3;
    }

    // ==========================================
    // 2. Volumetric Efficiency (λ) Calculation
    // ==========================================
    // Step 1: Theoretical Lambda (Clearance only)
    const expansion_term = Math.pow(ratio, 1.0 / k_value) - 1.0;
    const lambda_theo = 1.0 - CLEARANCE_C * expansion_term;

    // Step 2: Real Lambda (Apply Leakage & Resistance)
    // MYCOM 泄漏损失略高于 GEA
    const leakage_loss = LEAKAGE_COEFFICIENT * ratio;
    
    // Real Lambda Formula:
    let lambda_real = (lambda_theo * FLOW_RESISTANCE_FACTOR) - leakage_loss;

    // Clamp: MYCOM 容积效率上限略低于 GEA
    lambda_real = Math.max(0.2, Math.min(0.90, lambda_real));

    // ==========================================
    // 3. Isentropic Efficiency (η_is) Calculation
    // ==========================================
    // Step 1: Base Isentropic
    // MYCOM 机械效率略低，但设计更稳健
    let eta_is_base = lambda_real * MECHANICAL_EFF_BASE;

    // Step 2: Heat Pump (High Temp) Correction
    // MYCOM 在高冷凝温度时的修正更保守
    let correction_factor = 1.0;
    if (!isNaN(T_cond_celsius) && T_cond_celsius > 50) {
        // MYCOM 修正系数：0.0025/度（略高于 GEA 的 0.002）
        correction_factor = 1.0 - ((T_cond_celsius - 50) * 0.0025);
        correction_factor = Math.max(0.65, Math.min(1.0, correction_factor));
    }

    // Step 3: Final η_is
    let eta_is = eta_is_base * correction_factor;

    // 边界保护：MYCOM 等熵效率上限略低于 GEA
    eta_is = Math.max(0.48, Math.min(0.82, eta_is));

    return {
        eta_v: parseFloat(lambda_real.toFixed(4)),
        eta_is: parseFloat(eta_is.toFixed(4))
    };
}

/**
 * 计算 MYCOM 单机双级压缩机效率（基于 MYCOM 单机双级压缩机技术水平）
 * MYCOM 单机双级压缩机特点（WBHE 和 M II 系列）：
 * - 容积效率：接近 GEA 水平，专门设计的高效双级压缩机
 * - 等熵效率：在标准工况下表现优秀，高压力比时仍能保持较高效率
 * - 设计特点：超过15,000台使用记录（WBHE），新一代节能压缩机（M II）
 * 
 * @param {number} ratio - 压力比 (P_dis / P_suc)
 * @param {number} k_value - 等熵指数 k (绝热指数)
 * @param {number} T_cond_celsius - 冷凝温度 (°C)
 * @param {number} clearance_factor_input - 相对余隙容积（可选，默认0.035-0.04）
 * @returns {Object} { eta_v: 容积效率, eta_is: 等熵效率 }
 */
export function calculateMycomTwoStageEfficiencies(ratio, k_value, T_cond_celsius, clearance_factor_input) {
    // ==========================================
    // 1. MYCOM 单机双级专用常数（基于高效双级压缩机设计，优化后）
    // ==========================================
    // Volumetric Efficiency: MYCOM 单机双级压缩机设计更高效，接近或超过 GEA 水平
    const CLEARANCE_C = clearance_factor_input || 0.035;  // MYCOM 单机双级典型余隙容积（与 GEA 接近）
    const FLOW_RESISTANCE_FACTOR = 0.97;                  // MYCOM 单机双级流动阻力因子（提升至0.97，高于GEA的0.96）
    const LEAKAGE_COEFFICIENT = 0.008;                    // MYCOM 单机双级泄漏系数（降低至0.8%损失/压力比，优于GEA的1.2%）
    
    // Isentropic Efficiency: MYCOM 单机双级机械效率接近 GEA 水平
    const MECHANICAL_EFF_BASE = 0.94;                     // MYCOM 单机双级机械效率（接近 GEA 的 0.95）

    // 参数验证
    if (isNaN(ratio) || ratio < 1) {
        console.warn('[MYCOM Two-Stage Efficiency] Invalid pressure ratio');
        return { eta_v: 0.75, eta_is: 0.70 };
    }
    if (isNaN(k_value) || k_value < 1.0 || k_value > 2.0) {
        console.warn('[MYCOM Two-Stage Efficiency] Invalid k value, using default 1.3');
        k_value = 1.3;
    }

    // ==========================================
    // 2. Volumetric Efficiency (λ) Calculation
    // ==========================================
    // Step 1: Theoretical Lambda (Clearance only)
    const expansion_term = Math.pow(ratio, 1.0 / k_value) - 1.0;
    const lambda_theo = 1.0 - CLEARANCE_C * expansion_term;

    // Step 2: Real Lambda (Apply Leakage & Resistance)
    // MYCOM 单机双级泄漏损失更低（优化的泄漏系数）
    // 使用更温和的泄漏损失计算，对低压力比更友好
    let leakage_loss;
    if (ratio < 3.0) {
        // 低压力比时，泄漏损失更小
        leakage_loss = LEAKAGE_COEFFICIENT * ratio * 0.8;
    } else if (ratio < 6.0) {
        // 中等压力比时，标准泄漏损失
        leakage_loss = LEAKAGE_COEFFICIENT * ratio;
    } else {
        // 高压力比时，泄漏损失略有增加但保持较低
        leakage_loss = LEAKAGE_COEFFICIENT * ratio * 1.1;
    }
    
    // Real Lambda Formula: 使用更高的流动阻力因子和更低的泄漏损失
    let lambda_real = (lambda_theo * FLOW_RESISTANCE_FACTOR) - leakage_loss;

    // Clamp: MYCOM 单机双级容积效率上限提升至0.94（高于GEA的0.92）
    lambda_real = Math.max(0.2, Math.min(0.94, lambda_real));

    // ==========================================
    // 3. Isentropic Efficiency (η_is) Calculation
    // ==========================================
    // Step 1: Base Isentropic
    // MYCOM 单机双级机械效率接近 GEA 水平
    let eta_is_base = lambda_real * MECHANICAL_EFF_BASE;

    // Step 2: Heat Pump (High Temp) Correction
    // MYCOM 单机双级在高冷凝温度时的修正与 GEA 相同（更温和）
    let correction_factor = 1.0;
    if (!isNaN(T_cond_celsius) && T_cond_celsius > 55) {
        // MYCOM 单机双级修正系数：0.002/度（与 GEA 相同，更温和）
        correction_factor = 1.0 - ((T_cond_celsius - 55) * 0.002);
        correction_factor = Math.max(0.70, Math.min(1.0, correction_factor));
    }

    // Step 3: Final η_is
    let eta_is = eta_is_base * correction_factor;

    // 边界保护：MYCOM 单机双级等熵效率上限接近 GEA 水平
    eta_is = Math.max(0.50, Math.min(0.85, eta_is));

    return {
        eta_v: parseFloat(lambda_real.toFixed(4)),
        eta_is: parseFloat(eta_is.toFixed(4))
    };
}

/**
 * 计算活塞压缩机效率（半经验工程公式 - 混合方案）
 * 混合策略：保守的容积效率 + 高端的等熵效率
 * 针对 GEA Grasso 氨热泵应用（高压力比、高排气温度）进行优化
 * 
 * @param {number} ratio - 压力比 (P_dis / P_suc)
 * @param {number} k_value - 等熵指数 k (绝热指数)
 * @param {number} T_cond_celsius - 冷凝温度 (°C)
 * @param {number} clearance_factor_input - 相对余隙容积（可选，默认0.045）
 * @returns {Object} { eta_v: 容积效率, eta_is: 等熵效率 }
 */
export function calculateEfficiencies(ratio, k_value, T_cond_celsius, clearance_factor_input) {
    // ==========================================
    // 1. Hybrid Constants (Conservative λ + High η_is)
    // ==========================================
    // Volumetric Efficiency: 恢复到保守标准值（更现实）
    const CLEARANCE_C = clearance_factor_input || 0.045;  // 标准余隙容积（恢复）
    const FLOW_RESISTANCE_FACTOR = 0.96;                  // 标准流动阻力因子（恢复）
    const LEAKAGE_COEFFICIENT = 0.012;                    // 标准泄漏系数（恢复，1.2%损失/压力比）
    
    // Isentropic Efficiency: 通过提高机械效率补偿较低的λ，保持高端性能
    const MECHANICAL_EFF_BASE = 0.95;                     // 高机械效率（从0.89提升，补偿较低的λ）

    // 参数验证
    if (isNaN(ratio) || ratio < 1) {
        console.warn('[Efficiency] Invalid pressure ratio');
        return { eta_v: 0.75, eta_is: 0.70 };
    }
    if (isNaN(k_value) || k_value < 1.0 || k_value > 2.0) {
        console.warn('[Efficiency] Invalid k value, using default 1.3');
        k_value = 1.3;
    }

    // ==========================================
    // 2. Volumetric Efficiency (λ) Calculation
    // ==========================================
    // Step 1: Theoretical Lambda (Clearance only)
    // λ_theo = 1 - C × [(Ratio)^(1/k) - 1]
    const expansion_term = Math.pow(ratio, 1.0 / k_value) - 1.0;
    const lambda_theo = 1.0 - CLEARANCE_C * expansion_term;

    // Step 2: Real Lambda (Apply Leakage & Resistance)
    // Leakage Correction: 标准泄漏损失
    // Loss = 0.012 × Ratio (例如：Ratio=5时，损失6%效率)
    const leakage_loss = LEAKAGE_COEFFICIENT * ratio;
    
    // Real Lambda Formula:
    // λ_real = (λ_theo × FLOW_RESISTANCE_FACTOR) - leakage_loss
    let lambda_real = (lambda_theo * FLOW_RESISTANCE_FACTOR) - leakage_loss;

    // Clamp: Ensure λ_real is never > 0.92 or < 0.2
    // 恢复标准上限（保守值）
    lambda_real = Math.max(0.2, Math.min(0.92, lambda_real));

    // ==========================================
    // 3. Isentropic Efficiency (η_is) Calculation
    // ==========================================
    // Step 1: Base Isentropic
    // 通过提高机械效率因子（0.95）补偿较低的λ，保持高端等熵效率
    // η_is_base = λ_real × MECHANICAL_EFF_BASE
    // Example: λ=0.78, η_is_base = 0.78 × 0.95 = 0.741 (保持高端性能)
    let eta_is_base = lambda_real * MECHANICAL_EFF_BASE;

    // Step 2: Heat Pump (High Temp) Correction (Relaxed)
    // 仅在高冷凝温度时应用修正（氨热泵模式）
    // 阈值保持55°C（放宽的阈值）
    let correction_factor = 1.0;
    if (!isNaN(T_cond_celsius) && T_cond_celsius > 55) {
        // Correction Factor = 1.0 - ((T_c - 55) × 0.002)
        // 修正系数0.002/度（温和的修正）
        // Example: At 70°C, factor = 1.0 - 0.03 = 0.97
        correction_factor = 1.0 - ((T_cond_celsius - 55) * 0.002);
        correction_factor = Math.max(0.70, Math.min(1.0, correction_factor)); // 限制范围
    }

    // Step 3: Final η_is
    // η_is = η_is_base × Correction_Factor
    let eta_is = eta_is_base * correction_factor;

    // 边界保护：等熵效率不超过0.85（活塞压缩机的热力学极限）
    eta_is = Math.max(0.50, Math.min(0.85, eta_is));

    return {
        eta_v: parseFloat(lambda_real.toFixed(4)),
        eta_is: parseFloat(eta_is.toFixed(4))
    };
}