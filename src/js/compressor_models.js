// =====================================================================
// compressor_models.js: 压缩机型号数据库
// 职责: 存储各品牌压缩机的型号与理论排量数据，支持扩展
// =====================================================================

/**
 * 压缩机型号数据库
 * 结构: { brand: { series: [{ model, displacement }] } }
 * displacement 单位: m³/h (理论输气量)
 */
export const COMPRESSOR_MODELS = {
    '冰山': {
        'LG系列': [
            { model: 'LG12.5', displacement: 276 },
            { model: 'LG16', displacement: 580 },
            { model: 'LG20', displacement: 1215 },
            { model: 'LG25', displacement: 2395 },
            { model: 'LG31.5', displacement: 4622 }
        ],
        'VLG系列': [
            { model: 'VLG163D', displacement: 544 },
            { model: 'VLG163', displacement: 641 },
            { model: 'VLG193D', displacement: 892 },
            { model: 'VLG193T', displacement: 1237 },
            { model: 'VLG234D', displacement: 1600 },
            { model: 'VLG234', displacement: 1872 },
            { model: 'VLG268D', displacement: 2401 },
            { model: 'VLG268', displacement: 2829 },
            { model: 'VLG268T', displacement: 3327 },
            { model: 'VLG324D', displacement: 4248 },
            { model: 'VLG324', displacement: 5006 },
            { model: 'VLG324T', displacement: 5886 },
            { model: 'VLG373D', displacement: 6454 },
            { model: 'VLG373', displacement: 7606 },
            { model: 'VLG373T', displacement: 8943 }
        ],
        'LGC系列': [
            { model: 'LGC12.5DZ', displacement: 170 },
            { model: 'LGC12.5Z', displacement: 250 },
            { model: 'LGC16Z', displacement: 400 }
        ]
    }
    // 预留扩展：冰轮系列、武冷系列、MYCOM 系列等
    // '冰轮': { ... },
    // '武冷': { ... },
    // 'MYCOM': { ... }
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

