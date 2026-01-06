// =====================================================================
// compressor_models.js: 压缩机型号数据库
// 职责: 存储各品牌压缩机的型号与理论排量数据，支持扩展
// =====================================================================

/**
 * 压缩机型号数据库 (RCC Pro - 活塞压缩机)
 * 结构: { brand: { series: [{ model, displacement, ...extra }] } }
 * displacement 单位: m³/h (最大转速下的扫气量)
 *
 * 对于活塞压缩机，额外字段：
 *  - cylinders: 气缸数
 *  - max_rpm: 最大转速 (RPM)
 *  - swept_volume_max_m3h: 最大转速下的扫气量 (m³/h)，等同于 displacement
 *  - clearance_factor: 相对余隙容积 (0.03-0.05)
 *  - rpm_range: [最小转速, 最大转速]
 *  - refrigerants: 支持的制冷剂数组
 */
export const COMPRESSOR_MODELS = {
    'GEA Grasso': {
        'Grasso 5HP (50 bar)': [
            {
                model: '35HP',
                displacement: 101,
                swept_volume_max_m3h: 101,
                cylinders: 3,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.05,
                refrigerants: ['R744', 'R717']
            },
            {
                model: '45HP',
                displacement: 135,
                swept_volume_max_m3h: 135,
                cylinders: 4,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.05,
                refrigerants: ['R744', 'R717']
            },
            {
                model: '55HP',
                displacement: 168,
                swept_volume_max_m3h: 168,
                cylinders: 5,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.05,
                refrigerants: ['R744', 'R717']
            },
            {
                model: '65HP',
                displacement: 202,
                swept_volume_max_m3h: 202,
                cylinders: 6,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.05,
                refrigerants: ['R744', 'R717']
            }
        ],
        'Grasso V (25 bar)': [
            {
                model: 'V 300-2',
                displacement: 290,
                swept_volume_max_m3h: 290,
                cylinders: 4,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 450-2',
                displacement: 435,
                swept_volume_max_m3h: 435,
                cylinders: 6,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 600-2',
                displacement: 580,
                swept_volume_max_m3h: 580,
                cylinders: 8,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 700-2',
                displacement: 637,
                swept_volume_max_m3h: 637,
                cylinders: 4,
                max_rpm: 1200,
                rpm_range: [500, 1200],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 1100-2',
                displacement: 955,
                swept_volume_max_m3h: 955,
                cylinders: 6,
                max_rpm: 1200,
                rpm_range: [500, 1200],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 1400-2',
                displacement: 1274,
                swept_volume_max_m3h: 1274,
                cylinders: 8,
                max_rpm: 1200,
                rpm_range: [500, 1200],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 1800-2',
                displacement: 1593,
                swept_volume_max_m3h: 1593,
                cylinders: 10,
                max_rpm: 1200,
                rpm_range: [500, 1200],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            }
        ],
        'Grasso V HP (39 bar Heat Pump)': [
            {
                model: 'V 300-2 HP',
                displacement: 290,
                swept_volume_max_m3h: 290,
                cylinders: 4,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.04,
                refrigerants: ['R717']
            },
            {
                model: 'V 450-2 HP',
                displacement: 435,
                swept_volume_max_m3h: 435,
                cylinders: 6,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.04,
                refrigerants: ['R717']
            },
            {
                model: 'V 600-2 HP',
                displacement: 580,
                swept_volume_max_m3h: 580,
                cylinders: 8,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.04,
                refrigerants: ['R717']
            }
        ],
        'Grasso V XHP (63 bar High Temp)': [
            {
                model: 'V 350 XHP',
                displacement: 376,
                swept_volume_max_m3h: 376,
                cylinders: 4,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.045,
                refrigerants: ['R717']
            },
            {
                model: 'V 550 XHP',
                displacement: 564,
                swept_volume_max_m3h: 564,
                cylinders: 6,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.045,
                refrigerants: ['R717']
            },
            {
                model: 'V 750 XHP',
                displacement: 753,
                swept_volume_max_m3h: 753,
                cylinders: 8,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.045,
                refrigerants: ['R717']
            },
            {
                model: 'V 950 XHP',
                displacement: 941,
                swept_volume_max_m3h: 941,
                cylinders: 10,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.045,
                refrigerants: ['R717']
            }
        ]
    },
};

/**
 * 获取所有品牌列表
 * @returns {string[]} 品牌名称数组
 */
export function getAllBrands() {
    return Object.keys(COMPRESSOR_MODELS);
}

/**
 * 获取指定品牌的所有系列
 * @param {string} brand - 品牌名称
 * @returns {string[]} 系列名称数组
 */
export function getSeriesByBrand(brand) {
    if (!COMPRESSOR_MODELS[brand]) return [];
    return Object.keys(COMPRESSOR_MODELS[brand]);
}

/**
 * 获取指定品牌和系列的所有型号
 * @param {string} brand - 品牌名称
 * @param {string} series - 系列名称
 * @returns {Array<{model: string, displacement: number}>} 型号数组
 */
export function getModelsBySeries(brand, series) {
    if (!COMPRESSOR_MODELS[brand] || !COMPRESSOR_MODELS[brand][series]) return [];
    return COMPRESSOR_MODELS[brand][series];
}

/**
 * 根据型号查找理论排量
 * @param {string} brand - 品牌名称
 * @param {string} series - 系列名称
 * @param {string} model - 型号
 * @returns {number|null} 理论排量 (m³/h)，未找到返回 null
 */
export function getDisplacementByModel(brand, series, model) {
    const models = getModelsBySeries(brand, series);
    const found = models.find(m => m.model === model);
    return found ? found.displacement : null;
}

/**
 * 获取完整型号对象（包括可能存在的扩展字段）
 * @param {string} brand
 * @param {string} series
 * @param {string} model
 * @returns {{model: string, displacement: number}|null}
 */
export function getModelDetail(brand, series, model) {
    const models = getModelsBySeries(brand, series);
    const found = models.find(m => m.model === model);
    return found || null;
}

/**
 * 根据制冷剂类型的排气温度限制配置
 * 根据 GEA 服务手册和工程实践定义
 * 这是主要限制，基于制冷剂物性（润滑油分解温度）
 */
export const DISCHARGE_TEMP_LIMITS_BY_REFRIGERANT = {
    'R717': {  // 氨 (Ammonia)
        warn: 140,  // °C
        max: 155     // °C (绝对限制，超过此温度需要喷液或两级压缩)
    },
    'R744': {  // CO2
        warn: 130,  // °C
        max: 140     // °C
    }
};

/**
 * 压缩机系列排气温度限制配置（作为补充，基于硬件设计）
 * 根据 GEA 服务手册和工程实践定义
 */
export const DISCHARGE_TEMP_LIMITS = {
    // Standard V Series (NH3) - 标准氨系列
    'Grasso V (25 bar)': {
        warning: 140,  // °C
        trip: 150      // °C
    },
    // V HP Series (Heat Pump) - 热泵系列
    'Grasso V HP (40 bar)': {
        warning: 150,  // °C
        trip: 160      // °C
    },
    // V XHP Series (High Temp) - 高温系列
    'Grasso V XHP (63 bar High Temp)': {
        warning: 160,  // °C
        trip: 170      // °C (绝对机械限制，根据 GEA 服务手册)
    },
    // 5HP Series (CO2) - CO2 系列
    'Grasso 5HP (50 bar)': {
        warning: 130,  // °C
        trip: 140      // °C
    }
};

/**
 * 获取制冷剂类型的排气温度限制（主要方法）
 * @param {string} fluid - 制冷剂名称，如 'R717', 'R744'
 * @returns {{warn: number, max: number}|null} 返回限制对象，未找到返回 null
 */
export function getDischargeTempLimitsByRefrigerant(fluid) {
    if (DISCHARGE_TEMP_LIMITS_BY_REFRIGERANT[fluid]) {
        return DISCHARGE_TEMP_LIMITS_BY_REFRIGERANT[fluid];
    }
    
    // 如果未找到，返回默认值（保守值，基于氨的限制）
    return {
        warn: 140,
        max: 155
    };
}

/**
 * 获取压缩机系列的排气温度限制（补充方法，基于硬件设计）
 * @param {string} brand - 品牌名称
 * @param {string} series - 系列名称
 * @returns {{warning: number, trip: number}|null} 返回限制对象，未找到返回 null
 */
export function getDischargeTempLimits(brand, series) {
    // 直接匹配系列名称
    if (DISCHARGE_TEMP_LIMITS[series]) {
        return DISCHARGE_TEMP_LIMITS[series];
    }
    
    // 如果未找到，返回默认值（保守值）
    return {
        warning: 140,
        trip: 150
    };
}

/**
 * 根据完整型号字符串查找理论排量（自动匹配品牌和系列）
 * @param {string} modelString - 完整型号，如 "LG12.5" 或 "VLG163D"
 * @returns {number|null} 理论排量 (m³/h)，未找到返回 null
 */
export function findDisplacementByModelString(modelString) {
    for (const brand of getAllBrands()) {
        for (const series of getSeriesByBrand(brand)) {
            const displacement = getDisplacementByModel(brand, series, modelString);
            if (displacement !== null) {
                return displacement;
            }
        }
    }
    return null;
}

/**
 * 根据模式获取过滤后的品牌列表
 * @param {string} mode - 模式标识: 'm2', 'm3', 'm4', 'm5', 'm6'
 * @returns {string[]} 过滤后的品牌名称数组
 */
export function getFilteredBrands(mode) {
    // RCC Pro: 所有模式都使用 GEA Grasso 品牌
    return ['GEA Grasso'];
}

/**
 * 根据模式和品牌获取过滤后的系列列表
 * @param {string} mode - 模式标识: 'm2', 'm3', 'm4', 'm5', 'm6'
 * @param {string} brand - 品牌名称
 * @param {string|null} level - 级别标识: 'ht' (高温级), 'lt' (低温级), null (单级或其他)
 * @returns {string[]} 过滤后的系列名称数组
 */
export function getFilteredSeriesByBrand(mode, brand, level = null) {
    // RCC Pro: GEA Grasso 品牌的所有系列都可用
    return getSeriesByBrand(brand);
}

