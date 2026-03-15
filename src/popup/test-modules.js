/**
 * Smart Bookmarks 模块功能测试脚本
 * 验证各个模块的基本功能、通信和初始化
 *
 * 运行方式：
 * 1. 在浏览器控制台直接运行
 * 2. 作为模块导入: import './test-modules.js'
 */

// ==================== 测试框架 ====================

class TestRunner {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
  }

  /**
   * 记录测试结果
   */
  logResult(testName, passed, message, duration = 0) {
    const result = {
      name: testName,
      passed,
      message,
      duration,
      timestamp: Date.now()
    };
    this.results.push(result);

    if (passed) {
      this.passed++;
      console.log(`✅ PASS: ${testName} ${message ? `- ${message}` : ''} (${duration}ms)`);
    } else {
      this.failed++;
      console.error(`❌ FAIL: ${testName} ${message ? `- ${message}` : ''} (${duration}ms)`);
    }
  }

  /**
   * 记录跳过的测试
   */
  logSkip(testName, reason) {
    this.results.push({
      name: testName,
      passed: null,
      message: reason,
      skipped: true,
      timestamp: Date.now()
    });
    this.skipped++;
    console.warn(`⏭️  SKIP: ${testName} - ${reason}`);
  }

  /**
   * 生成测试报告
   */
  generateReport() {
    const total = this.passed + this.failed;
    const passRate = total > 0 ? ((this.passed / total) * 100).toFixed(2) : 0;

    console.log('\n==================== 测试报告 ====================');
    console.log(`总计: ${total} | 通过: ${this.passed} | 失败: ${this.failed} | 跳过: ${this.skipped}`);
    console.log(`通过率: ${passRate}%`);
    console.log('================================================\n');

    return {
      total,
      passed: this.passed,
      failed: this.failed,
      skipped: this.skipped,
      passRate: parseFloat(passRate),
      results: this.results
    };
  }

  /**
   * 清空结果
   */
  reset() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
  }
}

const testRunner = new TestRunner();

// ==================== 模块加载测试 ====================

async function testModuleLoading() {
  console.log('\n========== 模块加载测试 ==========\n');

  const modules = [
    { name: 'state.js', path: './modules/state.js' },
    { name: 'event-bus.js', path: './utils/event-bus.js' },
    { name: 'helpers.js', path: './utils/helpers.js' },
    { name: 'bookmarks.js', path: './modules/bookmarks.js' },
    { name: 'navigation.js', path: './modules/navigation.js' },
    { name: 'search.js', path: './modules/search.js' },
    { name: 'dialog.js', path: './modules/dialog.js' },
    { name: 'context-menu.js', path: './modules/context-menu.js' },
    { name: 'keyboard.js', path: './modules/keyboard.js' },
    { name: 'ai-analysis.js', path: './modules/ai-analysis.js' },
    { name: 'link-checker.js', path: './modules/link-checker.js' },
    { name: 'folder-manager.js', path: './modules/folder-manager.js' },
    { name: 'drag-drop.js', path: './modules/drag-drop.js' }
  ];

  for (const module of modules) {
    const startTime = performance.now();
    try {
      await import(module.path);
      const duration = Math.round(performance.now() - startTime);
      testRunner.logResult(`加载 ${module.name}`, true, '加载成功', duration);
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      testRunner.logResult(`加载 ${module.name}`, false, error.message, duration);
    }
  }
}

// ==================== 状态管理模块测试 ====================

async function testStateModule() {
  console.log('\n========== 状态管理模块测试 ==========\n');

  try {
    const { stateManager } = await import('./modules/state.js');

    // 测试状态读取
    const startTime = performance.now();
    const bookmarks = stateManager.get('bookmarks');
    testRunner.logResult(
      '状态读取 - bookmarks',
      Array.isArray(bookmarks),
      `类型: ${typeof bookmarks}, 长度: ${bookmarks?.length || 0}`,
      Math.round(performance.now() - startTime)
    );

    // 测试状态设置
    const setStart = performance.now();
    stateManager.set('testKey', 'testValue');
    const retrieved = stateManager.get('testKey');
    testRunner.logResult(
      '状态设置和读取',
      retrieved === 'testValue',
      `设置值: 'testValue', 读取值: '${retrieved}'`,
      Math.round(performance.now() - setStart)
    );

    // 测试状态订阅
    const subscribeStart = performance.now();
    let subscribed = false;
    const unsubscribe = stateManager.subscribe('testKey', (newValue, oldValue) => {
      subscribed = true;
    });
    stateManager.set('testKey', 'newValue');
    testRunner.logResult(
      '状态订阅',
      subscribed,
      '订阅回调被触发',
      Math.round(performance.now() - subscribeStart)
    );
    unsubscribe();

    // 测试状态快照
    const snapshotStart = performance.now();
    const snapshot = stateManager.snapshot();
    testRunner.logResult(
      '状态快照',
      typeof snapshot === 'object' && snapshot !== null,
      `快照属性数: ${Object.keys(snapshot).length}`,
      Math.round(performance.now() - snapshotStart)
    );

    // 测试批量更新
    const batchStart = performance.now();
    stateManager.setMultiple({ key1: 'value1', key2: 'value2' });
    const key1 = stateManager.get('key1');
    const key2 = stateManager.get('key2');
    testRunner.logResult(
      '批量状态更新',
      key1 === 'value1' && key2 === 'value2',
      `key1: ${key1}, key2: ${key2}`,
      Math.round(performance.now() - batchStart)
    );

  } catch (error) {
    testRunner.logResult('状态管理模块', false, `模块初始化失败: ${error.message}`);
  }
}

// ==================== 书签管理模块测试 ====================

async function testBookmarkModule() {
  console.log('\n========== 书签管理模块测试 ==========\n');

  try {
    const bookmarkManager = (await import('./modules/bookmarks.js')).default;

    // 测试模块初始化
    const initStart = performance.now();
    const hasBookmarks = Array.isArray(bookmarkManager.bookmarks);
    testRunner.logResult(
      '书签管理器初始化',
      hasBookmarks,
      `bookmarks 属性存在: ${hasBookmarks}`,
      Math.round(performance.now() - initStart)
    );

    // 测试获取所有书签
    const getAllStart = performance.now();
    const all = bookmarkManager.getAll();
    testRunner.logResult(
      '获取所有书签',
      Array.isArray(all),
      `返回数组: ${Array.isArray(all)}, 长度: ${all.length}`,
      Math.round(performance.now() - getAllStart)
    );

    // 测试按ID获取书签
    const getByIdStart = performance.now();
    const testBookmark = { id: 'bm1', title: 'Test', url: 'https://test.com' };
    bookmarkManager.bookmarks = [testBookmark];
    const bookmark = bookmarkManager.getById('bm1');
    testRunner.logResult(
      '按ID获取书签',
      bookmark && bookmark.id === 'bm1',
      `找到书签: ${bookmark ? bookmark.title : 'null'}`,
      Math.round(performance.now() - getByIdStart)
    );

    // 测试搜索功能
    const searchStart = performance.now();
    const searchResults = bookmarkManager.search('test');
    testRunner.logResult(
      '书签搜索',
      searchResults.length > 0,
      `搜索 'test' 的结果数: ${searchResults.length}`,
      Math.round(performance.now() - searchStart)
    );

    // 测试统计功能
    const statsStart = performance.now();
    const stats = bookmarkManager.getStats();
    testRunner.logResult(
      '书签统计',
      stats && typeof stats.total === 'number',
      `总数: ${stats.total}, 最近7天: ${stats.recentCount}`,
      Math.round(performance.now() - statsStart)
    );

  } catch (error) {
    testRunner.logResult('书签管理模块', false, `测试失败: ${error.message}`);
  }
}

// ==================== 导航模块测试 ====================

async function testNavigationModule() {
  console.log('\n========== 导航模块测试 ==========\n');

  try {
    const navigationManager = (await import('./modules/navigation.js')).default;

    // 测试初始化
    const initStart = performance.now();
    navigationManager.init();
    testRunner.logResult(
      '导航管理器初始化',
      typeof navigationManager.switchView === 'function',
      'init 方法正常执行',
      Math.round(performance.now() - initStart)
    );

    // 测试视图切换
    const switchStart = performance.now();
    navigationManager.switchView('recent');
    testRunner.logResult(
      '切换视图',
      navigationManager.currentView === 'recent',
      `当前视图: ${navigationManager.currentView}`,
      Math.round(performance.now() - switchStart)
    );

    // 测试文件夹选择
    const selectStart = performance.now();
    navigationManager.selectFolder('cat1');
    testRunner.logResult(
      '选择文件夹',
      navigationManager.selectedFolderId === 'cat1',
      `选中文件夹: ${navigationManager.selectedFolderId}`,
      Math.round(performance.now() - selectStart)
    );

    // 测试面包屑构建
    const breadcrumbStart = performance.now();
    const breadcrumb = navigationManager.breadcrumb;
    testRunner.logResult(
      '面包屑导航',
      Array.isArray(breadcrumb),
      `面包屑层级: ${breadcrumb.length}`,
      Math.round(performance.now() - breadcrumbStart)
    );

  } catch (error) {
    testRunner.logResult('导航模块', false, `测试失败: ${error.message}`);
  }
}

// ==================== 搜索模块测试 ====================

async function testSearchModule() {
  console.log('\n========== 搜索模块测试 ==========\n');

  try {
    const searchManager = (await import('./modules/search.js')).default;

    // 测试初始化
    const initStart = performance.now();
    searchManager.init();
    testRunner.logResult(
      '搜索管理器初始化',
      typeof searchManager.performSearch === 'function',
      'init 方法正常执行',
      Math.round(performance.now() - initStart)
    );

    // 测试本地搜索
    const localSearchStart = performance.now();
    const bookmarkManager = (await import('./modules/bookmarks.js')).default;
    bookmarkManager.bookmarks = [
      { id: 'bm1', title: 'Google Search', url: 'https://google.com', tags: ['search'] }
    ];

    const results = searchManager._localSearch('google');
    testRunner.logResult(
      '本地搜索',
      results.length > 0,
      `搜索 'google' 的结果数: ${results.length}`,
      Math.round(performance.now() - localSearchStart)
    );

    // 测试搜索清除
    const clearStart = performance.now();
    searchManager.clearSearch();
    testRunner.logResult(
      '清除搜索',
      searchManager.searchQuery === '' && searchManager.searchResults.length === 0,
      `搜索词: "${searchManager.searchQuery}", 结果数: ${searchManager.searchResults.length}`,
      Math.round(performance.now() - clearStart)
    );

  } catch (error) {
    testRunner.logResult('搜索模块', false, `测试失败: ${error.message}`);
  }
}

// ==================== 对话框模块测试 ====================

async function testDialogModule() {
  console.log('\n========== 对话框模块测试 ==========\n');

  try {
    const dialogManager = (await import('./modules/dialog.js')).default;

    // 测试确认对话框创建
    const confirmStart = performance.now();
    const confirmDialog = dialogManager.confirm({
      title: '测试确认',
      message: '这是一个测试确认对话框吗？',
      confirmText: '确定',
      cancelText: '取消'
    });
    testRunner.logResult(
      '创建确认对话框',
      confirmDialog && confirmDialog.isOpen === true,
      `对话框ID: ${confirmDialog.id}`,
      Math.round(performance.now() - confirmStart)
    );

    // 关闭对话框
    confirmDialog.close();

    // 测试输入对话框创建
    const promptStart = performance.now();
    const promptDialog = dialogManager.prompt({
      title: '测试输入',
      placeholder: '请输入内容',
      defaultValue: '默认值'
    });
    testRunner.logResult(
      '创建输入对话框',
      promptDialog && promptDialog.isOpen === true,
      `对话框ID: ${promptDialog.id}`,
      Math.round(performance.now() - promptStart)
    );

    // 关闭对话框
    promptDialog.close();

    // 测试选择对话框创建
    const selectStart = performance.now();
    const selectDialog = dialogManager.select({
      title: '测试选择',
      options: [
        { value: 'opt1', label: '选项1' },
        { value: 'opt2', label: '选项2' },
        { value: 'opt3', label: '选项3' }
      ],
      multiple: true
    });
    testRunner.logResult(
      '创建选择对话框',
      selectDialog && selectDialog.isOpen === true,
      `对话框ID: ${selectDialog.id}`,
      Math.round(performance.now() - selectStart)
    );

    // 关闭所有对话框
    dialogManager.closeAll();
    testRunner.logResult(
      '关闭所有对话框',
      !dialogManager.hasOpenDialog(),
      '所有对话框已关闭',
      0
    );

  } catch (error) {
    testRunner.logResult('对话框模块', false, `测试失败: ${error.message}`);
  }
}

// ==================== 右键菜单模块测试 ====================

async function testContextMenuModule() {
  console.log('\n========== 右键菜单模块测试 ==========\n');

  try {
    const contextMenuManager = (await import('./modules/context-menu.js')).default;

    // 测试初始化
    const initStart = performance.now();
    contextMenuManager.init();
    testRunner.logResult(
      '右键菜单初始化',
      contextMenuManager.menuElement !== null,
      '菜单元素已创建',
      Math.round(performance.now() - initStart)
    );

    // 测试显示菜单
    const showStart = performance.now();
    const mockItem = { id: 'bm1', type: 'bookmark', title: '测试书签' };
    contextMenuManager.show(mockItem, 100, 100);
    testRunner.logResult(
      '显示右键菜单',
      contextMenuManager.getIsVisible() === true,
      `菜单位置: (100, 100)`,
      Math.round(performance.now() - showStart)
    );

    // 测试隐藏菜单
    const hideStart = performance.now();
    contextMenuManager.hide();
    testRunner.logResult(
      '隐藏右键菜单',
      contextMenuManager.getIsVisible() === false,
      '菜单已隐藏',
      Math.round(performance.now() - hideStart)
    );

    // 测试获取当前项目
    const getItemStart = performance.now();
    const currentItem = contextMenuManager.getCurrentItem();
    testRunner.logResult(
      '获取当前菜单项',
      currentItem && currentItem.id === 'bm1',
      `当前项目: ${currentItem ? currentItem.title : 'null'}`,
      Math.round(performance.now() - getItemStart)
    );

  } catch (error) {
    testRunner.logResult('右键菜单模块', false, `测试失败: ${error.message}`);
  }
}

// ==================== 键盘导航模块测试 ====================

async function testKeyboardModule() {
  console.log('\n========== 键盘导航模块测试 ==========\n');

  try {
    const keyboardManager = (await import('./modules/keyboard.js')).default;

    // 测试初始化
    const initStart = performance.now();
    keyboardManager.init();
    testRunner.logResult(
      '键盘导航初始化',
      typeof keyboardManager.registerHandler === 'function',
      'init 方法正常执行',
      Math.round(performance.now() - initStart)
    );

    // 测试快捷键注册
    const registerStart = performance.now();
    let handlerCalled = false;
    keyboardManager.registerHandler('test', 'Ctrl+T', () => {
      handlerCalled = true;
    });
    testRunner.logResult(
      '注册快捷键',
      handlerCalled === false,
      '快捷键处理器已注册（未触发）',
      Math.round(performance.now() - registerStart)
    );

    // 测试作用域切换
    const scopeStart = performance.now();
    keyboardManager.setScope('dialog');
    testRunner.logResult(
      '切换作用域',
      keyboardManager.scope === 'dialog',
      `当前作用域: ${keyboardManager.scope}`,
      Math.round(performance.now() - scopeStart)
    );

    // 测试启用/禁用
    const enableStart = performance.now();
    keyboardManager.disable();
    const isEnabled = keyboardManager.isEnabled;
    keyboardManager.enable();
    testRunner.logResult(
      '启用/禁用键盘导航',
      isEnabled === false && keyboardManager.isEnabled === true,
      '状态切换成功',
      Math.round(performance.now() - enableStart)
    );

    // 测试快捷键列表
    const shortcutsStart = performance.now();
    const shortcuts = keyboardManager.getShortcuts();
    testRunner.logResult(
      '获取快捷键列表',
      Array.isArray(shortcuts) && shortcuts.length > 0,
      `快捷键数量: ${shortcuts.length}`,
      Math.round(performance.now() - shortcutsStart)
    );

  } catch (error) {
    testRunner.logResult('键盘导航模块', false, `测试失败: ${error.message}`);
  }
}

// ==================== 事件总线测试 ====================

async function testEventBus() {
  console.log('\n========== 事件总线测试 ==========\n');

  try {
    const eventBus = (await import('./utils/event-bus.js')).default;
    const { Events } = await import('./utils/event-bus.js');

    // 测试事件订阅和发布
    const emitStart = performance.now();
    let eventData = null;
    const unsubscribe = eventBus.on('test:event', (data) => {
      eventData = data;
    });
    eventBus.emit('test:event', { message: 'test data' });
    testRunner.logResult(
      '事件订阅和发布',
      eventData && eventData.message === 'test data',
      `接收到的数据: ${JSON.stringify(eventData)}`,
      Math.round(performance.now() - emitStart)
    );
    unsubscribe();

    // 测试一次性事件
    const onceStart = performance.now();
    let onceCalled = 0;
    eventBus.once('test:once', () => {
      onceCalled++;
    });
    eventBus.emit('test:once');
    eventBus.emit('test:once');
    testRunner.logResult(
      '一次性事件订阅',
      onceCalled === 1,
      `调用次数: ${onceCalled}（应为1）`,
      Math.round(performance.now() - onceStart)
    );

    // 测试取消订阅
    const offStart = performance.now();
    let offCalled = false;
    const handler = () => { offCalled = true; };
    eventBus.on('test:off', handler);
    eventBus.off('test:off', handler);
    eventBus.emit('test:off');
    testRunner.logResult(
      '取消事件订阅',
      offCalled === false,
      '事件处理器已取消订阅',
      Math.round(performance.now() - offStart)
    );

    // 测试事件常量
    const constantsStart = performance.now();
    const hasEvents = Events && typeof Events.BOOKMARKS_LOADED === 'string';
    testRunner.logResult(
      '事件常量定义',
      hasEvents,
      `BOOKMARKS_LOADED: ${Events.BOOKMARKS_LOADED}`,
      Math.round(performance.now() - constantsStart)
    );

    // 测试监听器计数
    const countStart = performance.now();
    eventBus.on('test:count', () => {});
    eventBus.on('test:count', () => {});
    const count = eventBus.listenerCount('test:count');
    eventBus.clear('test:count');
    testRunner.logResult(
      '监听器计数',
      count === 2,
      `监听器数量: ${count}`,
      Math.round(performance.now() - countStart)
    );

    // 测试清除事件
    const clearStart = performance.now();
    eventBus.on('test:clear1', () => {});
    eventBus.on('test:clear2', () => {});
    eventBus.clear();
    const eventNames = eventBus.eventNames();
    testRunner.logResult(
      '清除所有事件',
      eventNames.length === 0,
      `剩余事件数: ${eventNames.length}`,
      Math.round(performance.now() - clearStart)
    );

  } catch (error) {
    testRunner.logResult('事件总线', false, `测试失败: ${error.message}`);
  }
}

// ==================== 模块间通信测试 ====================

async function testModuleCommunication() {
  console.log('\n========== 模块间通信测试 ==========\n');

  try {
    const eventBus = (await import('./utils/event-bus.js')).default;
    const { Events } = await import('./utils/event-bus.js');
    const bookmarkManager = (await import('./modules/bookmarks.js')).default;
    const navigationManager = (await import('./modules/navigation.js')).default;

    // 测试书签加载事件
    const loadStart = performance.now();
    let bookmarksLoaded = false;
    eventBus.on(Events.BOOKMARKS_LOADED, () => {
      bookmarksLoaded = true;
    });
    bookmarkManager.bookmarks = [{ id: 'test', title: 'Test' }];
    eventBus.emit(Events.BOOKMARKS_LOADED, { bookmarks: bookmarkManager.bookmarks });
    testRunner.logResult(
      '书签加载事件通信',
      bookmarksLoaded,
      'BOOKMARKS_LOADED 事件触发成功',
      Math.round(performance.now() - loadStart)
    );

    // 测试导航变更事件
    const navStart = performance.now();
    let navigationChanged = false;
    eventBus.on(Events.NAVIGATION_CHANGED, () => {
      navigationChanged = true;
    });
    navigationManager.switchView('recent');
    testRunner.logResult(
      '导航变更事件通信',
      navigationChanged && navigationManager.currentView === 'recent',
      `NAVIGATION_CHANGED 事件触发，当前视图: ${navigationManager.currentView}`,
      Math.round(performance.now() - navStart)
    );

    // 测试搜索事件
    const searchStart = performance.now();
    let searchPerformed = false;
    eventBus.on(Events.SEARCH_PERFORMED, () => {
      searchPerformed = true;
    });
    eventBus.emit(Events.SEARCH_PERFORMED, { query: 'test', useAI: false });
    testRunner.logResult(
      '搜索事件通信',
      searchPerformed,
      'SEARCH_PERFORMED 事件触发成功',
      Math.round(performance.now() - searchStart)
    );

  } catch (error) {
    testRunner.logResult('模块间通信', false, `测试失败: ${error.message}`);
  }
}

// ==================== 工具函数测试 ====================

async function testHelperFunctions() {
  console.log('\n========== 工具函数测试 ==========\n');

  try {
    const { escapeHtml, truncateText, formatDate, debounce, isValidUrl, generateId } =
      await import('./utils/helpers.js');

    // 测试 HTML 转义
    const escapeStart = performance.now();
    const escaped = escapeHtml('<script>alert("xss")</script>');
    testRunner.logResult(
      'HTML 转义',
      escaped.includes('&lt;') && !escaped.includes('<'),
      `转义结果: ${escaped.substring(0, 30)}...`,
      Math.round(performance.now() - escapeStart)
    );

    // 测试文本截断
    const truncateStart = performance.now();
    const truncated = truncateText('This is a very long text that needs to be truncated', 20);
    testRunner.logResult(
      '文本截断',
      truncated.length === 23, // 20 + '...'
      `截断结果: "${truncated}"`,
      Math.round(performance.now() - truncateStart)
    );

    // 测试日期格式化
    const dateStart = performance.now();
    const formatted = formatDate(new Date(), 'short');
    testRunner.logResult(
      '日期格式化',
      typeof formatted === 'string' && formatted.length > 0,
      `格式化结果: ${formatted}`,
      Math.round(performance.now() - dateStart)
    );

    // 测试 URL 验证
    const urlStart = performance.now();
    const validUrl = isValidUrl('https://example.com');
    const invalidUrl = isValidUrl('not-a-url');
    testRunner.logResult(
      'URL 验证',
      validUrl && !invalidUrl,
      `有效URL: ${validUrl}, 无效URL: ${invalidUrl}`,
      Math.round(performance.now() - urlStart)
    );

    // 测试 ID 生成
    const idStart = performance.now();
    const id1 = generateId('test');
    const id2 = generateId('test');
    testRunner.logResult(
      '唯一 ID 生成',
      id1 !== id2 && id1.startsWith('test_'),
      `ID1: ${id1}, ID2: ${id2}`,
      Math.round(performance.now() - idStart)
    );

    // 测试防抖函数
    const debounceStart = performance.now();
    let debounceCount = 0;
    const debouncedFn = debounce(() => {
      debounceCount++;
    }, 50);
    debouncedFn();
    debouncedFn();
    debouncedFn();
    testRunner.logResult(
      '防抖函数',
      debounceCount === 0,
      `调用3次后立即执行次数: ${debounceCount}（应为0）`,
      Math.round(performance.now() - debounceStart)
    );

    // 等待防抖完成
    await new Promise(resolve => setTimeout(resolve, 100));
    const debounceAfterWait = debounceCount === 1;
    testRunner.logResult(
      '防抖延迟执行',
      debounceAfterWait,
      `等待100ms后执行次数: ${debounceCount}（应为1）`,
      0
    );

  } catch (error) {
    testRunner.logResult('工具函数', false, `测试失败: ${error.message}`);
  }
}

// ==================== 主测试函数 ====================

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        Smart Bookmarks 模块功能测试                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // 运行测试套件
    await testModuleLoading();
    await testEventBus();
    await testHelperFunctions();
    await testStateModule();
    await testBookmarkModule();
    await testNavigationModule();
    await testSearchModule();
    await testDialogModule();
    await testContextMenuModule();
    await testKeyboardModule();
    await testModuleCommunication();

    // 生成测试报告
    const report = testRunner.generateReport();

    // 保存报告到全局
    window.__testReport__ = report;

    return report;

  } catch (error) {
    console.error('测试运行失败:', error);
    testRunner.logResult('测试运行', false, `运行时错误: ${error.message}`);
    return testRunner.generateReport();
  }
}

/**
 * 运行指定测试套件
 * @param {string} suiteName - 测试套件名称
 */
async function runTestSuite(suiteName) {
  console.log(`\n运行测试套件: ${suiteName}`);

  const suites = {
    'state': testStateModule,
    'bookmarks': testBookmarkModule,
    'navigation': testNavigationModule,
    'search': testSearchModule,
    'dialog': testDialogModule,
    'context-menu': testContextMenuModule,
    'keyboard': testKeyboardModule,
    'event-bus': testEventBus,
    'helpers': testHelperFunctions,
    'communication': testModuleCommunication
  };

  if (suites[suiteName]) {
    await suites[suiteName]();
    return testRunner.generateReport();
  } else {
    console.error(`未找到测试套件: ${suiteName}`);
    console.log(`可用的测试套件: ${Object.keys(suites).join(', ')}`);
    return null;
  }
}

/**
 * 导出测试函数
 */
export {
  runAllTests,
  runTestSuite,
  testRunner
};

// 如果直接运行此脚本
if (typeof window !== 'undefined') {
  window.__smartBookmarksTests__ = {
    runAllTests,
    runTestSuite,
    testRunner
  };

  console.log('\n📝 测试框架已加载！');
  console.log('使用以下命令运行测试:');
  console.log('  - window.__smartBookmarksTests__.runAllTests()    运行所有测试');
  console.log('  - window.__smartBookmarksTests__.runTestSuite("state")  运行特定测试套件');
}

export default runAllTests;
