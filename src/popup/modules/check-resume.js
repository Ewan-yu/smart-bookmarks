/**
 * 失效链接检测恢复对话框模块
 * 用于显示未完成的失效链接检测任务
 */

/**
 * 显示检测恢复对话框
 * @param {Object} options - 对话框选项
 * @param {string} options.sessionTime - 会话时间
 * @param {number} options.checkedCount - 已检测数量
 * @param {number} options.remaining - 剩余数量
 * @param {number} options.total - 总数
 * @param {Function} options.onResume - 恢复检测的回调
 * @param {Function} options.onFresh - 重新检测的回调
 */
export function showResumeDialog({ sessionTime, checkedCount, remaining, total, onResume, onFresh }) {
  // 复用 confirm-dialog 的遮罩，自己构造两按钮内容
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog-overlay';

  overlay.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-dialog-header">
        <h3><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:5px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>上次检测未完成</h3>
      </div>
      <div class="confirm-dialog-body">
        <p>上次检测（${sessionTime}）被中断。</p>
        <p>已完成 <strong>${checkedCount}</strong> 个，剩余 <strong>${remaining}</strong> 个未检测。</p>
        <p style="margin-top:8px;color:var(--text-secondary);font-size:12px;">
          续检将跳过已完成的 ${checkedCount} 个，只检测剩余部分。
        </p>
      </div>
      <div class="confirm-dialog-footer" style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-secondary" id="resumeDialogFresh"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:4px;"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>重新全检</button>
        <button class="btn btn-primary" id="resumeDialogResume"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:4px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>继续上次（${remaining} 个）</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  function close() {
    overlay.classList.remove('show');
    overlay.classList.add('hide');
    setTimeout(() => overlay.remove(), 300);
  }

  overlay.querySelector('#resumeDialogResume').addEventListener('click', () => { close(); onResume(); });
  overlay.querySelector('#resumeDialogFresh').addEventListener('click', () => { close(); onFresh(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}
