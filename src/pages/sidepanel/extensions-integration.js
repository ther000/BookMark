// 扩展功能集成模块 - 导入导出、统计分析等
// 在 sidepanel.js 中引入此文件使用这些功能

const Extensions = {
  // 当前选中的文件
  selectedFile: null,
  
  // 预览数据
  previewData: null,

  /**
   * 初始化所有扩展功能
   */
  init() {
    this.initImportExport();
    this.initEnhancedSearch();
    this.initEmptyStates();
    this.initLoading();
  },

  // ===== 导入导出功能 =====

  initImportExport() {
    // 打开对话框
    const importExportBtn = document.getElementById('importExportBtn');
    importExportBtn?.addEventListener('click', () => this.openImportExportDialog());

    // 关闭对话框
    const closeBtn = document.getElementById('closeImportExportDialog');
    closeBtn?.addEventListener('click', () => this.closeImportExportDialog());

    // 标签切换
    document.querySelectorAll('.ie-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.ie-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const targetTab = tab.dataset.tab;
        document.getElementById('importPanel').classList.toggle('hidden', targetTab !== 'import');
        document.getElementById('exportPanel').classList.toggle('hidden', targetTab !== 'export');
      });
    });

    // 文件选择
    const fileInput = document.getElementById('importFileInput');
    fileInput?.addEventListener('change', (e) => this.handleFileSelect(e));

    // 导入按钮
    const importBtn = document.getElementById('importStartBtn');
    importBtn?.addEventListener('click', () => this.handleImport());

    // 导出按钮
    const exportBtn = document.getElementById('exportStartBtn');
    exportBtn?.addEventListener('click', () => this.handleExport());

    // 取消按钮
    document.getElementById('importCancelBtn')?.addEventListener('click', () => this.closeImportExportDialog());
    document.getElementById('exportCancelBtn')?.addEventListener('click', () => this.closeImportExportDialog());
  },

  openImportExportDialog() {
    const dialog = document.getElementById('importExportDialog');
    dialog.classList.remove('hidden');
    
    // 更新导出统计
    this.updateExportCounts();
  },

  closeImportExportDialog() {
    const dialog = document.getElementById('importExportDialog');
    dialog.classList.add('hidden');
    
    // 重置状态
    this.resetImportState();
  },

  updateExportCounts() {
    const allCount = document.getElementById('exportAllCount');
    const filteredCount = document.getElementById('exportFilteredCount');
    
    if (allCount && typeof allBookmarks !== 'undefined') {
      allCount.textContent = allBookmarks.length;
    }
    if (filteredCount && typeof filteredBookmarks !== 'undefined') {
      filteredCount.textContent = filteredBookmarks.length;
    }
  },

  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    this.selectedFile = file;
    
    // 更新文件名显示
    const fileNameEl = document.getElementById('importFileName');
    if (fileNameEl) {
      fileNameEl.textContent = file.name;
    }

    // 读取和预览
    try {
      this.showLoading('解析文件中...');
      
      const content = await Utils.readFile(file, 
        file.name.endsWith('.json') ? 'json' : 'text'
      );
      
      const format = ImportExport.detectFileType(file);
      const { bookmarks, tags, errors } = format === 'json'
        ? ImportExport.importFromJSON(content)
        : ImportExport.importFromHTML(content);
      
      this.previewData = { bookmarks, tags, errors };
      
      // 显示预览
      this.showImportPreview(bookmarks, tags, errors);
      
      // 启用导入按钮
      const importBtn = document.getElementById('importStartBtn');
      if (importBtn) {
        importBtn.disabled = bookmarks.length === 0;
      }
      
      this.hideLoading();
    } catch (err) {
      this.hideLoading();
      Utils.showToast(`文件解析失败: ${err.message}`, 'error');
    }
  },

  showImportPreview(bookmarks, tags, errors) {
    const preview = document.getElementById('importPreview');
    if (!preview) return;

    preview.classList.remove('hidden');
    
    // 更新统计
    document.getElementById('importBookmarkCount').textContent = bookmarks.length;
    document.getElementById('importTagCount').textContent = tags.length;
    
    // 显示错误
    const errorsEl = document.getElementById('importErrors');
    if (errors && errors.length > 0) {
      errorsEl.classList.remove('hidden');
      errorsEl.innerHTML = `
        <div class="import-errors-title">发现 ${errors.length} 个问题：</div>
        ${errors.slice(0, 10).map(err => `
          <div class="import-error-item">${Utils.escapeHtml(err)}</div>
        `).join('')}
        ${errors.length > 10 ? `<div class="import-error-item">...还有 ${errors.length - 10} 个问题</div>` : ''}
      `;
    } else {
      errorsEl.classList.add('hidden');
    }
  },

  async handleImport() {
    if (!this.previewData) {
      Utils.showToast('请先选择文件', 'warning');
      return;
    }

    const { bookmarks, tags } = this.previewData;
    const skipDuplicates = document.getElementById('importSkipDuplicates')?.checked ?? true;

    this.showLoading(`正在导入 ${bookmarks.length} 个书签...`);

    try {
      const results = await ImportExport.performImport(bookmarks, {
        skipDuplicates
      });

      this.hideLoading();

      if (results.success > 0) {
        Utils.showToast(
          `成功导入 ${results.success} 个书签${results.skipped > 0 ? `，跳过 ${results.skipped} 个重复项` : ''}`,
          'success',
          5000
        );

        // 刷新列表
        if (typeof loadBookmarks === 'function') await loadBookmarks();
        if (typeof loadTags === 'function') await loadTags();

        this.closeImportExportDialog();
      } else {
        Utils.showToast('导入失败，请检查文件格式', 'error');
      }

      if (results.errors.length > 0) {
        console.error('Import errors:', results.errors);
      }
    } catch (err) {
      this.hideLoading();
      Utils.showToast(`导入失败: ${err.message}`, 'error');
    }
  },

  async handleExport() {
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'json';
    const scope = document.querySelector('input[name="exportScope"]:checked')?.value || 'all';

    const bookmarksToExport = (scope === 'all' && typeof allBookmarks !== 'undefined')
      ? allBookmarks
      : (typeof filteredBookmarks !== 'undefined' ? filteredBookmarks : []);

    if (bookmarksToExport.length === 0) {
      Utils.showToast('没有可导出的书签', 'warning');
      return;
    }

    this.showLoading(`正在导出 ${bookmarksToExport.length} 个书签...`);

    try {
      const tags = await Storage.getTags();
      const result = ImportExport.performExport(bookmarksToExport, tags, format);

      this.hideLoading();

      if (result.success) {
        Utils.showToast(`成功导出 ${bookmarksToExport.length} 个书签`, 'success');
        this.closeImportExportDialog();
      } else {
        Utils.showToast(`导出失败: ${result.error}`, 'error');
      }
    } catch (err) {
      this.hideLoading();
      Utils.showToast(`导出失败: ${err.message}`, 'error');
    }
  },

  resetImportState() {
    this.selectedFile = null;
    this.previewData = null;
    
    const fileInput = document.getElementById('importFileInput');
    if (fileInput) fileInput.value = '';
    
    const fileName = document.getElementById('importFileName');
    if (fileName) fileName.textContent = '选择 JSON 或 HTML 文件';
    
    const preview = document.getElementById('importPreview');
    if (preview) preview.classList.add('hidden');
    
    const importBtn = document.getElementById('importStartBtn');
    if (importBtn) importBtn.disabled = true;
  },

  // ===== 增强搜索 =====

  initEnhancedSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    const debouncedSearch = Utils.debounce((query) => {
      this.performEnhancedSearch(query);
    }, 300);

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      debouncedSearch(query);
    });
  },

  performEnhancedSearch(query) {
    if (typeof currentSearchQuery !== 'undefined') {
      window.currentSearchQuery = query;
    }

    if (typeof applyFilters === 'function') {
      applyFilters();
    }

    // 更新搜索结果信息
    this.updateSearchResultInfo(query);
  },

  updateSearchResultInfo(query) {
    const infoEl = document.getElementById('searchResultInfo');
    if (!infoEl) return;

    if (query && typeof filteredBookmarks !== 'undefined') {
      infoEl.textContent = `找到 ${filteredBookmarks.length} 个结果`;
      infoEl.classList.remove('hidden');
    } else {
      infoEl.classList.add('hidden');
    }
  },

  // ===== 空状态 =====

  initEmptyStates() {
    // 空状态会在渲染函数中自动显示
  },

  showEmptyState(type = 'no-bookmarks') {
    const emptyState = document.getElementById('emptyState');
    const bookmarksList = document.getElementById('bookmarksList');
    
    if (!emptyState || !bookmarksList) return;

    bookmarksList.innerHTML = '';
    emptyState.classList.remove('hidden');

    const messages = {
      'no-bookmarks': {
        icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
        title: '还没有书签',
        subtitle: '使用 Ctrl+D 添加当前页面到书签'
      },
      'no-results': {
        icon: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
        title: '没有找到匹配的书签',
        subtitle: '尝试使用不同的关键词搜索'
      },
      'no-tags': {
        icon: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
        title: '还没有标签',
        subtitle: '点击"管理"按钮开始创建标签'
      }
    };

    const msg = messages[type] || messages['no-bookmarks'];
    
    emptyState.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        ${msg.icon}
      </svg>
      <p>${msg.title}</p>
      <small>${msg.subtitle}</small>
    `;
  },

  hideEmptyState() {
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
      emptyState.classList.add('hidden');
    }
  },

  // ===== 加载指示器 =====

  initLoading() {
    // 已在 HTML 中定义
  },

  showLoading(text = '加载中...') {
    const indicator = document.getElementById('loadingIndicator');
    const textEl = document.getElementById('loadingText');
    
    if (indicator) indicator.classList.remove('hidden');
    if (textEl) textEl.textContent = text;
  },

  hideLoading() {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) indicator.classList.add('hidden');
  }
};

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Extensions;
}
