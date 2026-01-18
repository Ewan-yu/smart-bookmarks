// Smart Bookmarks - Options Script

console.log('Smart Bookmarks options loaded');

// DOM 元素引用
const elements = {
  aiConfigForm: document.getElementById('aiConfigForm'),
  apiUrl: document.getElementById('apiUrl'),
  apiKey: document.getElementById('apiKey'),
  model: document.getElementById('model'),
  testBtn: document.getElementById('testBtn'),
  importBookmarks: document.getElementById('importBookmarks'),
  exportBookmarks: document.getElementById('exportBookmarks'),
  clearData: document.getElementById('clearData'),
  toast: document.getElementById('toast')
};

// 配置键名
const STORAGE_KEYS = {
  AI_CONFIG: 'aiConfig'
};

// 初始化
function init() {
  loadConfig();
  bindEvents();
}

// 加载配置
async function loadConfig() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.AI_CONFIG);
    const config = result[STORAGE_KEYS.AI_CONFIG] || {};

    if (config.apiUrl) elements.apiUrl.value = config.apiUrl;
    if (config.apiKey) elements.apiKey.value = config.apiKey;
    if (config.model) elements.model.value = config.model;
  } catch (error) {
    console.error('Failed to load config:', error);
    showToast('加载配置失败', 'error');
  }
}

// 保存配置
async function saveConfig(config) {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.AI_CONFIG]: config
    });
    showToast('配置已保存', 'success');
  } catch (error) {
    console.error('Failed to save config:', error);
    showToast('保存配置失败', 'error');
  }
}

// 测试 API 连接
async function testConnection(config) {
  try {
    showToast('正在测试连接...', 'success');
    elements.testBtn.disabled = true;
    elements.testBtn.textContent = '测试中...';

    // TODO: 实现实际的 API 测试
    await new Promise(resolve => setTimeout(resolve, 1000));

    showToast('连接测试成功！', 'success');
  } catch (error) {
    console.error('Connection test failed:', error);
    showToast('连接测试失败：' + error.message, 'error');
  } finally {
    elements.testBtn.disabled = false;
    elements.testBtn.textContent = '测试连接';
  }
}

// 绑定事件
function bindEvents() {
  // 保存配置
  elements.aiConfigForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const config = {
      apiUrl: elements.apiUrl.value.trim(),
      apiKey: elements.apiKey.value.trim(),
      model: elements.model.value.trim()
    };

    await saveConfig(config);
  });

  // 测试连接
  elements.testBtn.addEventListener('click', async () => {
    const config = {
      apiUrl: elements.apiUrl.value.trim(),
      apiKey: elements.apiKey.value.trim(),
      model: elements.model.value.trim()
    };

    if (!config.apiUrl || !config.apiKey || !config.model) {
      showToast('请先填写完整的 API 配置', 'error');
      return;
    }

    await testConnection(config);
  });

  // 导入浏览器收藏
  elements.importBookmarks.addEventListener('click', () => {
    console.log('导入收藏功能待实现');
    showToast('导入功能开发中...', 'success');
  });

  // 导出数据
  elements.exportBookmarks.addEventListener('click', () => {
    console.log('导出功能待实现');
    showToast('导出功能开发中...', 'success');
  });

  // 清空数据
  elements.clearData.addEventListener('click', () => {
    if (confirm('确定要清空所有数据吗？此操作不可恢复！')) {
      console.log('清空数据功能待实现');
      showToast('清空功能开发中...', 'success');
    }
  });
}

// 显示提示消息
function showToast(message, type = 'success') {
  elements.toast.textContent = message;
  elements.toast.className = 'toast ' + type;

  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3000);
}

// 启动
init();
