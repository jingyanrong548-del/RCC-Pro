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