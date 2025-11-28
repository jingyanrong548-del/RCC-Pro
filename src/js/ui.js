// =====================================================================
// ui.js: UI 界面交互逻辑 - (v3.0 Apple-Style 适配版)
// 职责: 处理 Glassmorphism 界面的状态切换、Tab 导航及输入框的视觉反馈。
// =====================================================================

export function initUI() {

    // --- 1. Top Navigation (Tab) Switching ---
    // 定义 Tab 的激活与非激活样式 (对应 Tailwind 类名)
    const activeTabClasses = ['bg-white', 'text-gray-900', 'shadow-sm', 'ring-1', 'ring-black/5'];
    const inactiveTabClasses = ['text-gray-500', 'hover:text-gray-900', 'hover:bg-white/50'];

    const tabs = [
        { btnId: 'tab-btn-m2', contentId: 'tab-content-m2' },
        { btnId: 'tab-btn-m3', contentId: 'tab-content-m3' }
    ];

    tabs.forEach(tab => {
        const btn = document.getElementById(tab.btnId);
        const content = document.getElementById(tab.contentId);

        if (btn && content) {
            btn.addEventListener('click', () => {
                // 重置所有 Tab 状态
                tabs.forEach(t => {
                    const b = document.getElementById(t.btnId);
                    const c = document.getElementById(t.contentId);
                    if(b && c) {
                        b.classList.remove(...activeTabClasses);
                        b.classList.add(...inactiveTabClasses);
                        c.classList.add('hidden');
                        c.classList.remove('active');
                    }
                });

                // 激活当前 Tab
                btn.classList.remove(...inactiveTabClasses);
                btn.classList.add(...activeTabClasses);
                content.classList.remove('hidden');
                
                // 简单的淡入动画触发
                content.classList.remove('opacity-0');
                content.classList.add('active', 'animate-fade-in'); 
            });
        }
    });

    // --- 2. 通用 Radio Group 监听器 (适配 Segmented Control) ---
    // 由于新的 UI 使用了 label 包裹 hidden input，点击 label 会自动触发 input change
    // 所以逻辑代码几乎不需要变，只需确保 name 对应正确
    function setupRadioToggle(radioName, onToggle) {
        const radios = document.querySelectorAll(`input[name="${radioName}"]`);
        if (!radios.length) return;
        
        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                if(radio.checked) onToggle(radio.value);
            });
        });
        
        // 初始化状态
        const checkedRadio = document.querySelector(`input[name="${radioName}"]:checked`);
        if (checkedRadio) onToggle(checkedRadio.value);
    }

    // --- 3. 模式一 (M2) 交互逻辑 ---
    
    // 3.1 流量模式切换 (RPM vs Flow)
    setupRadioToggle('flow_mode_m2', (value) => {
        const rpmInputs = document.getElementById('rpm-inputs-m2');
        const volInputs = document.getElementById('vol-inputs-m2');
        if (rpmInputs && volInputs) {
            rpmInputs.style.display = (value === 'rpm') ? 'grid' : 'none';
            volInputs.style.display = (value === 'vol') ? 'block' : 'none';
            
            // 切换 required 属性以防止表单验证错误
            rpmInputs.querySelectorAll('input').forEach(i => i.required = (value === 'rpm'));
            volInputs.querySelectorAll('input').forEach(i => i.required = (value === 'vol'));
        }
    });

    // 3.2 ECO 总开关 (Switch 交互)
    const ecoCheckbox = document.getElementById('enable_eco_m2');
    const ecoSettings = document.getElementById('eco-settings-m2');
    const ecoPlaceholder = document.getElementById('eco-placeholder-m2');

    if (ecoCheckbox && ecoSettings && ecoPlaceholder) {
        ecoCheckbox.addEventListener('change', () => {
            if (ecoCheckbox.checked) {
                ecoSettings.classList.remove('hidden');
                ecoPlaceholder.classList.add('hidden');
            } else {
                ecoSettings.classList.add('hidden');
                ecoPlaceholder.classList.remove('hidden');
            }
        });
        // 初始化
        ecoCheckbox.dispatchEvent(new Event('change'));
    }

    // 3.3 ECO 类型切换 (闪发罐 vs 过冷器)
    setupRadioToggle('eco_type_m2', (value) => {
        const subcoolerInputs = document.getElementById('eco-subcooler-inputs-m2');
        if (subcoolerInputs) {
            if (value === 'subcooler') {
                subcoolerInputs.classList.remove('hidden');
            } else {
                subcoolerInputs.classList.add('hidden');
            }
        }
    });

    // 3.4 ECO 压力模式 (Auto vs Manual)
    // 适配 Glass UI 的禁用样式
    setupRadioToggle('eco_press_mode_m2', (value) => {
        const tempInput = document.getElementById('temp_eco_sat_m2');
        if (!tempInput) return;

        if (value === 'auto') {
            tempInput.disabled = true;
            tempInput.placeholder = "Auto Calculated";
            tempInput.value = ""; 
            // Glass UI Disabled Style: 降低透明度，移除交互
            tempInput.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-100/50');
            tempInput.classList.remove('bg-white', 'focus:ring-2');
        } else {
            tempInput.disabled = false;
            tempInput.placeholder = "e.g. 35.0";
            if (tempInput.value === "") tempInput.value = "35"; 
            // Glass UI Active Style
            tempInput.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-100/50');
            tempInput.classList.add('bg-white', 'focus:ring-2');
        }
    });

    // 3.5 效率基准模式
    setupRadioToggle('eff_mode_m2', (value) => {
        const motorGroup = document.getElementById('motor-eff-group-m2');
        if (motorGroup) motorGroup.style.display = (value === 'input') ? 'block' : 'none';
        
        const label = document.getElementById('eta_s_label_m2');
        if (label) {
            label.textContent = (value === 'input') ? '总等熵效率 (η_total)' : '等熵效率 (η_s)';
        }
    });

    // 3.6 自动效率锁定逻辑
    function setupAutoEfficiencyCheckbox(checkboxId, inputIds) {
        const checkbox = document.getElementById(checkboxId);
        const inputs = inputIds.map(id => document.getElementById(id));

        if (!checkbox || inputs.some(i => !i)) return;

        const handleChange = () => {
            const isAuto = checkbox.checked;
            inputs.forEach(input => {
                input.disabled = isAuto;
                if (isAuto) {
                    // Apple Style: 输入框变暗淡
                    input.classList.add('opacity-60', 'cursor-not-allowed', 'bg-gray-50');
                    input.classList.remove('bg-white');
                } else {
                    input.classList.remove('opacity-60', 'cursor-not-allowed', 'bg-gray-50');
                    input.classList.add('bg-white');
                }
            });
        };

        checkbox.addEventListener('change', handleChange);
        // 初始化
        handleChange();
    }

    setupAutoEfficiencyCheckbox('auto-eff-m2', ['eta_s_m2', 'eta_v_m2']);
    
    // --- 4. 模式二 (M3) 交互逻辑 (Placeholder) ---
    // 如果 Mode 3 的 HTML 结构已完整生成，此处逻辑与 M2 类似
    // 暂时保留基础框架
    setupRadioToggle('flow_mode_m3', (value) => {
        const rpmInputs = document.getElementById('rpm-inputs-m3');
        const volInputs = document.getElementById('vol-inputs-m3');
        if(rpmInputs && volInputs) {
            rpmInputs.style.display = (value === 'rpm') ? 'grid' : 'none';
            volInputs.style.display = (value === 'vol') ? 'block' : 'none';
        }
    });

    // 5. Button Press Animation (Global)
    // 为所有按钮添加点击时的微缩效果
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('mousedown', () => btn.classList.add('scale-95'));
        btn.addEventListener('mouseup', () => btn.classList.remove('scale-95'));
        btn.addEventListener('mouseleave', () => btn.classList.remove('scale-95'));
    });

    console.log("UI v3.0 (Apple Design) initialized.");
}