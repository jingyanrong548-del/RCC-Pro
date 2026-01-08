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
    'MYCOM': {
        'HS Series (6.0 MPaG High Pressure Heat Pump)': [
            {
                model: '4HS',
                displacement: 388,  // 参考转速下的理论排量（与样本一致）
                referenceRpm: 1450,  // 参考转速（样本标注的转速）
                referenceDisplacement: 388,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 401.38,  // 最大转速1500rpm下的扫气量（用于计算）
                cylinders: 4,
                max_rpm: 1500,
                rpm_range: [750, 1500],
                clearance_factor: 0.045,  // 热泵工况典型值
                refrigerants: ['R717', 'R744'],
                // 调试参考：样本标注 4HS @1450rpm = 388 m³/h，理论计算 = 388.00 m³/h
                debug_reference: 'At 1450 rpm, 4HS displacement should be 388 m³/h'
            },
            {
                model: '6HS',
                displacement: 582,  // 参考转速下的理论排量（与样本一致）
                referenceRpm: 1450,  // 参考转速（样本标注的转速）
                referenceDisplacement: 582,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 602.07,  // 最大转速1500rpm下的扫气量（用于计算）
                cylinders: 6,
                max_rpm: 1500,
                rpm_range: [750, 1500],
                clearance_factor: 0.045,  // 热泵工况典型值
                refrigerants: ['R717', 'R744'],
                // 调试参考：样本标注 6HS @1450rpm = 582 m³/h，理论计算 = 582.00 m³/h
                debug_reference: 'At 1450 rpm, 6HS displacement should be 582 m³/h'
            }
        ],
        'HK Series (5.0 MPaG High Pressure CO2/Heat Pump)': [
            {
                model: '4HK-P',
                displacement: 128,  // 参考转速下的理论排量（与样本一致）
                referenceRpm: 1450,  // 参考转速（样本标注的转速）
                referenceDisplacement: 128,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 159.34,  // 最大转速1800rpm下的扫气量（用于计算）
                cylinders: 4,
                max_rpm: 1800,
                rpm_range: [900, 1800],
                clearance_factor: 0.045,  // 热泵/CO2工况典型值
                refrigerants: ['R717', 'R744'],
                // 调试参考：样本标注 4HK-P @1450rpm = 128 m³/h，理论计算 = 128.36 m³/h
                debug_reference: 'At 1450 rpm, 4HK-P displacement should be 128 m³/h'
            },
            {
                model: '6HK',
                displacement: 193,  // 参考转速下的理论排量（与样本一致）
                referenceRpm: 1450,  // 参考转速（样本标注的转速）
                referenceDisplacement: 193,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 239.01,  // 最大转速1800rpm下的扫气量（用于计算）
                cylinders: 6,
                max_rpm: 1800,
                rpm_range: [900, 1800],
                clearance_factor: 0.045,  // 热泵/CO2工况典型值
                refrigerants: ['R717', 'R744'],
                // 调试参考：样本标注 6HK @1450rpm = 193 m³/h，理论计算 = 192.54 m³/h
                debug_reference: 'At 1450 rpm, 6HK displacement should be 193 m³/h'
            }
        ],
        'M-II Series (3.0 MPaG High Efficiency Ammonia)': [
            {
                model: '2MII',
                displacement: 207,  // 参考转速下的理论排量（与样本一致）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 207,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 319.43,  // 最大转速1500rpm下的扫气量（用于计算）
                cylinders: 2,
                max_rpm: 1500,
                rpm_range: [600, 1500],  // 水冷氨机转速范围（样本：600-1500 rpm）
                clearance_factor: 0.035,  // 高效氨机典型值
                refrigerants: ['R717', 'Propane', 'HFCs'],
                // 调试参考：样本标注 2MII @970rpm = 207 m³/h，理论计算 = 206.56 m³/h
                debug_reference: 'At 970 rpm, 2MII displacement should be 207 m³/h'
            },
            {
                model: '4MII',
                displacement: 413,  // 参考转速下的理论排量（与样本一致）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 413,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 638.86,  // 最大转速1500rpm下的扫气量（用于计算）
                cylinders: 4,
                max_rpm: 1500,
                rpm_range: [600, 1500],  // 水冷氨机转速范围（样本：600-1500 rpm）
                clearance_factor: 0.035,  // 高效氨机典型值
                refrigerants: ['R717', 'Propane', 'HFCs'],
                // 调试参考：样本标注 4MII @970rpm = 413 m³/h，理论计算 = 413.13 m³/h
                debug_reference: 'At 970 rpm, 4MII displacement should be 413 m³/h'
            },
            {
                model: '6MII',
                displacement: 620,  // 参考转速下的理论排量（与样本一致）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 620,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 958.29,  // 最大转速1500rpm下的扫气量（用于计算）
                cylinders: 6,
                max_rpm: 1500,
                rpm_range: [600, 1500],  // 水冷氨机转速范围（样本：600-1500 rpm）
                clearance_factor: 0.035,  // 高效氨机典型值
                refrigerants: ['R717', 'Propane', 'HFCs'],
                // 调试参考：样本标注 6MII @970rpm = 620 m³/h，理论计算 = 619.69 m³/h
                debug_reference: 'At 970 rpm, 6MII displacement should be 620 m³/h'
            },
            {
                model: '8MII',
                displacement: 826,  // 参考转速下的理论排量（与样本一致）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 826,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 1277.71,  // 最大转速1500rpm下的扫气量（用于计算）
                cylinders: 8,
                max_rpm: 1500,
                rpm_range: [600, 1500],  // 水冷氨机转速范围（样本：600-1500 rpm）
                clearance_factor: 0.035,  // 高效氨机典型值
                refrigerants: ['R717', 'Propane', 'HFCs'],
                // 调试参考：样本标注 8MII @970rpm = 826 m³/h，理论计算 = 826.26 m³/h
                debug_reference: 'At 970 rpm, 8MII displacement should be 826 m³/h'
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
 * 
 * 注意：对于热泵应用（V HP/XHP系列），由于设计用于更高温度工况，
 * 实际限制应该参考压缩机系列限制（DISCHARGE_TEMP_LIMITS）
 */
export const DISCHARGE_TEMP_LIMITS_BY_REFRIGERANT = {
    'R717': {  // 氨 (Ammonia)
        // 标准制冷工况限制（用于V系列标准型号）
        warn: 140,  // °C - 标准制冷工况警告温度
        max: 155     // °C - 标准制冷工况绝对限制（超过此温度需要喷液或两级压缩）
        // 注意：对于热泵工况（V HP/XHP系列），应使用系列限制，通常更高
    },
    'R744': {  // CO2
        warn: 130,  // °C
        max: 140     // °C
    }
};

/**
 * 压缩机系列排气温度限制配置（作为补充，基于硬件设计）
 * 根据 GEA 服务手册和工程实践定义
 * 
 * 重要说明：
 * - 对于热泵应用（V HP/XHP系列），这些限制优先于制冷剂限制
 * - 标准制冷工况（V系列）应同时考虑制冷剂限制和系列限制，取较小值
 * - 热泵工况下，压缩机设计用于更高温度，系列限制通常更宽松
 */
export const DISCHARGE_TEMP_LIMITS = {
    // Standard V Series (NH3) - 标准氨系列 (25 bar)
    // 用于标准制冷工况，温度限制较保守
    'Grasso V (25 bar)': {
        warning: 140,  // °C - 标准氨制冷工况警告温度
        trip: 150      // °C - 标准氨制冷工况跳闸温度
    },
    // V HP Series (Heat Pump) - 热泵系列 (39 bar)
    // 注意：系列名称必须与COMPRESSOR_MODELS中的完全一致
    // 根据GEA资料，V HP系列设计用于热泵应用，可承受更高排气温度
    'Grasso V HP (39 bar Heat Pump)': {
        warning: 150,  // °C - 热泵工况警告温度（根据GEA技术资料，V HP系列设计用于更高温度工况）
        trip: 160      // °C - 热泵工况跳闸温度（绝对限制，超过此温度存在严重风险）
    },
    // V XHP Series (High Temp) - 高温系列 (63 bar)
    // 根据GEA资料，XHP系列最高供水温度可达95°C，对应排气温度更高
    'Grasso V XHP (63 bar High Temp)': {
        warning: 160,  // °C - 高温工况警告温度（根据GEA资料，XHP系列设计用于最高温度工况）
        trip: 170      // °C - 高温工况跳闸温度（绝对机械限制，根据 GEA 服务手册）
    },
    // 5HP Series (CO2) - CO2 系列 (50 bar)
    // CO2工况下温度限制较低
    'Grasso 5HP (50 bar)': {
        warning: 130,  // °C - CO2工况警告温度
        trip: 140      // °C - CO2工况跳闸温度
    },
    // MYCOM HS Series (High Pressure Heat Pump) - 高压热泵系列 (6.0 MPaG / 60 bar)
    // 根据MYCOM技术资料，HS系列设计用于高温热泵应用（可达90°C供水）
    // 90°C供水对应更高排气温度，因此提高温度限制
    'HS Series (6.0 MPaG High Pressure Heat Pump)': {
        warning: 170,  // °C - 高温热泵工况警告温度（90°C供水对应更高排气温度）
        trip: 180      // °C - 高温热泵工况跳闸温度（绝对机械限制）
    },
    // MYCOM HK Series (High Pressure CO2/Heat Pump) - 高压CO2/热泵系列 (5.0 MPaG / 50 bar)
    // 根据MYCOM技术资料，HK系列设计用于热泵/CO2应用（可达85°C冷凝）
    // 50 bar高压设计，可承受更高排气温度
    'HK Series (5.0 MPaG High Pressure CO2/Heat Pump)': {
        warning: 160,  // °C - 热泵/CO2工况警告温度（50 bar高压设计，可承受更高温度）
        trip: 170      // °C - 热泵/CO2工况跳闸温度
    },
    // MYCOM M-II Series (High Efficiency Ammonia) - 高效氨系列 (3.0 MPaG)
    // 根据MYCOM技术资料，M-II系列为水冷氨机，用于常规/中温热泵应用
    'M-II Series (3.0 MPaG High Efficiency Ammonia)': {
        warning: 140,  // °C - 标准氨制冷/热泵工况警告温度
        trip: 150      // °C - 标准氨制冷/热泵工况跳闸温度
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
 * @param {string} mode - 模式标识: 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'
 * @returns {string[]} 过滤后的品牌名称数组
 */
export function getFilteredBrands(mode) {
    // Mode 7 (氨热泵): 支持 GEA Grasso 和 MYCOM 品牌
    if (mode === 'm7') {
        return ['GEA Grasso', 'MYCOM'];
    }
    // 其他模式: 使用 GEA Grasso 品牌
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

