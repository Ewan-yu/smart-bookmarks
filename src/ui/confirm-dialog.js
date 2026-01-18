/**
 * Smart Bookmarks - 确认对话框组件
 * 用于显示 AI 分析结果并让用户确认是否应用
 */

/**
 * 确认对话框类
 */
class ConfirmDialog {
  constructor() {
    this.dialog = null;
    this.onConfirm = null;
    this.onCancel = null;
    this.analysisResult = null;
    this.bookmarks = [];
  }

  /**
   * 初始化对话框 DOM
   */
  init() {
    // 检查是否已存在
    if (this.dialog) {
      return this;
    }

    // 创建对话框容器
    this.dialog = document.createElement('div');
    this.dialog.className = 'confirm-dialog-overlay';
    this.dialog.innerHTML = `
      <div class="confirm-dialog">
        <div class="dialog-header">
          <h2>AI 智能分类建议</h2>
          <button class="dialog-close" id="dialogClose">&times;</button>
        </div>

        <div class="dialog-content">
          <!-- 分析摘要 -->
          <div class="analysis-summary" id="analysisSummary">
            <div class="summary-item">
              <span class="summary-label">待分类收藏:</span>
              <span class="summary-value" id="totalBookmarks">0</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">已分类:</span>
              <span class="summary-value" id="categorizedCount">0</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">建议新增分类:</span>
              <span class="summary-value highlight" id="newCategoriesCount">0</span>
            </div>
          </div>

          <!-- 新增分类列表 -->
          <div class="new-categories-section" id="newCategoriesSection">
            <h3>建议新增分类</h3>
            <div class="categories-list" id="newCategoriesList"></div>
          </div>

          <!-- 现有分类调整 -->
          <div class="existing-categories-section" id="existingCategoriesSection">
            <h3>现有分类调整</h3>
            <div class="categories-list" id="existingCategoriesList"></div>
          </div>

          <!-- 分类明细 -->
          <details class="category-details" id="categoryDetails">
            <summary>查看分类明细</summary>
            <div class="details-content" id="detailsContent"></div>
          </details>
        </div>

        <div class="dialog-footer">
          <button class="btn btn-cancel" id="dialogCancel">取消</button>
          <button class="btn btn-primary" id="dialogConfirm">应用分类</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.dialog);

    // 绑定事件
    this.bindEvents();

    return this;
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const closeBtn = this.dialog.querySelector('#dialogClose');
    const cancelBtn = this.dialog.querySelector('#dialogCancel');
    const confirmBtn = this.dialog.querySelector('#dialogConfirm');

    // 关闭按钮
    closeBtn.addEventListener('click', () => this.close());

    // 取消按钮
    cancelBtn.addEventListener('click', () => this.close());

    // 确认按钮
    confirmBtn.addEventListener('click', () => {
      if (this.onConfirm) {
        this.onConfirm(this.analysisResult);
      }
      this.close();
    });

    // 点击遮罩层关闭
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) {
        this.close();
      }
    });

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.dialog.classList.contains('show')) {
        this.close();
      }
    });
  }

  /**
   * 显示对话框
   * @param {Object} result - AI 分析结果
   * @param {Array} bookmarks - 收藏列表（用于显示明细）
   * @param {Function} onConfirm - 确认回调
   * @param {Function} onCancel - 取消回调
   */
  show(result, bookmarks, onConfirm, onCancel) {
    this.init();

    this.analysisResult = result;
    this.bookmarks = bookmarks;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;

    // 渲染内容
    this.render();

    // 显示对话框
    this.dialog.classList.add('show');
  }

  /**
   * 关闭对话框
   */
  close() {
    if (this.dialog) {
      this.dialog.classList.remove('show');

      // 触发取消回调
      if (this.onCancel) {
        this.onCancel();
      }
    }
  }

  /**
   * 渲染对话框内容
   */
  render() {
    const { summary, categories } = this.analysisResult;

    // 渲染摘要
    document.getElementById('totalBookmarks').textContent = summary.totalBookmarks;
    document.getElementById('categorizedCount').textContent = summary.categorizedCount;
    document.getElementById('newCategoriesCount').textContent = summary.newCategories.length;

    // 渲染新增分类
    const newCategoriesSection = document.getElementById('newCategoriesSection');
    const newCategoriesList = document.getElementById('newCategoriesList');

    if (summary.newCategories.length > 0) {
      newCategoriesSection.style.display = 'block';
      newCategoriesList.innerHTML = summary.newCategories.map(name => `
        <div class="category-tag category-tag-new">${name}</div>
      `).join('');
    } else {
      newCategoriesSection.style.display = 'none';
    }

    // 渲染现有分类调整
    const existingCategoriesSection = document.getElementById('existingCategoriesSection');
    const existingCategoriesList = document.getElementById('existingCategoriesList');

    const existingCategories = categories.filter(cat => !cat.isNew);

    if (existingCategories.length > 0) {
      existingCategoriesSection.style.display = 'block';
      existingCategoriesList.innerHTML = existingCategories.map(cat => `
        <div class="category-adjustment">
          <div class="category-name">${cat.name}</div>
          <div class="category-count">
            <span class="count-label">新增:</span>
            <span class="count-value">${cat.bookmarkIds.length}</span>
          </div>
        </div>
      `).join('');
    } else {
      existingCategoriesSection.style.display = 'none';
    }

    // 渲染明细
    this.renderDetails();
  }

  /**
   * 渲染分类明细
   */
  renderDetails() {
    const detailsContent = document.getElementById('detailsContent');
    const { categories } = this.analysisResult;

    // 创建收藏 ID 到标题的映射
    const bookmarkMap = new Map();
    this.bookmarks.forEach(bm => {
      bookmarkMap.set(bm.id, bm);
    });

    // 按分类分组
    const newCategories = categories.filter(cat => cat.isNew);
    const existingCategories = categories.filter(cat => !cat.isNew);

    let html = '';

    // 新增分类明细
    if (newCategories.length > 0) {
      html += '<div class="detail-section"><h4>新增分类明细</h4>';
      newCategories.forEach(cat => {
        html += `
          <div class="detail-category">
            <div class="detail-category-header">
              <span class="detail-category-name">${cat.name}</span>
              <span class="detail-category-confidence">
                置信度: ${Math.round(cat.confidence * 100)}%
              </span>
            </div>
            <div class="detail-bookmarks">
              ${cat.bookmarkIds.map(id => {
                const bm = bookmarkMap.get(id);
                return bm ? `
                  <div class="detail-bookmark">
                    <div class="bookmark-title">${this.escapeHtml(bm.title)}</div>
                    <div class="bookmark-url">${this.escapeHtml(bm.url)}</div>
                  </div>
                ` : '';
              }).join('')}
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    // 现有分类明细
    if (existingCategories.length > 0) {
      html += '<div class="detail-section"><h4>现有分类明细</h4>';
      existingCategories.forEach(cat => {
        html += `
          <div class="detail-category">
            <div class="detail-category-header">
              <span class="detail-category-name">${cat.name}</span>
              <span class="detail-category-confidence">
                置信度: ${Math.round(cat.confidence * 100)}%
              </span>
            </div>
            <div class="detail-bookmarks">
              ${cat.bookmarkIds.map(id => {
                const bm = bookmarkMap.get(id);
                return bm ? `
                  <div class="detail-bookmark">
                    <div class="bookmark-title">${this.escapeHtml(bm.title)}</div>
                    <div class="bookmark-url">${this.escapeHtml(bm.url)}</div>
                  </div>
                ` : '';
              }).join('')}
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    detailsContent.innerHTML = html;
  }

  /**
   * HTML 转义
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 销毁对话框
   */
  destroy() {
    if (this.dialog && this.dialog.parentNode) {
      this.dialog.parentNode.removeChild(this.dialog);
      this.dialog = null;
    }
  }
}

// 导出单例
export default new ConfirmDialog();
