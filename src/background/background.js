// Smart Bookmarks - Background Service Worker

// 导入数据库和链接检测工具
import {
  openDB,
  getAllBookmarks,
  addBookmark,
  getBookmark,
  deleteBookmark,
  getAllCategories,
  addCategory,
  get,
  addTag,
  clearAllData,
  STORES
} from '../db/indexeddb.js';
import { checkBookmarks, batchMoveToPendingCleanup } from '../utils/link-checker.js';
import { batchExtractSummaries, enrichBookmarks } from '../utils/page-summarizer.js';
import { analyzeBookmarks, analyzeBookmarksDebug } from '../api/openai.js';

console.log('Smart Bookmarks background service worker loaded');

// 监听扩展图标点击事件
chrome.action.onClicked.addListener(async (tab) => {
  // 打开主界面（全屏页面）
  await chrome.tabs.create({
    url: 'src/popup/popup.html',
    active: true
  });
});

// 数据库实例
let db = null;

// 当前链接检测任务的取消令牌
let currentCheckCancelToken = null;
// 当前检测进度快照（popup 重新打开时用于恢复 UI）
let currentCheckProgress = null;

// 当前 AI 分析任务的取消令牌
let currentAnalysisCancelToken = null;

// 初始化数据库
async function initDatabase() {
  if (!db) {
    db = await openDB();
  }
  return db;
}

// 监听插件安装事件
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // 首次安装，初始化数据
    await initializeData();
  }
});

// ===== 浏览器书签实时同步监听 =====

/**
 * 用户新增书签时同步到插件 DB
 */
chrome.bookmarks.onCreated.addListener(async (id, bookmarkNode) => {
  // 只处理有 URL 的书签（不处理文件夹）
  if (!bookmarkNode.url) {
    // 新建文件夹 → 同步为分类
    if (bookmarkNode.title) {
      try {
        await initDatabase();
        const catId = `cat_${id}`;
        const existing = await get(STORES.CATEGORIES, catId);
        if (!existing) {
          const parentCatId = bookmarkNode.parentId ? `cat_${bookmarkNode.parentId}` : null;
          await addCategory({
            id: catId,
            name: bookmarkNode.title,
            parentId: parentCatId,
            createdAt: Date.now()
          });
          console.log(`[Sync] 新增分类: ${bookmarkNode.title}`);
        }
      } catch (e) {
        console.debug('[Sync] 新增分类失败:', e.message);
      }
    }
    return;
  }

  try {
    await initDatabase();

    const parentCategoryId = bookmarkNode.parentId ? `cat_${bookmarkNode.parentId}` : null;

    const bookmark = {
      id,
      title: bookmarkNode.title || '未命名书签',
      url: bookmarkNode.url,
      description: '',
      tags: [],
      categoryId: parentCategoryId,
      status: 'active',
      createdAt: bookmarkNode.dateAdded || Date.now(),
      updatedAt: Date.now()
    };

    // 尝试从当前活动标签页的 content script 采集页面信息
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.url === bookmarkNode.url) {
        const pageInfo = await chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PAGE_INFO' });
        if (pageInfo) {
          if (pageInfo.description) bookmark.description = pageInfo.description.slice(0, 300);
          if (pageInfo.favicon) bookmark.favicon = pageInfo.favicon;
        }
      }
    } catch {
      // content script 可能未加载，忽略
    }

    await addBookmark(bookmark);
    console.log(`[Sync] 新增书签: ${bookmark.title} (${bookmark.url.slice(0, 50)})`);

    // 通知 popup 刷新
    notifyBookmarkChanged('created', id);
  } catch (error) {
    console.error('[Sync] 新增书签失败:', error);
  }
});

/**
 * 用户删除书签时从插件 DB 移除
 */
chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  try {
    await initDatabase();

    // 尝试删除书签
    const bookmark = await getBookmark(id);
    if (bookmark) {
      await deleteBookmark(id);
      console.log(`[Sync] 删除书签: ${bookmark.title}`);
      notifyBookmarkChanged('removed', id);
      return;
    }

    // 也可能是删除文件夹（分类）
    const catId = `cat_${id}`;
    const category = await get(STORES.CATEGORIES, catId);
    if (category) {
      const { deleteItem } = await import('../db/indexeddb.js');
      await deleteItem(STORES.CATEGORIES, catId);
      console.log(`[Sync] 删除分类: ${category.name}`);
      notifyBookmarkChanged('removed', id);
    }
  } catch (error) {
    console.error('[Sync] 删除书签失败:', error);
  }
});

/**
 * 用户修改书签标题/URL 时同步
 */
chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  try {
    await initDatabase();
    const bookmark = await getBookmark(id);
    if (bookmark) {
      if (changeInfo.title !== undefined) bookmark.title = changeInfo.title;
      if (changeInfo.url !== undefined) bookmark.url = changeInfo.url;
      bookmark.updatedAt = Date.now();
      await addBookmark(bookmark);
      console.log(`[Sync] 更新书签: ${bookmark.title}`);
      notifyBookmarkChanged('changed', id);
    }
  } catch (error) {
    console.error('[Sync] 更新书签失败:', error);
  }
});

/**
 * 用户移动书签到其他文件夹时同步分类
 */
chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  try {
    await initDatabase();
    const bookmark = await getBookmark(id);
    if (bookmark) {
      bookmark.categoryId = moveInfo.parentId ? `cat_${moveInfo.parentId}` : null;
      bookmark.updatedAt = Date.now();
      await addBookmark(bookmark);
      console.log(`[Sync] 移动书签: ${bookmark.title} -> 分类 ${bookmark.categoryId}`);
      notifyBookmarkChanged('moved', id);
    }
  } catch (error) {
    console.error('[Sync] 移动书签失败:', error);
  }
});

/**
 * 通知 popup 书签数据已变更，需要刷新
 */
function notifyBookmarkChanged(action, bookmarkId) {
  chrome.runtime.sendMessage({
    type: 'BOOKMARK_CHANGED',
    data: { action, bookmarkId }
  }).catch(() => {
    // popup 可能未打开，忽略
  });
}

// 初始化数据
async function initializeData() {
  try {
    console.log('Initializing data...');

    // 初始化数据库
    await initDatabase();

    // 导入浏览器现有收藏
    await importBrowserBookmarks();

    console.log('Data initialized successfully');
  } catch (error) {
    console.error('Failed to initialize data:', error);
  }
}

/**
 * 导入浏览器现有收藏
 */
async function importBrowserBookmarks() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const browserBookmarks = flattenBookmarkTree(tree);

    console.log(`Found ${browserBookmarks.length} browser bookmarks`);

    // 获取已存在的书签
    const existingBookmarks = await getAllBookmarks();
    const existingIds = new Set(existingBookmarks.map(b => b.id));

    // 过滤出需要导入的书签（不存在的）
    const newBookmarks = browserBookmarks.filter(bm => !existingIds.has(bm.id));

    if (newBookmarks.length === 0) {
      console.log('All bookmarks already imported, nothing new to add');
      return;
    }

    console.log(`Importing ${newBookmarks.length} new bookmarks (skipping ${existingIds.size} existing)`);

    // 存储到 IndexedDB
    for (const bm of newBookmarks) {
      const bookmark = {
        id: bm.id,
        title: bm.title,
        url: bm.url,
        description: '',
        tags: [],
        categoryId: bm.parentCategoryId || null, // 使用所属文件夹ID
        status: 'active',
        createdAt: bm.dateAdded || Date.now(),
        updatedAt: Date.now()
      };

      await addBookmark(bookmark);
    }

    // 提取并保存现有分类
    const categories = extractCategoriesFromTree(tree);
    let newCategoryCount = 0;
    for (const cat of categories) {
      // 检查分类是否已存在
      const existing = await get(STORES.CATEGORIES, cat.id);
      if (!existing) {
        await addCategory(cat);
        newCategoryCount++;
      }
    }

    console.log(`Imported ${newBookmarks.length} new bookmarks and ${newCategoryCount} new categories`);
  } catch (error) {
    console.error('Failed to import browser bookmarks:', error);
    throw error;
  }
}

/**
 * 扁平化收藏树
 * 遍历书签树，收集所有书签及其所属文件夹信息
 */
function flattenBookmarkTree(nodes, parentCategoryId = null) {
  const bookmarks = [];

  function traverse(node, currentFolderId = null) {
    if (node.url) {
      // 这是一个书签
      bookmarks.push({
        id: node.id,
        title: node.title || '未命名书签',
        url: node.url,
        dateAdded: node.dateAdded,
        // 保存所属文件夹ID
        parentCategoryId: currentFolderId
      });
    }

    // 递归遍历子节点
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        if (!child.url && child.title) {
          // 子节点是文件夹，更新 currentFolderId
          const folderId = `cat_${child.id}`;
          traverse(child, folderId);
        } else {
          // 子节点不是文件夹，保持 currentFolderId
          traverse(child, currentFolderId);
        }
      });
    }
  }

  // 从根节点开始遍历
  nodes.forEach(node => traverse(node, null));
  return bookmarks;
}

/**
 * 从收藏树中提取分类
 */
function extractCategoriesFromTree(nodes) {
  const categories = [];

  function traverse(node, parentId = null) {
    if (!node.url && node.title) {
      // 这是一个文件夹/分类
      categories.push({
        id: `cat_${node.id}`,
        name: node.title,
        parentId,
        createdAt: Date.now()
      });

      if (node.children && node.children.length > 0) {
        node.children.forEach(child => traverse(child, `cat_${node.id}`));
      }
    } else if (node.children && node.children.length > 0) {
      node.children.forEach(child => traverse(child, parentId));
    }
  }

  nodes.forEach(node => traverse(node));
  return categories;
}

// 监听来自 popup 和 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', JSON.stringify(request));

  // 处理不同类型的消息
  switch (request.type) {
    case 'GET_BOOKMARKS':
      handleGetBookmarks(request, sendResponse);
      return true; // 保持消息通道开启以支持异步响应

    case 'GET_CATEGORIES':
      handleGetCategories(request, sendResponse);
      return true;

    case 'SYNC_BOOKMARKS':
      handleSyncBookmarks(request, sendResponse);
      return true;

    case 'CHECK_BROKEN_LINKS':
      handleCheckBrokenLinks(request, sendResponse);
      return true;

    case 'CANCEL_CHECK':
      if (currentCheckCancelToken) {
        currentCheckCancelToken.cancelled = true;
      }
      sendResponse({ success: true });
      return true;

    case 'GET_CHECK_STATUS':
      // 用于 popup 重新打开时查询后台检测是否仍在运行
      sendResponse({
        isRunning: currentCheckCancelToken !== null,
        progress: currentCheckProgress
      });
      return true;

    case 'GET_CHECK_SESSION':
      chrome.storage.local.get('checkSession').then(result => {
        sendResponse({ session: result.checkSession || null });
      });
      return true;

    case 'CLEAR_CHECK_SESSION':
      chrome.storage.local.remove('checkSession').then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'AI_ANALYZE':
      handleAIAnalyze(request, sendResponse);
      return true;

    case 'AI_ANALYZE_DEBUG':
      handleAIAnalyzeDebug(request, sendResponse);
      return true;

    case 'APPLY_CATEGORIES':
      handleApplyCategories(request, sendResponse);
      return true;

    case 'GET_ANALYSIS_SESSION':
      chrome.storage.local.get('analysisSession').then(result => {
        sendResponse({ session: result.analysisSession || null });
      });
      return true;

    case 'CLEAR_ANALYSIS_SESSION':
      chrome.storage.local.remove('analysisSession').then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'CANCEL_ANALYSIS':
      if (currentAnalysisCancelToken) {
        currentAnalysisCancelToken.cancelled = true;
      }
      sendResponse({ success: true });
      return true;

    case 'IMPORT_FROM_BROWSER':
      handleImportFromBrowser(request, sendResponse);
      return true;

    case 'CLEAR_DATA':
      handleClearData(request, sendResponse);
      return true;

    case 'PAGE_INFO_COLLECTED':
      handlePageInfoCollected(request, sender);
      sendResponse({ success: true });
      return false; // 同步响应

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

/**
 * 处理 content script 采集的页面信息，写入对应 bookmark 的 description 和 favicon
 */
async function handlePageInfoCollected(request, sender) {
  try {
    const { data } = request;
    if (!data || !data.url) return;

    await initDatabase();

    // 通过 URL 查找对应的 bookmark
    const allBookmarks = await getAllBookmarks();
    const bookmark = allBookmarks.find(bm => bm.url === data.url);

    if (bookmark) {
      let updated = false;

      if (data.description && !bookmark.description) {
        bookmark.description = data.description.slice(0, 300);
        updated = true;
      }
      if (data.favicon && !bookmark.favicon) {
        bookmark.favicon = data.favicon;
        updated = true;
      }

      if (updated) {
        bookmark.updatedAt = Date.now();
        await addBookmark(bookmark);
        console.log(`[PageInfo] 已保存页面信息: ${data.url.slice(0, 60)}`);
      }
    }
  } catch (error) {
    console.debug('[PageInfo] 保存失败:', error.message);
  }
}

/**
 * 获取收藏数据
 */
async function handleGetBookmarks(request, sendResponse) {
  try {
    const database = await initDatabase();
    const bookmarks = await getAllBookmarks();
    const categories = await getAllCategories();

    sendResponse({
      bookmarks,
      categories,
      tags: [] // TODO: 实现获取标签的功能
    });
  } catch (error) {
    console.error('Failed to get bookmarks:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 获取分类数据
 */
async function handleGetCategories(request, sendResponse) {
  try {
    await initDatabase();
    const categories = await getAllCategories();
    sendResponse({ categories });
  } catch (error) {
    console.error('Failed to get categories:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 同步到浏览器收藏
 */
async function handleSyncBookmarks(request, sendResponse) {
  try {
    // TODO: 将本地数据同步到浏览器 bookmarks API
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

/**
 * 检测失效链接
 */
async function handleCheckBrokenLinks(request, sendResponse) {
  try {
    // 防止重复启动：已有检测在运行时直接返回
    if (currentCheckCancelToken !== null) {
      sendResponse({ success: false, alreadyRunning: true });
      return;
    }

    await initDatabase();

    const allBookmarks = await getAllBookmarks();

    if (allBookmarks.length === 0) {
      sendResponse({ success: true, total: 0, brokenCount: 0, brokenLinks: [] });
      return;
    }

    // ── 断点续检逻辑 ──────────────────────────────────────────────────────────
    // 读取上次中断的会话（若存在）
    const { checkSession } = await chrome.storage.local.get('checkSession');
    let sessionStart;

    if (request.resume && checkSession && checkSession.startTime) {
      // 续检模式：只检测 lastChecked < sessionStart 的书签（即本次会话尚未检测的）
      sessionStart = checkSession.startTime;
    } else {
      // 全新检测：记录新会话起始时间
      sessionStart = Date.now();
      await chrome.storage.local.set({
        checkSession: { startTime: sessionStart, total: allBookmarks.length, cancelled: false }
      });
    }

    // 过滤出本次需要检测的书签
    const bookmarks = allBookmarks.filter(
      b => !b.lastChecked || b.lastChecked < sessionStart
    );

    const skippedCount = allBookmarks.length - bookmarks.length;
    // ─────────────────────────────────────────────────────────────────────────

    if (bookmarks.length === 0) {
      // 全部都已检测过
      await chrome.storage.local.remove('checkSession');
      const brokenLinks = allBookmarks
        .filter(b => b.status === 'broken')
        .map(b => ({ bookmarkId: b.id, url: b.url, title: b.title,
          error: b.checkError, statusCode: b.checkStatusCode, checkStatus: b.checkStatus }));
      sendResponse({ success: true, cancelled: false, total: allBookmarks.length,
        skippedCount, brokenCount: brokenLinks.length, movedCount: 0, brokenLinks });
      return;
    }

    // 创建取消令牌，支持用户中止
    currentCheckCancelToken = { cancelled: false };

    const options = {
      concurrency: request.concurrency || 10,
      timeout:     request.timeout     || 6000,
      delay:       request.delay       || 0,
      retries:     1,
      cancelToken: currentCheckCancelToken,
      onProgress: (completed, total, brokenBookmarkCount) => {
        const progressData = {
          completed: completed + skippedCount,
          total: allBookmarks.length,
          brokenCount: brokenBookmarkCount,
          percentage: Math.round(((completed + skippedCount) / allBookmarks.length) * 100),
          startTime: sessionStart   // 供 popup 恢复时计算 ETA
        };
        currentCheckProgress = progressData;
        chrome.runtime.sendMessage({
          type: 'CHECK_PROGRESS',
          data: progressData
        }).catch(() => { /* popup 可能已关闭 */ });
      },
      // 增量保存：每条书签检测完立即写入 DB
      onItemChecked: async (bookmark) => {
        await addBookmark(bookmark);
      }
    };

    await checkBookmarks(bookmarks, options);

    const cancelled = currentCheckCancelToken.cancelled;
    currentCheckCancelToken = null;
    currentCheckProgress = null;

    // ── 清理已恢复的书签：从“待清理”移回无分类 ────────────────────────────────
    const allCategories = await getAllCategories();
    const pendingCat = allCategories.find(c => c.name === '待清理');
    if (pendingCat) {
      for (const b of allBookmarks) {
        if (b.status !== 'broken' && b.categoryId === pendingCat.id) {
          b.categoryId = null;   // 移回无分类
          await addBookmark(b);  // 写回 DB
        }
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    // 从全量书签中统计失效（包含本次跳过的已知失效书签）
    const brokenLinks = allBookmarks
      .filter(b => b.status === 'broken')
      .map(b => ({
        bookmarkId: b.id,
        url: b.url,
        title: b.title,
        error: b.checkError,
        statusCode: b.checkStatusCode,
        checkStatus: b.checkStatus
      }));

    // WAF/反爬拦截的不确定链接数
    const uncertainCount = allBookmarks.filter(b => b.checkStatus === 'uncertain').length;

    // 广播检测结束，供重新打开的 popup 实例更新 UI
    chrome.runtime.sendMessage({
      type: 'CHECK_DONE',
      data: { cancelled, total: allBookmarks.length, skippedCount, brokenCount: brokenLinks.length, uncertainCount }
    }).catch(() => {});

    if (cancelled) {
      // 记录会话为已中断，保留 sessionStart 供下次续检
      await chrome.storage.local.set({
        checkSession: { startTime: sessionStart, total: allBookmarks.length, cancelled: true }
      });
    } else {
      // 正常完成，清除会话
      await chrome.storage.local.remove('checkSession');
    }

    // 将失效链接移至"待清理"分类
    const movedCount = await batchMoveToPendingCleanup(brokenLinks);

    sendResponse({
      success: true,
      cancelled,
      total: allBookmarks.length,
      skippedCount,
      brokenCount: brokenLinks.length,
      uncertainCount,
      movedCount,
      brokenLinks
    });

  } catch (error) {
    currentCheckCancelToken = null;
    console.error('Failed to check broken links:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * AI 分析收藏（支持断点续分析、逐批缓存、取消）
 */
async function handleAIAnalyze(request, sendResponse) {
  // 防止重复启动
  if (currentAnalysisCancelToken !== null) {
    sendResponse({ error: '分析正在进行中，请稍候' });
    return;
  }

  try {
    const { bookmarkIds, forceRestart } = request;

    await initDatabase();

    const allBookmarks = await getAllBookmarks();
    const bookmarksToAnalyze = bookmarkIds?.length > 0
      ? allBookmarks.filter(bm => bookmarkIds.includes(bm.id))
      : allBookmarks;

    if (bookmarksToAnalyze.length === 0) {
      sendResponse({ error: '没有可分析的收藏' });
      return;
    }

    const categories = await getAllCategories();
    const existingCategoryNames = categories.map(c => c.name);

    const configResult = await chrome.storage.local.get('aiConfig');
    const aiConfig = configResult.aiConfig;

    if (!aiConfig?.apiUrl || !aiConfig?.apiKey || !aiConfig?.model) {
      sendResponse({ error: '请先在设置中配置 AI API' });
      return;
    }

    // 验证通过后立即响应，避免长时间任务导致消息通道关闭（MV3 Service Worker 限制）
    sendResponse({ started: true });

    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(bookmarksToAnalyze.length / BATCH_SIZE);
    const sessionBookmarkIds = bookmarksToAnalyze.map(b => b.id);

    // ── 断点续分析：检查是否有未完成的会话 ──────────────────────────────────────
    const { analysisSession } = await chrome.storage.local.get('analysisSession');
    let startBatchIndex = 0;
    let cachedBatches = [];

    if (!forceRestart && analysisSession && !analysisSession.completed) {
      const storedIds = [...(analysisSession.bookmarkIds || [])].sort().join(',');
      const currentIds = [...sessionBookmarkIds].sort().join(',');
      const completedCount = analysisSession.completedBatches?.length ?? 0;
      if (storedIds === currentIds && completedCount > 0) {
        startBatchIndex = completedCount;
        cachedBatches = analysisSession.completedBatches;
        console.log(`[AI] 续分析：从第 ${startBatchIndex + 1}/${totalBatches} 批开始`);
      }
    }

    // 新建或重置会话
    if (startBatchIndex === 0) {
      await chrome.storage.local.set({
        analysisSession: {
          startTime: Date.now(),
          bookmarkIds: sessionBookmarkIds,
          totalBatches,
          batchSize: BATCH_SIZE,
          completedBatches: [],
          completed: false
        }
      });
      cachedBatches = [];
    }
    // ──────────────────────────────────────────────────────────────────────────

    // 通知 popup 开始提取摘要
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_PROGRESS',
      data: { current: startBatchIndex, total: totalBatches, message: '正在提取页面摘要...' }
    }).catch(() => {});

    const summaryMap = await batchExtractSummaries(bookmarksToAnalyze);
    const enrichedBookmarks = enrichBookmarks(bookmarksToAnalyze, summaryMap);
    console.log(`[AI] 摘要提取: ${summaryMap.size}/${bookmarksToAnalyze.length} 成功`);

    // 将新采集到的摘要描述持久化到 IndexedDB（仅补填空白字段，不覆盖已有数据）
    if (summaryMap.size > 0) {
      const updateTasks = [];
      for (const bm of bookmarksToAnalyze) {
        const summary = summaryMap.get(bm.id);
        if (!summary) continue;
        const needsUpdate = (!bm.description && summary.description);
        if (needsUpdate) {
          const updated = { ...bm };
          if (!bm.description && summary.description) {
            updated.description = summary.description.slice(0, 300);
          }
          updated.updatedAt = Date.now();
          updateTasks.push(addBookmark(updated));
        }
      }
      if (updateTasks.length > 0) {
        await Promise.all(updateTasks);
        console.log(`[AI] 已将 ${updateTasks.length} 条摘要描述写入 IndexedDB`);
      }
    }

    // 创建取消令牌
    currentAnalysisCancelToken = { cancelled: false };

    const analysisResult = await analyzeBookmarks(
      aiConfig,
      enrichedBookmarks,
      existingCategoryNames,
      {
        batchSize: BATCH_SIZE,
        cancelToken: currentAnalysisCancelToken,
        startBatchIndex,
        cachedBatches,
        onProgress: (current, total, message) => {
          chrome.runtime.sendMessage({
            type: 'ANALYSIS_PROGRESS',
            data: { current, total, message }
          }).catch(() => {});
        },
        onBatchComplete: async (batchIndex, batchLog) => {
          // 持久化轻量缓存（只存恢复所需字段，不存完整请求报文）
          const { analysisSession: sess } = await chrome.storage.local.get('analysisSession');
          if (sess && !sess.completed) {
            sess.completedBatches.push({
              batchIndex,
              categories: batchLog.categories,
              tags: batchLog.tags,
              usage: batchLog.usage
            });
            await chrome.storage.local.set({ analysisSession: sess });
          }
          // 广播批次摘要到 popup（不持久化完整报文）
          chrome.runtime.sendMessage({
            type: 'ANALYSIS_BATCH_DONE',
            data: {
              batchIndex,
              totalBatches,
              categoriesCount: batchLog.categories.length,
              tagsCount: batchLog.tags.length,
              usage: batchLog.usage,
              warnings: batchLog.warnings,
              duration: batchLog.duration,
              fromCache: batchLog.fromCache
            }
          }).catch(() => {});
        }
      }
    );

    // 正常完成：清除会话缓存，广播结果给 popup
    await chrome.storage.local.remove('analysisSession');
    currentAnalysisCancelToken = null;

    chrome.runtime.sendMessage({
      type: 'ANALYSIS_COMPLETE',
      data: { result: analysisResult }
    }).catch(() => {});

  } catch (error) {
    if (currentAnalysisCancelToken?.cancelled) {
      // 标记会话已取消（保留 completedBatches 供下次续分析）
      try {
        const { analysisSession: sess } = await chrome.storage.local.get('analysisSession');
        if (sess) {
          sess.cancelled = true;
          await chrome.storage.local.set({ analysisSession: sess });
        }
      } catch (_) {}
      chrome.runtime.sendMessage({ type: 'ANALYSIS_CANCELLED' }).catch(() => {});
    } else {
      // 非取消错误（网络中断、关机等）：保留已完成批次，用户下次可续分析
      try {
        const { analysisSession: sess } = await chrome.storage.local.get('analysisSession');
        if (sess && !sess.completed) {
          sess.lastError = error.message;
          await chrome.storage.local.set({ analysisSession: sess });
        }
      } catch (_) {}
      console.error('AI analysis failed:', error);
      chrome.runtime.sendMessage({
        type: 'ANALYSIS_FAILED',
        data: { error: error.message }
      }).catch(() => {});
    }
    currentAnalysisCancelToken = null;
  }
}

/**
 * AI 调试分析（少量书签，记录完整报文）
 */
async function handleAIAnalyzeDebug(request, sendResponse) {
  try {
    const { bookmarkIds } = request;

    await initDatabase();

    // 获取指定的收藏
    const allBookmarks = await getAllBookmarks();
    const bookmarksToAnalyze = allBookmarks.filter(bm => bookmarkIds.includes(bm.id));

    if (bookmarksToAnalyze.length === 0) {
      sendResponse({ error: '没有可分析的收藏' });
      return;
    }

    // 获取现有分类作为参考
    const categories = await getAllCategories();
    const existingCategoryNames = categories.map(c => c.name);

    // 获取 AI 配置
    const configResult = await chrome.storage.local.get('aiConfig');
    const aiConfig = configResult.aiConfig;

    if (!aiConfig || !aiConfig.apiUrl || !aiConfig.apiKey || !aiConfig.model) {
      sendResponse({ error: '请先在设置中配置 AI API' });
      return;
    }

    // 提取页面摘要信息
    console.log('[AI Debug] 正在提取页面摘要...');
    const summaryMap = await batchExtractSummaries(bookmarksToAnalyze);
    const enrichedBookmarks = enrichBookmarks(bookmarksToAnalyze, summaryMap);
    console.log(`[AI Debug] 摘要提取完成: ${summaryMap.size}/${bookmarksToAnalyze.length}`);

    // 调用 Debug 分析
    const debugLog = await analyzeBookmarksDebug(
      aiConfig,
      enrichedBookmarks,
      existingCategoryNames
    );

    // 在 debugLog 中记录摘要提取结果
    debugLog.summaryExtraction = {
      total: bookmarksToAnalyze.length,
      success: summaryMap.size,
      details: Object.fromEntries(summaryMap)
    };

    sendResponse({ result: debugLog });
  } catch (error) {
    console.error('AI debug analysis failed:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 应用分类建议
 */
async function handleApplyCategories(request, sendResponse) {
  try {
    const { categories } = request;

    await initDatabase();

    // 创建新分类
    for (const cat of categories) {
      if (cat.isNew) {
        // 检查分类是否已存在
        const existing = await get(STORES.CATEGORIES, `cat_${cat.name}`);

        if (!existing) {
          await addCategory({
            id: `cat_${cat.name}`,
            name: cat.name,
            parentId: null,
            createdAt: Date.now()
          });
        }
      }

      // 更新收藏的分类
      for (const bookmarkId of cat.bookmarkIds) {
        const bookmark = await getBookmark(bookmarkId);
        if (bookmark) {
          bookmark.categoryId = `cat_${cat.name}`;
          bookmark.updatedAt = Date.now();
          await addBookmark(bookmark);
        }
      }
    }

    sendResponse({ success: true });
  } catch (error) {
    console.error('Failed to apply categories:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 从浏览器导入收藏
 */
async function handleImportFromBrowser(request, sendResponse) {
  try {
    console.log('[IMPORT] Starting import from browser...');
    await initDatabase();
    console.log('[IMPORT] Database initialized');

    // 执行导入
    await importBrowserBookmarks();
    console.log('[IMPORT] importBrowserBookmarks completed');

    // 获取导入后的收藏数量
    const bookmarks = await getAllBookmarks();
    const categories = await getAllCategories();

    console.log(`[IMPORT] Total bookmarks in DB: ${bookmarks.length}, Total categories: ${categories.length}`);

    sendResponse({
      success: true,
      imported: bookmarks.length,
      categories: categories.length,
      message: `成功导入 ${bookmarks.length} 个收藏和 ${categories.length} 个分类`
    });
  } catch (error) {
    console.error('[IMPORT] Failed to import from browser:', error);
    console.error('[IMPORT] Error stack:', error.stack);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 清空所有数据
 */
async function handleClearData(request, sendResponse) {
  try {
    console.log('[CLEAR] Starting data clear...');
    await initDatabase();
    await clearAllData();
    console.log('[CLEAR] All data cleared');

    sendResponse({
      success: true,
      message: '数据已清空'
    });
  } catch (error) {
    console.error('[CLEAR] Failed to clear data:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// 定期同步（可选）
// chrome.alarms.create('syncBookmarks', { periodInMinutes: 30 });
// chrome.alarms.onAlarm.addListener((alarm) => {
//   if (alarm.name === 'syncBookmarks') {
//     // 执行定期同步
//   }
// });
