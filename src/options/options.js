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

    showToast('✅ 测试通过', 'success');
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
  elements.importBookmarks.addEventListener('click', async () => {
    if (!confirm('确定要从浏览器导入收藏吗？\n\n这将导入浏览器中的所有书签到插件本地数据库。')) {
      return;
    }

    elements.importBookmarks.disabled = true;
    elements.importBookmarks.textContent = '导入中...';
    showToast('正在导入...', 'success');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'IMPORT_FROM_BROWSER'
      });

      if (response && response.success) {
        const count = response.imported || 0;
        const catCount = response.categories || 0;
        showToast(`✅ 导入成功！共 ${count} 个书签，${catCount} 个分类`, 'success');
      } else {
        throw new Error(response?.error || '导入失败');
      }
    } catch (error) {
      console.error('Import failed:', error);
      showToast('❌ 导入失败：' + error.message, 'error');
    } finally {
      elements.importBookmarks.disabled = false;
      elements.importBookmarks.textContent = '📥 从浏览器导入';
    }
  });

  // 导出数据
  elements.exportBookmarks.addEventListener('click', async () => {
    elements.exportBookmarks.disabled = true;
    elements.exportBookmarks.textContent = '导出中...';
    showToast('正在准备导出...', 'success');

    try {
      // 获取所有数据
      const response = await chrome.runtime.sendMessage({
        type: 'GET_BOOKMARKS'
      });

      if (!response || response.error) {
        throw new Error(response?.error || '获取数据失败');
      }

      const data = {
        bookmarks: response.bookmarks || [],
        categories: response.categories || [],
        tags: response.tags || [],
        exportedAt: new Date().toISOString(),
        version: '1.0'
      };

      // 生成 JSON 文件
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // 创建下载链接
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart-bookmarks-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`✅ 导出成功！共 ${data.bookmarks.length} 个书签`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('❌ 导出失败：' + error.message, 'error');
    } finally {
      elements.exportBookmarks.disabled = false;
      elements.exportBookmarks.textContent = '📤 导出为 JSON';
    }
  });

  // 清空数据
  elements.clearData.addEventListener('click', async () => {
    if (!confirm('确定要清空所有数据吗？\n\n此操作将清空插件本地数据库中的所有书签、分类和标签数据。\n\n⚠️ 此操作不可恢复！')) {
      return;
    }

    // 二次确认
    if (!confirm('⚠️ 最终确认：真的要清空所有数据吗？')) {
      return;
    }

    elements.clearData.disabled = true;
    elements.clearData.textContent = '清空中...';
    showToast('正在清空数据...', 'success');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CLEAR_DATA'
      });

      if (response && response.success) {
        showToast('✅ 数据已清空', 'success');
      } else {
        throw new Error(response?.error || '清空失败');
      }
    } catch (error) {
      console.error('Clear failed:', error);
      showToast('❌ 清空失败：' + error.message, 'error');
    } finally {
      elements.clearData.disabled = false;
      elements.clearData.textContent = '🗑️ 清空所有数据';
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
