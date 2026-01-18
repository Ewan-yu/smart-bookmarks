// Smart Bookmarks - Content Script
// 用于采集网页信息（标题、描述、favicon 等）

console.log('Smart Bookmarks content script loaded');

// 页面加载完成后采集信息
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', collectPageInfo);
} else {
  collectPageInfo();
}

// 采集页面信息
function collectPageInfo() {
  const pageInfo = {
    title: document.title,
    url: window.location.href,
    description: getDescription(),
    favicon: getFavicon(),
    timestamp: Date.now()
  };

  console.log('Page info collected:', pageInfo);

  // 发送到 background script
  chrome.runtime.sendMessage({
    type: 'PAGE_INFO_COLLECTED',
    data: pageInfo
  }).catch(err => {
    // 静默处理错误（background 可能还未加载）
    console.debug('Failed to send page info:', err);
  });
}

// 获取页面描述
function getDescription() {
  // 优先级：meta description > og:description > 第一段文字
  const metaDesc = document.querySelector('meta[name="description"]')?.content;
  if (metaDesc) return metaDesc;

  const ogDesc = document.querySelector('meta[property="og:description"]')?.content;
  if (ogDesc) return ogDesc;

  const firstParagraph = document.querySelector('p');
  if (firstParagraph) {
    const text = firstParagraph.textContent.trim();
    return text.length > 200 ? text.substring(0, 200) + '...' : text;
  }

  return '';
}

// 获取网站图标
function getFavicon() {
  // 优先级：apple-touch-icon > icon > default favicon
  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]')?.href;
  if (appleIcon) return appleIcon;

  const icon = document.querySelector('link[rel="icon"]')?.href;
  if (icon) return icon;

  const shortcutIcon = document.querySelector('link[rel="shortcut icon"]')?.href;
  if (shortcutIcon) return shortcutIcon;

  // 默认 favicon
  return new URL('/favicon.ico', window.location.origin).href;
}

// 监听来自 popup/background 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_PAGE_INFO') {
    sendResponse({
      title: document.title,
      description: getDescription(),
      favicon: getFavicon()
    });
  }
  return true;
});
