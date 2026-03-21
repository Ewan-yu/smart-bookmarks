/**
 * SVG 图标库 — Lucide 风格
 * stroke-width: 1.5, stroke-linecap: round, stroke-linejoin: round
 * 统一尺寸：16×16（行内）或通过 size 参数覆盖
 */

function svgWrap(path, size = 16, extraAttrs = '') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extraAttrs ? ' ' + extraAttrs : ''}>${path}</svg>`;
}

// ── 导航 ──────────────────────────────────────────────────────────────────────
export const icon = {
  /** 全部收藏 📚 */
  bookmarks: (s) => svgWrap('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20l-7-4-7 4V2z"/>', s),

  /** 最近添加 🕐 */
  clock: (s) => svgWrap('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', s),

  /** 失效链接 ⚠️ */
  alertTriangle: (s) => svgWrap('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', s),

  /** 标签视图 🏷️ */
  tag: (s) => svgWrap('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>', s),

  /** 文件夹 📁 */
  folder: (s) => svgWrap('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>', s),

  /** 文件夹（展开）📂 */
  folderOpen: (s) => svgWrap('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="2 9 2 19 22 19 22 9"/>', s),

  /** 新建子文件夹 ➕📁 */
  folderPlus: (s) => svgWrap('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>', s),

  /** 书签 🔖 */
  bookmark: (s) => svgWrap('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>', s),

  /** 打开链接 🔗 */
  externalLink: (s) => svgWrap('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', s),

  /** 无痕打开 🕵️ */
  eyeOff: (s) => svgWrap('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>', s),

  /** 新窗口 🪟 */
  maximize: (s) => svgWrap('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>', s),

  /** 编辑 ✏️ */
  pencil: (s) => svgWrap('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', s),

  /** 复制链接 📋 */
  clipboard: (s) => svgWrap('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>', s),

  /** 剪切 ✂️ */
  scissors: (s) => svgWrap('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>', s),

  /** 粘贴 📌 */
  clipboardPaste: (s) => svgWrap('<path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2"/><path d="M12 12v8"/><path d="m16 16-4-4-4 4"/>', s),

  /** 移动 */
  move: (s) => svgWrap('<path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>', s),

  /** 添加标签 */
  tagPlus: (s) => svgWrap('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/><line x1="16" y1="4" x2="16" y2="10"/><line x1="13" y1="7" x2="19" y2="7"/>', s),

  /** 检测链接 ✅ */
  checkCircle: (s) => svgWrap('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', s),

  /** 重新生成 🔄 */
  refreshCw: (s) => svgWrap('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', s),

  /** 重命名 / 重新生成（简版） */
  rename: (s) => svgWrap('<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>', s),

  /** 合并文件夹 🔀 */
  merge: (s) => svgWrap('<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>', s),

  /** 删除 🗑️ */
  trash: (s) => svgWrap('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', s),

  /** 搜索 🔍 */
  search: (s) => svgWrap('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', s),

  /** AI / 魔法 🤖 */
  sparkles: (s) => svgWrap('<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75z"/><path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75z"/>', s),

  /** 调试 🔬 */
  microscope: (s) => svgWrap('<path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>', s),

  /** 下载 📥 */
  download: (s) => svgWrap('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', s),

  /** 上传 📤 */
  upload: (s) => svgWrap('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', s),

  /** 设置 ⚙️ */
  settings: (s) => svgWrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', s),

  /** 任务面板 ⚡ */
  zap: (s) => svgWrap('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', s),

  /** 加载中 ⏳ */
  loader: (s) => svgWrap('<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>', s),

  /** 取消 ✕ */
  x: (s) => svgWrap('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', s),

  /** 位置 📍 */
  mapPin: (s) => svgWrap('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', s),

  /** 问号 ❓ */
  helpCircle: (s) => svgWrap('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>', s),

  /** 成功 ✓ */
  check: (s) => svgWrap('<polyline points="20 6 9 17 4 12"/>', s),

  /** 错误 ✗ */
  xmark: (s) => svgWrap('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', s),

  /** 地球 🌐 */
  globe: (s) => svgWrap('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', s),

  /** 网络插头 🔌 */
  plug: (s) => svgWrap('<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2z"/>', s),

  /** 计时器 ⏱️ */
  timer: (s) => svgWrap('<line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="12" y2="8"/><circle cx="12" cy="14" r="8"/>', s),

  /** 键盘 ⌨️ */
  keyboard: (s) => svgWrap('<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><line x1="7" y1="12" x2="7" y2="12"/><line x1="12" y1="12" x2="12" y2="12"/><line x1="17" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/>', s),

  /** 图表 📊 */
  barChart: (s) => svgWrap('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', s),

  /** 导入收藏 */
  importBookmarks: (s) => svgWrap('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', s),

  /** 信息 */
  info: (s) => svgWrap('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', s),

  /** 保留 ✓ (去重用) */
  keep: (s) => svgWrap('<path d="M20 6L9 17l-5-5"/>', s),

  /** 暂停 ⏸️ */
  pause: (s) => svgWrap('<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>', s),
};

export default icon;
