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
  elements.testBtn.disabled = true;
  elements.testBtn.textContent = '测试中...';
  showToast('正在测试连接...', 'success');

  try {
    // 发送一条最小化的 chat completion 请求来验证配置
    const apiUrl = config.apiUrl.replace(/\/+$/, ''); // 去掉末尾斜杠
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      })
    });

    // 检查 Content-Type，避免把 HTML 错误页当 JSON 解析
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`服务器返回非 JSON 响应 (${response.status})，请检查 API 地址是否正确`);
    }

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || data?.message || response.statusText;
      throw new Error(`${response.status}: ${errMsg}`);
    }

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('API 返回结构异常，请确认模型名称是否正确');
    }

    showToast('✅ 连接测试成功！', 'success');
  } catch (error) {
    console.error('Connection test failed:', error);
    showToast('❌ 连接测试失败：' + error.message, 'error');
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
