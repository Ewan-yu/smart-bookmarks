/**
 * TagView — 标签星空视图模块
 *
 * 独立模块，不依赖 popup.js 的内部状态。
 * 通过构造函数注入依赖，通过 render(bookmarks) 驱动渲染。
 *
 * 功能：
 * - 可变字号 5 档（按书签数量分级）
 * - 搜索过滤（debounce 100ms）
 * - 排序切换（数量/字母/最近）
 * - 入场动画（逐个淡入）
 * - 巨星标签微光动效
 * - 星座连线彩蛋
 */

import { escapeHtml } from '../utils/helpers.js';

// 尺寸档位阈值
const SIZE_TIERS = [
  { min: 50,  cls: 'size-xl' },
  { min: 15,  cls: 'size-lg' },
  { min: 5,   cls: 'size-md' },
  { min: 2,   cls: 'size-sm' },
  { min: 0,   cls: 'size-xs' },
];

// 排序模式
const SORT_MODES = {
  COUNT: 'count',
  ALPHA: 'alpha',
  RECENT: 'recent',
};

export class TagView {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - 书签列表容器
   * @param {HTMLElement} options.breadcrumbs - 面包屑元素
   * @param {HTMLElement} options.folderStats - 右侧统计元素
   * @param {Function} options.createBookmarkRow - 创建书签行的函数
   * @param {Object} options.navManager - 导航管理器实例
   */
  constructor({ container, breadcrumbs, folderStats, createBookmarkRow, navManager }) {
    this.container = container;
    this.breadcrumbs = breadcrumbs;
    this.folderStats = folderStats;
    this.createBookmarkRow = createBookmarkRow;
    this.navManager = navManager;

    // 内部状态
    this._sortMode = SORT_MODES.COUNT;
    this._searchTerm = '';
    this._tagMap = new Map();      // tag → [bookmarks]
    this._recentMap = new Map();   // tag → lastUsedTimestamp
    this._clickHistory = [];       // 彩蛋：快速点击记录
    this._constellationTimer = null;
    this._searchDebounce = null;
  }

  // ─── 公共 API ───

  /**
   * 渲染标签星空视图
   * @param {Array} bookmarks - 全部书签列表
   */
  render(bookmarks) {
    this._cleanup();
    this._buildTagMap(bookmarks);
    this._searchTerm = '';

    if (this.breadcrumbs) {
      this.breadcrumbs.innerHTML = '<span class="bc-item current">'
        + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:4px;">'
        + '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>'
        + '<line x1="7" y1="7" x2="7.01" y2="7"/>'
        + '</svg>标签视图</span>';
    }

    this.container.innerHTML = '';

    if (this._tagMap.size === 0) {
      this._renderEmpty();
      return;
    }

    this._renderStatsBar();
    this._renderToolbar();
    this._renderCloud();
    this._updateStats();
  }

  /**
   * 清理资源
   */
  destroy() {
    this._cleanup();
  }

  // ─── 内部方法 ───

  _cleanup() {
    if (this._searchDebounce) {
      clearTimeout(this._searchDebounce);
      this._searchDebounce = null;
    }
    if (this._constellationTimer) {
      clearTimeout(this._constellationTimer);
      this._constellationTimer = null;
    }
    this._clickHistory = [];
  }

  /**
   * 构建标签 → 书签映射
   */
  _buildTagMap(bookmarks) {
    this._tagMap.clear();
    this._recentMap.clear();

    bookmarks.forEach(bm => {
      (bm.tags || []).forEach(tag => {
        if (!this._tagMap.has(tag)) this._tagMap.set(tag, []);
        this._tagMap.get(tag).push(bm);

        // 记录最近使用时间
        const time = bm.dateAdded || bm.createdAt || bm.updatedAt || 0;
        const ts = typeof time === 'number' ? time : new Date(time).getTime();
        if (!this._recentMap.has(tag) || ts > this._recentMap.get(tag)) {
          this._recentMap.set(tag, ts);
        }
      });
    });
  }

  /**
   * 根据书签数量返回尺寸档位
   */
  _getStarSize(count) {
    for (const tier of SIZE_TIERS) {
      if (count >= tier.min) return tier.cls;
    }
    return 'size-xs';
  }

  /**
   * 获取排序后的标签列表
   */
  _getSortedTags() {
    let entries = [...this._tagMap.entries()];

    // 搜索过滤
    if (this._searchTerm.trim()) {
      const term = this._searchTerm.trim().toLowerCase();
      entries = entries.filter(([tag]) => tag.toLowerCase().includes(term));
    }

    // 排序
    switch (this._sortMode) {
      case SORT_MODES.ALPHA:
        entries.sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'));
        break;
      case SORT_MODES.RECENT:
        entries.sort((a, b) => {
          const tb = this._recentMap.get(b[0]) || 0;
          const ta = this._recentMap.get(a[0]) || 0;
          return tb - ta;
        });
        break;
      case SORT_MODES.COUNT:
      default:
        entries.sort((a, b) => b[1].length - a[1].length);
        break;
    }

    return entries;
  }

  // ─── 渲染方法 ───

  _renderEmpty() {
    this.container.innerHTML = `
      <div class="tv-empty">
        <div class="tv-empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
        </div>
        <h3>暂无标签</h3>
        <p>为收藏添加标签，开启星空视图</p>
      </div>`;
    if (this.folderStats) this.folderStats.textContent = '';
  }

  _renderStatsBar() {
    const bar = document.createElement('div');
    bar.className = 'tv-stats';
    bar.innerHTML = `
      <div class="tv-stats-main">
        <span class="tv-stats-item"><span class="tv-stats-value" id="tvTotalTags">0</span> 标签</span>
        <span class="tv-stats-divider"></span>
        <span class="tv-stats-item">最常用: <span class="tv-stats-value" id="tvTopTag">—</span></span>
        <span class="tv-stats-divider"></span>
        <span class="tv-stats-item">覆盖 <span class="tv-stats-value" id="tvTotalBms">0</span> 篇书签</span>
      </div>
      <span class="tv-stats-filter" id="tvFilterInfo"></span>`;
    this.container.appendChild(bar);
  }

  _renderToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'tv-toolbar';

    // 搜索框
    toolbar.innerHTML = `
      <div class="tv-search">
        <span class="tv-search-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </span>
        <input type="text" class="tv-search-input" placeholder="搜索 ${this._tagMap.size} 个标签…" autocomplete="off" />
        <button class="tv-search-clear" style="display:none;" title="清除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="tv-sort-group">
        <button class="tv-sort-btn active" data-sort="count">按数量</button>
        <button class="tv-sort-btn" data-sort="alpha">按字母</button>
        <button class="tv-sort-btn" data-sort="recent">最近使用</button>
      </div>`;

    this.container.appendChild(toolbar);

    // 绑定搜索事件
    const input = toolbar.querySelector('.tv-search-input');
    const clearBtn = toolbar.querySelector('.tv-search-clear');

    input.addEventListener('input', () => {
      clearBtn.style.display = input.value ? 'flex' : 'none';
      clearTimeout(this._searchDebounce);
      this._searchDebounce = setTimeout(() => {
        this._searchTerm = input.value;
        this._refreshCloud();
      }, 100);
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      this._searchTerm = '';
      this._refreshCloud();
      input.focus();
    });

    // 绑定排序按钮
    toolbar.querySelectorAll('.tv-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        toolbar.querySelectorAll('.tv-sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._sortMode = btn.dataset.sort;
        this._refreshCloud();
      });
    });
  }

  _renderCloud() {
    const cloud = document.createElement('div');
    cloud.className = 'tv-cloud';
    cloud.id = 'tvCloud';
    this.container.appendChild(cloud);
    this._populateCloud(cloud);
  }

  _populateCloud(cloud) {
    cloud.innerHTML = '';
    const entries = this._getSortedTags();

    if (entries.length === 0) {
      cloud.innerHTML = '<div class="tv-no-match"><p>没有匹配的标签</p></div>';
      this._updateFilterInfo(0);
      return;
    }

    const fragment = document.createDocumentFragment();

    entries.forEach(([tag, bms], i) => {
      const chip = this._createTagChip(tag, bms.length);
      chip.style.animationDelay = `${Math.min(i * 15, 1500)}ms`;
      chip.classList.add('animate-in');

      chip.addEventListener('click', () => {
        this._onTagClick(tag, bms);
      });

      fragment.appendChild(chip);
    });

    cloud.appendChild(fragment);
    this._updateFilterInfo(entries.length);

    // 检查是否触发星座连线彩蛋
    this._checkConstellation(cloud, entries);
  }

  _refreshCloud() {
    const cloud = this.container.querySelector('#tvCloud');
    if (cloud) {
      this._populateCloud(cloud);
    }
    this._updateStats();
  }

  _createTagChip(tag, count) {
    const chip = document.createElement('button');
    chip.className = `tv-tag ${this._getStarSize(count)}`;
    chip.dataset.tag = tag;
    chip.dataset.count = count;

    const starHtml = count >= 50
      ? '<span class="tv-glow-star">✨</span>'
      : '';

    chip.innerHTML = `<span>${escapeHtml(tag)}</span>${starHtml}<span class="tv-tag-count">${count}</span>`;
    return chip;
  }

  _updateStats() {
    const totalTags = this._tagMap.size;
    const topEntry = [...this._tagMap.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const totalBms = new Set([...this._tagMap.values()].flat().map(b => b.id)).size;

    const totalEl = this.container.querySelector('#tvTotalTags');
    const topEl = this.container.querySelector('#tvTopTag');
    const bmsEl = this.container.querySelector('#tvTotalBms');

    if (totalEl) totalEl.textContent = totalTags;
    if (topEl && topEntry) topEl.textContent = `${topEntry[0]} (${topEntry[1].length}次)`;
    if (bmsEl) bmsEl.textContent = totalBms;
  }

  _updateFilterInfo(visibleCount) {
    const infoEl = this.container.querySelector('#tvFilterInfo');
    if (!infoEl) return;

    if (this._searchTerm.trim() && visibleCount < this._tagMap.size) {
      infoEl.textContent = `显示 ${visibleCount} / ${this._tagMap.size}`;
    } else {
      infoEl.textContent = '';
    }
  }

  // ─── 交互 ───

  _onTagClick(tag, bms) {
    // 记录点击（用于星座彩蛋）
    this._clickHistory.push({ tag, time: Date.now() });
    if (this._clickHistory.length > 10) this._clickHistory.shift();

    // 更新面包屑
    if (this.breadcrumbs) {
      this.breadcrumbs.innerHTML = `
        <span class="bc-item" style="cursor:pointer;" id="bcTagBack">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:4px;">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>标签视图
        </span>
        <span class="bc-sep">›</span>
        <span class="bc-item current">${escapeHtml(tag)}</span>`;

      document.getElementById('bcTagBack')?.addEventListener('click', () => {
        if (this.navManager) {
          this.navManager.setNavMode('tags');
        }
      });
    }

    // 渲染该标签下的书签
    this.container.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'tv-detail-list';
    bms.forEach(bm => list.appendChild(this.createBookmarkRow(bm)));
    this.container.appendChild(list);

    if (this.folderStats) this.folderStats.textContent = `${bms.length} 项`;
  }

  // ─── 彩蛋：星座连线 ───

  _checkConstellation(cloud, entries) {
    const now = Date.now();
    const recent = this._clickHistory.filter(c => now - c.time < 3000);

    if (recent.length < 5) return;

    // 检查是否是 5 个不同的标签
    const uniqueTags = new Set(recent.map(c => c.tag));
    if (uniqueTags.size < 5) return;

    // 触发星座连线！
    this._drawConstellation(cloud);
    this._clickHistory = [];
  }

  _drawConstellation(cloud) {
    const chips = cloud.querySelectorAll('.tv-tag.visible');
    if (chips.length < 5) return;

    // 随机选 5-8 个标签连线
    const count = Math.min(8, chips.length);
    const selected = [];
    const used = new Set();

    while (selected.length < count) {
      const idx = Math.floor(Math.random() * chips.length);
      if (!used.has(idx)) {
        used.add(idx);
        selected.push(chips[idx]);
      }
    }

    // 创建叠加层
    const overlay = document.createElement('div');
    overlay.className = 'tv-constellation-overlay';
    cloud.style.position = 'relative';
    cloud.appendChild(overlay);

    // 画连线
    for (let i = 0; i < selected.length - 1; i++) {
      const a = selected[i].getBoundingClientRect();
      const b = selected[i + 1].getBoundingClientRect();
      const cloudRect = cloud.getBoundingClientRect();

      const x1 = a.left + a.width / 2 - cloudRect.left;
      const y1 = a.top + a.height / 2 - cloudRect.top;
      const x2 = b.left + b.width / 2 - cloudRect.left;
      const y2 = b.top + b.height / 2 - cloudRect.top;

      const length = Math.hypot(x2 - x1, y2 - y1);
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

      const line = document.createElement('div');
      line.className = 'tv-constellation-line';
      line.style.left = `${x1}px`;
      line.style.top = `${y1}px`;
      line.style.width = `${length}px`;
      line.style.transform = `rotate(${angle}deg)`;
      line.style.animationDelay = `${i * 150}ms`;
      overlay.appendChild(line);
    }

    // 2 秒后移除
    this._constellationTimer = setTimeout(() => {
      overlay.remove();
    }, 2500);
  }
}
