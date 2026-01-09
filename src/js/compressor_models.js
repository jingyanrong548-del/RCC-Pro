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
        ],
        'Grasso V HS (25 bar High Speed)': [
            {
                model: 'V 300-2 HS',
                displacement: 348,
                swept_volume_max_m3h: 348,
                cylinders: 4,
                max_rpm: 1800,
                rpm_range: [500, 1800],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 450-2 HS',
                displacement: 522,
                swept_volume_max_m3h: 522,
                cylinders: 6,
                max_rpm: 1800,
                rpm_range: [500, 1800],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 600-2 HS',
                displacement: 696,
                swept_volume_max_m3h: 696,
                cylinders: 8,
                max_rpm: 1800,
                rpm_range: [500, 1800],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 700-2 HS',
                displacement: 764,
                swept_volume_max_m3h: 764,
                cylinders: 4,
                max_rpm: 1800,
                rpm_range: [500, 1800],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 1100-2 HS',
                displacement: 1146,
                swept_volume_max_m3h: 1146,
                cylinders: 6,
                max_rpm: 1800,
                rpm_range: [500, 1800],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 1400-2 HS',
                displacement: 1528,
                swept_volume_max_m3h: 1528,
                cylinders: 8,
                max_rpm: 1800,
                rpm_range: [500, 1800],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 1800-2 HS',
                displacement: 1991,
                swept_volume_max_m3h: 1991,
                cylinders: 10,
                max_rpm: 1500,
                rpm_range: [500, 1500],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            }
        ],
        'Grasso V CM (25 bar Large Series)': [
            {
                model: 'V 700 CM',
                displacement: 530,
                swept_volume_max_m3h: 530,
                cylinders: 4,
                max_rpm: 1000,
                rpm_range: [500, 1000],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 1100 CM',
                displacement: 795,
                swept_volume_max_m3h: 795,
                cylinders: 6,
                max_rpm: 1000,
                rpm_range: [500, 1000],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 1400 CM',
                displacement: 1060,
                swept_volume_max_m3h: 1060,
                cylinders: 8,
                max_rpm: 1000,
                rpm_range: [500, 1000],
                clearance_factor: 0.035,
                refrigerants: ['R717']
            },
            {
                model: 'V 1800 CM',
                displacement: 1325,
                swept_volume_max_m3h: 1325,
                cylinders: 10,
                max_rpm: 1000,
                rpm_range: [500, 1000],
                clearance_factor: 0.035,
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
        ],
        'WBHE Series (Two Stage Open Type)': [
            {
                model: '42WBHE',
                displacement: 309,  // 低压级排量 @970rpm（样本值）
                disp_lp: 309,  // 低压级排量 (m³/h) @970rpm
                disp_hp: 155,  // 高压级排量 (m³/h) @970rpm
                vi_ratio: 309 / 155,  // 容积比 (Vi,L / Vi,H) ≈ 1.99
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 309,  // 参考转速下的低压级排量（样本值）
                swept_volume_max_m3h: 382.22,  // 最大转速1200rpm下的低压级扫气量（用于计算）
                cylinders_lp: 4,  // 低压级气缸数
                cylinders_hp: 2,  // 高压级气缸数
                cylinders: 6,  // 总气缸数（4+2）
                bore_mm: 130,  // 缸径（样本数据）
                stroke_mm: 100,  // 行程（样本数据）
                max_rpm: 1200,
                rpm_range: [800, 1200],  // 样本标注：800-1200 rpm
                clearance_factor: 0.04,  // 大型压缩机典型值
                refrigerants: ['R717', 'R404A', 'R507A'],  // 样本数据：氨 / HFCs (R404A, R507A)
                capacity_control: [100, 50],  // 容量控制：100/50（样本数据）
                // 样本数据：42WBHE @970rpm = 低段 309 m³/h, 高段 155 m³/h，缸径130mm，行程100mm
                // 样本说明：超过15,000台使用记录，行业领先的可靠性，适用于大型深冷应用
                debug_reference: 'At 970 rpm, 42WBHE: LP=309 m³/h, HP=155 m³/h (sample data)'
            },
            {
                model: '62WBHE',
                displacement: 464,  // 低压级排量 @970rpm（样本值）
                disp_lp: 464,  // 低压级排量 (m³/h) @970rpm
                disp_hp: 155,  // 高压级排量 (m³/h) @970rpm
                vi_ratio: 464 / 155,  // 容积比 (Vi,L / Vi,H) ≈ 2.99
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 464,  // 参考转速下的低压级排量（样本值）
                swept_volume_max_m3h: 573.40,  // 最大转速1200rpm下的低压级扫气量（用于计算）
                cylinders_lp: 6,  // 低压级气缸数
                cylinders_hp: 2,  // 高压级气缸数
                cylinders: 8,  // 总气缸数（6+2）
                bore_mm: 130,  // 缸径（样本数据）
                stroke_mm: 100,  // 行程（样本数据）
                max_rpm: 1200,
                rpm_range: [800, 1200],  // 样本标注：800-1200 rpm
                clearance_factor: 0.04,  // 大型压缩机典型值
                refrigerants: ['R717', 'R404A', 'R507A'],  // 样本数据：氨 / HFCs (R404A, R507A)
                capacity_control: [100, 66, 33],  // 容量控制：100/66/33（样本数据）
                // 样本数据：62WBHE @970rpm = 低段 464 m³/h, 高段 155 m³/h，缸径130mm，行程100mm
                // 样本说明：超过15,000台使用记录，行业领先的可靠性，适用于大型深冷应用
                debug_reference: 'At 970 rpm, 62WBHE: LP=464 m³/h, HP=155 m³/h (sample data)'
            }
        ],
        'M II Series (Two Stage Open Type)': [
            {
                model: '62M II',
                displacement: 620,  // 低压级排量 @970rpm（样本值）
                disp_lp: 620,  // 低压级排量 (m³/h) @970rpm
                disp_hp: 207,  // 高压级排量 (m³/h) @970rpm
                vi_ratio: 620 / 207,  // 容积比 (Vi,L / Vi,H) ≈ 2.99
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 620,  // 参考转速下的低压级排量（样本值）
                swept_volume_max_m3h: 958.76,  // 最大转速1500rpm下的低压级扫气量（用于计算）
                cylinders_lp: 6,  // 低压级气缸数
                cylinders_hp: 2,  // 高压级气缸数
                cylinders: 8,  // 总气缸数（6+2）
                bore_mm: 146,  // 缸径（样本数据）
                stroke_mm: 106,  // 行程（样本数据）
                max_rpm: 1500,
                rpm_range: [800, 1500],  // 样本标注：800-1500 rpm
                clearance_factor: 0.035,  // 高效氨机典型值（与M-II单级系列相同）
                refrigerants: ['R717', 'R404A', 'R507A'],  // 样本数据：Ammonia / HFCs (R404A, R507A)
                capacity_control: [100, 66, 33],  // 容量控制：100/66/33（样本数据）
                drive_method: 'Direct drive / Overhang motor / V-belt',  // 驱动方式（样本数据）
                // 样本数据：62M II @970rpm = 低段 620 m³/h, 高段 207 m³/h，缸径146mm，行程106mm
                // 样本说明：新一代节能压缩机，性能、耐久性和耐高压性卓越，适用于大型深冷应用
                // 大修间隔大幅延长至16,000小时（相比传统M系列翻倍）
                debug_reference: 'At 970 rpm, 62M II: LP=620 m³/h, HP=207 m³/h (sample data from MYCOM M II-SERIES brochure)'
            }
        ],
        'WA Series (Two Stage Open Type)': [
            {
                model: '42WA',
                displacement: 125,  // 低压级排量 @970rpm（样本值）
                disp_lp: 125,  // 低压级排量 (m³/h) @970rpm
                disp_hp: 62.7,  // 高压级排量 (m³/h) @970rpm
                vi_ratio: 125 / 62.7,  // 容积比 (Vi,L / Vi,H) ≈ 1.99
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 125,  // 参考转速下的低压级排量（样本值）
                swept_volume_max_m3h: 193.30,  // 最大转速1500rpm下的低压级扫气量（用于计算）
                cylinders_lp: 4,  // 低压级气缸数
                cylinders_hp: 2,  // 高压级气缸数
                cylinders: 6,  // 总气缸数（4+2）
                bore_mm: 95,  // 缸径（样本数据）
                stroke_mm: 76,  // 行程（样本数据）
                max_rpm: 1500,
                rpm_range: [800, 1500],  // 样本标注：800-1500 rpm
                clearance_factor: 0.04,  // 中型压缩机典型值
                refrigerants: ['R717', 'R404A', 'R507A'],  // 样本数据：氨 / HFCs (R404A, R507A)
                capacity_control: [100, 50],  // 容量控制：100/50（样本数据）
                drive_method: 'Direct drive / V-belt',  // 驱动方式（样本数据）
                // 样本数据：42WA @970rpm = 低段 125 m³/h, 高段 62.7 m³/h，缸径95mm，行程76mm
                // 样本说明：适用于风冷冷凝器，适用于中小规模深冷应用，长销型号，高可靠性
                debug_reference: 'At 970 rpm, 42WA: LP=125 m³/h, HP=62.7 m³/h (sample data from MYCOM WA-SERIES brochure)'
            },
            {
                model: '62WA',
                displacement: 188,  // 低压级排量 @970rpm（样本值）
                disp_lp: 188,  // 低压级排量 (m³/h) @970rpm
                disp_hp: 62.7,  // 高压级排量 (m³/h) @970rpm
                vi_ratio: 188 / 62.7,  // 容积比 (Vi,L / Vi,H) ≈ 3.00
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 188,  // 参考转速下的低压级排量（样本值）
                swept_volume_max_m3h: 290.72,  // 最大转速1500rpm下的低压级扫气量（用于计算）
                cylinders_lp: 6,  // 低压级气缸数
                cylinders_hp: 2,  // 高压级气缸数
                cylinders: 8,  // 总气缸数（6+2）
                bore_mm: 95,  // 缸径（样本数据）
                stroke_mm: 76,  // 行程（样本数据）
                max_rpm: 1500,
                rpm_range: [800, 1500],  // 样本标注：800-1500 rpm
                clearance_factor: 0.04,  // 中型压缩机典型值
                refrigerants: ['R717', 'R404A', 'R507A'],  // 样本数据：氨 / HFCs (R404A, R507A)
                capacity_control: [100, 66, 33],  // 容量控制：100/66/33（样本数据）
                drive_method: 'Direct drive / V-belt',  // 驱动方式（样本数据）
                // 样本数据：62WA @970rpm = 低段 188 m³/h, 高段 62.7 m³/h，缸径95mm，行程76mm
                // 样本说明：适用于风冷冷凝器，适用于中小规模深冷应用，长销型号，高可靠性
                debug_reference: 'At 970 rpm, 62WA: LP=188 m³/h, HP=62.7 m³/h (sample data from MYCOM WA-SERIES brochure)'
            }
        ],
        'WA Series (Medium Size Single-Stage)': [
            {
                model: '4WA',
                displacement: 125,  // 参考转速970rpm下的理论排量（样本值）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 125,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 193.30,  // 最大转速1500rpm下的扫气量（用于计算）
                cylinders: 4,
                max_rpm: 1500,
                rpm_range: [800, 1500],  // 样本标注：800-1500 rpm
                clearance_factor: 0.04,  // 中型压缩机典型值
                refrigerants: ['R717', 'Propane', 'R134a', 'R404A', 'R507A', 'R23'],
                // 样本数据：4WA @970rpm = 125 m³/h，缸径95mm，行程76mm
                // 容量控制：100/50
                debug_reference: 'At 970 rpm, 4WA displacement should be 125 m³/h (sample data)'
            },
            {
                model: '6WA',
                displacement: 188,  // 参考转速970rpm下的理论排量（样本值）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 188,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 290.72,  // 最大转速1500rpm下的扫气量（用于计算）
                cylinders: 6,
                max_rpm: 1500,
                rpm_range: [800, 1500],  // 样本标注：800-1500 rpm
                clearance_factor: 0.04,  // 中型压缩机典型值
                refrigerants: ['R717', 'Propane', 'R134a', 'R404A', 'R507A', 'R23'],
                // 样本数据：6WA @970rpm = 188 m³/h，缸径95mm，行程76mm
                // 容量控制：100/66/33
                debug_reference: 'At 970 rpm, 6WA displacement should be 188 m³/h (sample data)'
            },
            {
                model: '8WA',
                displacement: 251,  // 参考转速970rpm下的理论排量（样本值）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 251,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 387.89,  // 最大转速1500rpm下的扫气量（用于计算）
                cylinders: 8,
                max_rpm: 1500,
                rpm_range: [800, 1500],  // 样本标注：800-1500 rpm
                clearance_factor: 0.04,  // 中型压缩机典型值
                refrigerants: ['R717', 'Propane', 'R134a', 'R404A', 'R507A', 'R23'],
                // 样本数据：8WA @970rpm = 251 m³/h，缸径95mm，行程76mm
                // 容量控制：100/75/50/25
                // 样本说明：适用于风冷冷凝器，适用于中小规模制冷和冷冻应用
                debug_reference: 'At 970 rpm, 8WA displacement should be 251 m³/h (sample data)'
            }
        ],
        'K Series (Multi-Refrigerant Small Compressors)': [
            {
                model: '2K',
                displacement: 79.7,  // 最大转速1800rpm下的理论排量（用于计算）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 42.9,  // 参考转速970rpm下的排量（样本值）
                swept_volume_max_m3h: 79.7,  // 最大转速1800rpm下的扫气量（用于计算）
                cylinders: 2,
                bore_mm: 85,  // 缸径（样本数据）
                stroke_mm: 65,  // 行程（样本数据）
                max_rpm: 1800,
                rpm_range: [800, 1800],  // 样本标注：800-1800 rpm
                clearance_factor: 0.04,  // 小型压缩机典型值
                refrigerants: ['R717', 'Propane', 'Propylene', 'R134a', 'R407C', 'R407F', 'R404A', 'R507A'],
                drive_method: 'Direct drive/V-belt',  // 驱动方式（样本数据）
                capacity_control: {  // 容量控制（样本数据）
                    'R717': [100, 50],  // 氨：100/50
                    'Propane_Propylene_HFCs': [100, 50]  // 丙烷/丙烯/HFCs：100/50
                },
                // 样本数据：2K @970rpm = 42.9 m³/h，缸径85mm，行程65mm
                // 容量控制：氨 100/50，丙烷/丙烯/HFCs 100/50
                debug_reference: 'At 970 rpm, 2K displacement should be 42.9 m³/h (sample data)'
            },
            {
                model: '4K',
                displacement: 159.5,  // 最大转速1800rpm下的理论排量（用于计算）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 85.9,  // 参考转速970rpm下的排量（样本值）
                swept_volume_max_m3h: 159.5,  // 最大转速1800rpm下的扫气量（用于计算）
                cylinders: 4,
                bore_mm: 85,  // 缸径（样本数据）
                stroke_mm: 65,  // 行程（样本数据）
                max_rpm: 1800,
                rpm_range: [800, 1800],  // 样本标注：800-1800 rpm
                clearance_factor: 0.04,  // 小型压缩机典型值
                refrigerants: ['R717', 'Propane', 'Propylene', 'R134a', 'R407C', 'R407F', 'R404A', 'R507A'],
                drive_method: 'Direct drive/V-belt',  // 驱动方式（样本数据）
                capacity_control: {  // 容量控制（样本数据）
                    'R717': [100, 50],  // 氨：100/50
                    'Propane_Propylene_HFCs': [100, 75, 50, 25]  // 丙烷/丙烯/HFCs：100/75/50/25
                },
                // 样本数据：4K @970rpm = 85.9 m³/h，缸径85mm，行程65mm
                // 容量控制：氨 100/50，丙烷/丙烯/HFCs 100/75/50/25
                debug_reference: 'At 970 rpm, 4K displacement should be 85.9 m³/h (sample data)'
            },
            {
                model: '6K',
                displacement: 239.6,  // 最大转速1800rpm下的理论排量（用于计算）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 129,  // 参考转速970rpm下的排量（样本值）
                swept_volume_max_m3h: 239.6,  // 最大转速1800rpm下的扫气量（用于计算）
                cylinders: 6,
                bore_mm: 85,  // 缸径（样本数据）
                stroke_mm: 65,  // 行程（样本数据）
                max_rpm: 1800,
                rpm_range: [800, 1800],  // 样本标注：800-1800 rpm
                clearance_factor: 0.04,  // 小型压缩机典型值
                refrigerants: ['R717', 'Propane', 'Propylene', 'R134a', 'R407C', 'R407F', 'R404A', 'R507A'],
                drive_method: 'Direct drive/V-belt',  // 驱动方式（样本数据）
                capacity_control: {  // 容量控制（样本数据）
                    'R717': [100, 66, 33],  // 氨：100/66/33
                    'Propane_Propylene_HFCs': [100, 83, 66, 50, 33]  // 丙烷/丙烯/HFCs：100/83/66/50/33
                },
                // 样本数据：6K @970rpm = 129 m³/h，缸径85mm，行程65mm
                // 容量控制：氨 100/66/33，丙烷/丙烯/HFCs 100/83/66/50/33
                debug_reference: 'At 970 rpm, 6K displacement should be 129 m³/h (sample data)'
            },
            {
                model: '8K',
                displacement: 319.2,  // 最大转速1800rpm下的理论排量（用于计算）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 172,  // 参考转速970rpm下的排量（样本值）
                swept_volume_max_m3h: 319.2,  // 最大转速1800rpm下的扫气量（用于计算）
                cylinders: 8,
                bore_mm: 85,  // 缸径（样本数据）
                stroke_mm: 65,  // 行程（样本数据）
                max_rpm: 1800,
                rpm_range: [800, 1800],  // 样本标注：800-1800 rpm
                clearance_factor: 0.04,  // 小型压缩机典型值
                refrigerants: ['R717', 'Propane', 'Propylene', 'R134a', 'R407C', 'R407F', 'R404A', 'R507A'],
                drive_method: 'Direct drive/V-belt',  // 驱动方式（样本数据）
                capacity_control: {  // 容量控制（样本数据）
                    'R717': [100, 75, 50, 25],  // 氨：100/75/50/25
                    'Propane_Propylene_HFCs': [100, 75, 50, 25]  // 丙烷/丙烯/HFCs：100/75/50/25
                },
                // 样本数据：8K @970rpm = 172 m³/h，缸径85mm，行程65mm
                // 容量控制：氨 100/75/50/25，丙烷/丙烯/HFCs 100/75/50/25
                // 样本说明：多制冷剂小型压缩机，适用于直接/皮带驱动，支持多种制冷剂
                debug_reference: 'At 970 rpm, 8K displacement should be 172 m³/h (sample data)'
            }
        ],
        'L Series (Ammonia Exclusive Design)': [
            {
                model: '4L',
                displacement: 218,  // 参考转速970rpm下的理论排量（样本值）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 218,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 404.54,  // 最大转速1800rpm下的扫气量（用于计算）
                cylinders: 4,
                bore_mm: 115,  // 缸径（样本数据）
                stroke_mm: 90,  // 行程（样本数据）
                max_rpm: 1800,
                rpm_range: [1000, 1800],  // 样本标注：1000-1800 rpm
                clearance_factor: 0.035,  // 氨专用设计典型值
                refrigerants: ['R717'],  // 专为氨制冷剂设计
                drive_method: 'Direct drive/V-belt',  // 驱动方式（样本数据）
                capacity_control: [100, 50],  // 容量控制：100/50（样本数据）
                // 样本数据：4L @970rpm = 218 m³/h，缸径115mm，行程90mm
                // 样本说明：专为氨制冷剂设计的往复式压缩机，适用于制冷和冷冻应用
                debug_reference: 'At 970 rpm, 4L displacement should be 218 m³/h (sample data)'
            },
            {
                model: '6L',
                displacement: 326,  // 参考转速970rpm下的理论排量（样本值）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 326,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 604.96,  // 最大转速1800rpm下的扫气量（用于计算）
                cylinders: 6,
                bore_mm: 115,  // 缸径（样本数据）
                stroke_mm: 90,  // 行程（样本数据）
                max_rpm: 1800,
                rpm_range: [1000, 1800],  // 样本标注：1000-1800 rpm
                clearance_factor: 0.035,  // 氨专用设计典型值
                refrigerants: ['R717'],  // 专为氨制冷剂设计
                drive_method: 'Direct drive/V-belt',  // 驱动方式（样本数据）
                capacity_control: [100, 66, 33],  // 容量控制：100/66/33（样本数据）
                // 样本数据：6L @970rpm = 326 m³/h，缸径115mm，行程90mm
                // 样本说明：专为氨制冷剂设计的往复式压缩机，适用于制冷和冷冻应用
                debug_reference: 'At 970 rpm, 6L displacement should be 326 m³/h (sample data)'
            },
            {
                model: '8L',
                displacement: 435,  // 参考转速970rpm下的理论排量（样本值）
                referenceRpm: 970,  // 参考转速（样本标注的转速）
                referenceDisplacement: 435,  // 参考转速下的排量（样本值）
                swept_volume_max_m3h: 807.23,  // 最大转速1800rpm下的扫气量（用于计算）
                cylinders: 8,
                bore_mm: 115,  // 缸径（样本数据）
                stroke_mm: 90,  // 行程（样本数据）
                max_rpm: 1800,
                rpm_range: [1000, 1800],  // 样本标注：1000-1800 rpm
                clearance_factor: 0.035,  // 氨专用设计典型值
                refrigerants: ['R717'],  // 专为氨制冷剂设计
                drive_method: 'Direct drive/V-belt',  // 驱动方式（样本数据）
                capacity_control: [100, 75, 50, 25],  // 容量控制：100/75/50/25（样本数据）
                // 样本数据：8L @970rpm = 435 m³/h，缸径115mm，行程90mm
                // 样本说明：专为氨制冷剂设计的往复式压缩机，适用于制冷和冷冻应用，适应宽运行范围
                debug_reference: 'At 970 rpm, 8L displacement should be 435 m³/h (sample data)'
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
    // =========================================================
    // GEA Grasso 活塞压缩机排气温度限制（根据GEA实际情况）
    // =========================================================
    
    // 1. Grasso V (25 bar) - 标准氨系列
    // 设计压力：25 bar，用于标准制冷工况
    // 根据GEA服务手册：标准氨制冷工况下，排气温度应控制在140°C以下，绝对限制150°C
    'Grasso V (25 bar)': {
        warning: 140,  // °C - 标准氨制冷工况警告温度（超过此温度建议检查工况或启用缸头冷却）
        trip: 150      // °C - 标准氨制冷工况跳闸温度（绝对限制，超过此温度存在润滑油分解风险）
    },
    
    // 2. Grasso V HS (25 bar High Speed) - 高速系列
    // 设计压力：25 bar，高速运行（最高1800 RPM），但压力等级与标准V系列相同
    // 虽然转速更高，但温度限制基于设计压力和材料，与标准V系列相同
    'Grasso V HS (25 bar High Speed)': {
        warning: 140,  // °C - 标准氨制冷工况警告温度（与标准V系列相同，基于25 bar设计压力）
        trip: 150      // °C - 标准氨制冷工况跳闸温度（与标准V系列相同）
    },
    
    // 3. Grasso V CM (25 bar Large Series) - 大型系列
    // 设计压力：25 bar，大型压缩机（低转速，最高1000 RPM），压力等级与标准V系列相同
    // 虽然尺寸更大，但温度限制基于设计压力，与标准V系列相同
    'Grasso V CM (25 bar Large Series)': {
        warning: 140,  // °C - 标准氨制冷工况警告温度（与标准V系列相同，基于25 bar设计压力）
        trip: 150      // °C - 标准氨制冷工况跳闸温度（与标准V系列相同）
    },
    
    // 4. Grasso V HP (39 bar Heat Pump) - 热泵系列
    // 设计压力：39 bar，专门设计用于热泵应用
    // 根据GEA技术资料：V HP系列设计用于更高温度工况，可承受更高排气温度
    // 热泵工况下，压缩机设计考虑了更高温度运行，材料和处理工艺相应提升
    'Grasso V HP (39 bar Heat Pump)': {
        warning: 150,  // °C - 热泵工况警告温度（根据GEA技术资料，V HP系列设计用于更高温度工况）
        trip: 160      // °C - 热泵工况跳闸温度（绝对限制，超过此温度存在严重风险）
    },
    
    // 5. Grasso V XHP (63 bar High Temp) - 高温系列
    // 设计压力：63 bar，最高设计压力，专门设计用于高温热泵应用
    // 根据GEA资料：XHP系列最高供水温度可达95°C，对应排气温度更高
    // 63 bar高压设计配合特殊材料和处理，可承受最高排气温度
    'Grasso V XHP (63 bar High Temp)': {
        warning: 160,  // °C - 高温工况警告温度（根据GEA资料，XHP系列设计用于最高温度工况，可达95°C供水）
        trip: 170      // °C - 高温工况跳闸温度（绝对机械限制，根据GEA服务手册，63 bar高压设计的极限）
    },
    
    // 6. Grasso 5HP (50 bar) - CO2系列
    // 设计压力：50 bar，专门设计用于CO2（R744）工况
    // CO2工况下，由于CO2的物性特点（临界温度31.1°C），排气温度限制较低
    // 根据GEA服务手册：CO2工况下，排气温度应控制在130°C以下，绝对限制140°C
    'Grasso 5HP (50 bar)': {
        warning: 130,  // °C - CO2工况警告温度（CO2对温度更敏感，需要更保守的限制）
        trip: 140      // °C - CO2工况跳闸温度（CO2工况绝对限制，超过此温度存在严重风险）
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
    },
    // MYCOM WBHE Series (Two Stage Open Type) - 双级开放式系列
    // 根据MYCOM技术资料，WBHE系列为大型双级压缩机，超过15000台使用记录
    // 设计压力与标准氨系列类似，用于标准制冷/热泵应用（特别是深冷应用）
    'WBHE Series (Two Stage Open Type)': {
        warning: 140,  // °C - 标准氨制冷/热泵工况警告温度
        trip: 150      // °C - 标准氨制冷/热泵工况跳闸温度
    },
    // MYCOM M II Series (Two Stage Open Type) - 双级开放式系列（新一代）
    // 根据MYCOM技术资料，M II系列为新一代高效双级压缩机，设计压力与标准氨系列类似
    // 采用新设计的阀结构，大修间隔延长至16,000小时，适用于大型深冷应用
    'M II Series (Two Stage Open Type)': {
        warning: 140,  // °C - 标准氨制冷/热泵工况警告温度
        trip: 150      // °C - 标准氨制冷/热泵工况跳闸温度
    },
    // MYCOM WA Series (Two Stage Open Type) - 双级开放式系列（中型）
    // 根据MYCOM技术资料，WA系列双级压缩机为中型双级压缩机，适用于风冷冷凝器
    // 设计压力与标准氨系列类似，用于标准制冷/热泵应用（特别是中小规模深冷应用）
    'WA Series (Two Stage Open Type)': {
        warning: 140,  // °C - 标准氨制冷/热泵工况警告温度
        trip: 150      // °C - 标准氨制冷/热泵工况跳闸温度
    },
    // MYCOM WA Series (Medium Size Single-Stage) - 中型单级系列
    // 根据MYCOM技术资料，WA系列为中型单级压缩机，适用于风冷冷凝器
    // 设计压力与标准氨系列类似，用于标准制冷/热泵应用
    'WA Series (Medium Size Single-Stage)': {
        warning: 140,  // °C - 标准氨制冷/热泵工况警告温度
        trip: 150      // °C - 标准氨制冷/热泵工况跳闸温度
    },
    // MYCOM K Series (Multi-Refrigerant Small Compressors) - 小型多制冷剂压缩机
    // 根据MYCOM技术资料，K系列为小型多制冷剂压缩机，支持800-1800rpm
    // 可用于热泵应用，但设计压力与标准氨系列类似
    'K Series (Multi-Refrigerant Small Compressors)': {
        warning: 140,  // °C - 标准氨制冷/热泵工况警告温度
        trip: 150      // °C - 标准氨制冷/热泵工况跳闸温度
    },
    // MYCOM L Series (Ammonia Exclusive Design) - 氨专用设计系列
    // 根据MYCOM技术资料，L系列专为氨制冷剂设计，支持1000-1800rpm
    // 设计压力与标准氨系列类似，用于标准氨制冷应用
    'L Series (Ammonia Exclusive Design)': {
        warning: 140,  // °C - 标准氨制冷工况警告温度
        trip: 150      // °C - 标准氨制冷工况跳闸温度
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
    // Mode 2 (制冷热泵单级)、Mode 5 (活塞压缩机单机双级) 和 Mode 7 (氨热泵): 支持 GEA Grasso 和 MYCOM 品牌
    if (mode === 'm2' || mode === 'm5' || mode === 'm7') {
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
    // Mode 5 (单机双级): MYCOM 品牌返回 WBHE、M II 和 WA 双级系列，GEA Grasso 品牌返回所有系列
    if (mode === 'm5') {
        if (brand === 'MYCOM') {
            return ['WBHE Series (Two Stage Open Type)', 'M II Series (Two Stage Open Type)', 'WA Series (Two Stage Open Type)'];
        } else if (brand === 'GEA Grasso') {
            // GEA Grasso 品牌的所有系列都可用
            return getSeriesByBrand(brand);
        }
    }
    
    // 其他模式: 返回所有系列
    return getSeriesByBrand(brand);
}

