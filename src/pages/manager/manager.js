// 管理界面主逻辑
// 处理书签的展示、筛选、编辑等功能

let allBookmarks = [];
let filteredBookmarks = [];
let currentColorFilter = '';
let currentTagFilter = '';
let currentView = 'list';
let editingBookmark = null;

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 初始化主题
  await Storage.initTheme();
  
  await loadBookmarks();
  await loadTags();
  initColorFilters();
  initSearch();
  initViewToggle();
  initDialogs();
  
  // 设置按钮
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'settings.html' });
  });
  
  // 添加书签按钮
  document.getElementById('addBookmarkBtn').addEventListener('click', () => {
    chrome.action.openPopup();
  });
  
  // 管理标签按钮
  document.getElementById('manageTagsBtn').addEventListener('click', () => {
    showTagsDialog();
  });
});

// 加载所有书签
async function loadBookmarks() {
  allBookmarks = await Storage.getBookmarks();
  filteredBookmarks = [...allBookmarks];
  renderBookmarks();
}

// 加载标签列表
async function loadTags() {
  const tags = await Storage.getTags();
  const tagsList = document.getElementById('tagsList');
  
  if (tags.length === 0) {
    tagsList.innerHTML = '<div class="empty-tags">暂无标签</div>';
    return;
  }
  
  // 统计每个标签的书签数量
  const tagCounts = {};
  allBookmarks.forEach(bookmark => {
    if (bookmark.tags) {
      bookmark.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });
  
  tagsList.innerHTML = tags.map(tag => `
    <div class="tag-item ${currentTagFilter === tag ? 'active' : ''}" data-tag="${tag}">
      <span class="tag-name">${tag}</span>
      <span class="tag-count">${tagCounts[tag] || 0}</span>
    </div>
  `).join('');
  
  // 绑定点击事件
  tagsList.querySelectorAll('.tag-item').forEach(item => {
    item.addEventListener('click', () => {
      const tag = item.dataset.tag;
      if (currentTagFilter === tag) {
        currentTagFilter = '';
        item.classList.remove('active');
      } else {
        tagsList.querySelectorAll('.tag-item').forEach(i => i.classList.remove('active'));
        currentTagFilter = tag;
        item.classList.add('active');
      }
      applyFilters();
    });
  });
}

// 初始化颜色筛选
function initColorFilters() {
  const colorFilters = document.querySelectorAll('.color-filter');
  
  colorFilters.forEach(filter => {
    filter.addEventListener('click', () => {
      colorFilters.forEach(f => f.classList.remove('selected'));
      filter.classList.add('selected');
      currentColorFilter = filter.dataset.color;
      applyFilters();
    });
  });
}

// 初始化搜索
function initSearch() {
  const searchInput = document.getElementById('searchInput');
  let searchTimeout;
  
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      applyFilters(e.target.value.trim());
    }, 300);
  });
}

// 应用筛选
function applyFilters(searchQuery = '') {
  filteredBookmarks = allBookmarks.filter(bookmark => {
    // 颜色筛选
    if (currentColorFilter && bookmark.color !== currentColorFilter) {
      return false;
    }
    
    // 标签筛选
    if (currentTagFilter && (!bookmark.tags || !bookmark.tags.includes(currentTagFilter))) {
      return false;
    }
    
    // 搜索筛选
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchTitle = bookmark.title?.toLowerCase().includes(query);
      const matchUrl = bookmark.url?.toLowerCase().includes(query);
      const matchDomain = bookmark.domain?.toLowerCase().includes(query);
      const matchTags = bookmark.tags?.some(tag => tag.toLowerCase().includes(query));
      
      if (!matchTitle && !matchUrl && !matchDomain && !matchTags) {
        return false;
      }
    }
    
    return true;
  });
  
  renderBookmarks();
}

// 渲染书签列表
function renderBookmarks() {
  const bookmarksList = document.getElementById('bookmarksList');
  const emptyState = document.getElementById('emptyState');
  const countEl = document.getElementById('bookmarkCount');
  
  countEl.textContent = filteredBookmarks.length;
  
  if (filteredBookmarks.length === 0) {
    bookmarksList.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  
  if (currentView === 'list') {
    renderListView();
  } else {
    renderGridView();
  }
}

// 列表视图
function renderListView() {
  const bookmarksList = document.getElementById('bookmarksList');
  bookmarksList.className = 'bookmarks-list';
  
  bookmarksList.innerHTML = filteredBookmarks.map(bookmark => `
    <div class="bookmark-item" data-id="${bookmark.id}">
      <div class="bookmark-main">
        ${bookmark.color ? `<div class="bookmark-color" style="background-color: ${getColorHex(bookmark.color)};"></div>` : ''}
        <img src="${bookmark.favicon}" alt="" class="bookmark-favicon" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text y=%2220%22 font-size=%2220%22>🔖</text></svg>'">
        <div class="bookmark-info">
          <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
          <div class="bookmark-domain">${escapeHtml(bookmark.domain)}</div>
        </div>
      </div>
      <div class="bookmark-tags">
        ${bookmark.tags ? bookmark.tags.map(tag => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('') : ''}
      </div>
      <div class="bookmark-actions">
        <button class="icon-btn bookmark-open" title="打开">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </button>
        <button class="icon-btn bookmark-edit" title="编辑">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="icon-btn bookmark-delete" title="删除">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
  
  bindBookmarkEvents();
}

// 网格视图
function renderGridView() {
  const bookmarksList = document.getElementById('bookmarksList');
  bookmarksList.className = 'bookmarks-grid';
  
  bookmarksList.innerHTML = filteredBookmarks.map(bookmark => `
    <div class="bookmark-card" data-id="${bookmark.id}">
      ${bookmark.color ? `<div class="bookmark-color" style="background-color: ${getColorHex(bookmark.color)};"></div>` : ''}
      <div class="bookmark-card-header">
        <img src="${bookmark.favicon}" alt="" class="bookmark-favicon" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text y=%2220%22 font-size=%2220%22>🔖</text></svg>'">
        <div class="bookmark-actions">
          <button class="icon-btn bookmark-open" title="打开">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
          <button class="icon-btn bookmark-edit" title="编辑">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="icon-btn bookmark-delete" title="删除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
      <div class="bookmark-domain">${escapeHtml(bookmark.domain)}</div>
      <div class="bookmark-tags">
        ${bookmark.tags ? bookmark.tags.map(tag => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('') : ''}
      </div>
    </div>
  `).join('');
  
  bindBookmarkEvents();
}

// 绑定书签事件
function bindBookmarkEvents() {
  // 打开链接
  document.querySelectorAll('.bookmark-open').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.closest('[data-id]').dataset.id;
      const bookmark = allBookmarks.find(b => b.id === id);
      if (bookmark) {
        chrome.tabs.create({ url: bookmark.url });
      }
    });
  });
  
  // 编辑
  document.querySelectorAll('.bookmark-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.closest('[data-id]').dataset.id;
      const bookmark = allBookmarks.find(b => b.id === id);
      if (bookmark) {
        showEditDialog(bookmark);
      }
    });
  });
  
  // 删除
  document.querySelectorAll('.bookmark-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('确定要删除这个书签吗？')) {
        const id = btn.closest('[data-id]').dataset.id;
        await Storage.deleteBookmark(id);
        await loadBookmarks();
        await loadTags();
      }
    });
  });
}

// 初始化视图切换
function initViewToggle() {
  const viewBtns = document.querySelectorAll('.view-btn');
  
  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      renderBookmarks();
    });
  });
}

// 初始化对话框
function initDialogs() {
  // 编辑对话框
  const editDialog = document.getElementById('editDialog');
  const editForm = document.getElementById('editForm');
  
  document.getElementById('closeDialog').addEventListener('click', () => {
    editDialog.classList.add('hidden');
  });
  
  document.getElementById('cancelEdit').addEventListener('click', () => {
    editDialog.classList.add('hidden');
  });
  
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveEdit();
  });
  
  // 标签管理对话框
  const tagsDialog = document.getElementById('tagsDialog');
  
  document.getElementById('closeTagsDialog').addEventListener('click', () => {
    tagsDialog.classList.add('hidden');
  });
}

// 显示编辑对话框
function showEditDialog(bookmark) {
  editingBookmark = bookmark;
  const dialog = document.getElementById('editDialog');
  
  document.getElementById('editTitle').value = bookmark.title;
  document.getElementById('editUrl').value = bookmark.url;
  
  // 渲染颜色选择器
  const colorPicker = document.getElementById('editColorPicker');
  const colors = ['', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
  colorPicker.innerHTML = colors.map(color => `
    <div class="color-option ${bookmark.color === color ? 'selected' : ''}" data-color="${color}">
      <div class="color-dot ${color ? '' : 'no-color'}" ${color ? `style="background-color: ${getColorHex(color)};"` : ''}></div>
    </div>
  `).join('');
  
  // 绑定颜色选择
  colorPicker.querySelectorAll('.color-option').forEach(option => {
    option.addEventListener('click', () => {
      colorPicker.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
    });
  });
  
  // 渲染标签
  const editTags = document.getElementById('editTags');
  editTags.innerHTML = (bookmark.tags || []).map(tag => `
    <div class="tag-chip">
      <span>${escapeHtml(tag)}</span>
      <button type="button" class="tag-remove" data-tag="${tag}">×</button>
    </div>
  `).join('');
  
  // 绑定标签删除
  editTags.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.tag-chip').remove();
    });
  });
  
  dialog.classList.remove('hidden');
}

// 保存编辑
async function saveEdit() {
  const title = document.getElementById('editTitle').value.trim();
  const url = document.getElementById('editUrl').value.trim();
  const selectedColor = document.querySelector('#editColorPicker .color-option.selected')?.dataset.color || '';
  const tags = Array.from(document.querySelectorAll('#editTags .tag-chip span')).map(span => span.textContent);
  
  editingBookmark.title = title;
  editingBookmark.url = url;
  editingBookmark.domain = Storage.getDomain(url);
  editingBookmark.favicon = Storage.getFaviconUrl(url);
  editingBookmark.color = selectedColor;
  editingBookmark.tags = tags;
  
  await Storage.saveBookmark(editingBookmark);
  await loadBookmarks();
  await loadTags();
  
  document.getElementById('editDialog').classList.add('hidden');
}

// 显示标签管理对话框
async function showTagsDialog() {
  const dialog = document.getElementById('tagsDialog');
  const list = document.getElementById('tagsManageList');
  const tags = await Storage.getTags();
  
  list.innerHTML = tags.map(tag => `
    <div class="tag-manage-item">
      <span class="tag-name">${escapeHtml(tag)}</span>
      <div class="tag-actions">
        <button class="icon-btn tag-rename" data-tag="${tag}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="icon-btn tag-delete" data-tag="${tag}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
  
  // 绑定重命名
  list.querySelectorAll('.tag-rename').forEach(btn => {
    btn.addEventListener('click', async () => {
      const oldName = btn.dataset.tag;
      const newName = prompt('输入新的标签名:', oldName);
      if (newName && newName !== oldName) {
        await Storage.renameTag(oldName, newName);
        await loadTags();
        showTagsDialog();
      }
    });
  });
  
  // 绑定删除
  list.querySelectorAll('.tag-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm(`确定要删除标签"${btn.dataset.tag}"吗？`)) {
        await Storage.deleteTag(btn.dataset.tag);
        await loadTags();
        await loadBookmarks();
        showTagsDialog();
      }
    });
  });
  
  dialog.classList.remove('hidden');
}

// 工具函数：获取颜色十六进制值
function getColorHex(color) {
  const colors = {
    red: '#ef4444',
    orange: '#f97316',
    yellow: '#eab308',
    green: '#22c55e',
    cyan: '#06b6d4',
    blue: '#3b82f6',
    purple: '#a855f7'
  };
  return colors[color] || '';
}

// 工具函数：HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
