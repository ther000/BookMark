// 侧边栏主逻辑 - 使用 Chrome 书签 API + 拖拽交互

const COLOR_ORDER = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];

let allBookmarks = [];
let filteredBookmarks = [];
let currentColorFilter = '';
let currentTagFilters = [];
let currentSearchQuery = '';
let draggedTag = null;
let draggedBookmark = null;
let currentColorPickerBookmark = null;
let currentSortKey = 'custom';
let currentSortOrder = 'asc';
let tagOrder = [];
let bookmarkOrder = {};
let tagManagerEditingTag = null;
let tagManagerMessageTimer = null;
let isAIBulkClassifying = false;
let currentEditingBookmarkId = null;
let currentEditingTags = [];
let currentAISuggestedTags = [];
let currentAIBookmarkId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 迁移数据到 local storage（一次性）
  await Storage.migrateMetadataToLocal();
  
  // 初始化主题
  await Storage.initTheme();
  
  await loadSettings();
  updateSortButtonState();
  await loadBookmarks();
  await loadTags();
  initColorFilters();
  initSearch();
  initTagDragAndDrop();
  initBookmarkDragAndDrop();
  initSortButtons();
  initDialogs();
  initTagsCollapse();

  // 初始化扩展功能
  if (typeof Extensions !== 'undefined') {
    Extensions.init();
  }

  const settingsBtn = document.getElementById('settingsBtn');
  settingsBtn?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  const themeToggleBtn = document.getElementById('themeToggleBtn');
  themeToggleBtn?.addEventListener('click', async () => {
    await toggleTheme();
    updateThemeButtonTooltip();
  });

  // 初始化主题按钮提示
  updateThemeButtonTooltip();

  const manageTagsBtn = document.getElementById('manageTagsBtn');
  manageTagsBtn?.addEventListener('click', () => {
    openTagManager();
  });

  const aiClassifyBtn = document.getElementById('aiClassifyBtn');
  aiClassifyBtn?.addEventListener('click', async () => {
    await runAIClassification();
  });

  chrome.bookmarks.onCreated.addListener(reloadBookmarksAndTags);
  chrome.bookmarks.onRemoved.addListener(reloadBookmarksAndTags);
  chrome.bookmarks.onChanged.addListener(reloadBookmarksAndTags);
  chrome.bookmarks.onMoved.addListener(reloadBookmarksAndTags);
});

async function reloadBookmarksAndTags() {
  await loadBookmarks();
  await loadTags();
  await refreshTagManagerIfOpen();
}

// 切换主题
async function toggleTheme() {
  const currentTheme = await Storage.getTheme();
  let newTheme;
  
  if (currentTheme === 'auto') {
    // 如果当前是自动模式，切换到深色或浅色
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    newTheme = prefersDark ? 'light' : 'dark';
  } else if (currentTheme === 'light') {
    newTheme = 'dark';
  } else {
    newTheme = 'light';
  }
  
  await Storage.saveTheme(newTheme);
  Storage.applyTheme(newTheme);
}

// 更新主题按钮提示文本
async function updateThemeButtonTooltip() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (!themeToggleBtn) return;
  
  const currentTheme = await Storage.getTheme();
  const currentActualTheme = document.documentElement.getAttribute('data-theme');
  
  if (currentTheme === 'auto') {
    themeToggleBtn.title = `切换主题（当前：自动 - ${currentActualTheme === 'dark' ? '深色' : '浅色'}）`;
  } else if (currentTheme === 'light') {
    themeToggleBtn.title = '切换到深色模式';
  } else {
    themeToggleBtn.title = '切换到浅色模式';
  }
}

async function loadSettings() {
  const result = await chrome.storage.local.get(['sortBy', 'tagOrder', 'bookmarkOrder']);
  const needsMigration = applySortSetting(result.sortBy);
  tagOrder = Array.isArray(result.tagOrder) ? [...result.tagOrder] : [];
  bookmarkOrder = result.bookmarkOrder && typeof result.bookmarkOrder === 'object'
    ? { ...result.bookmarkOrder }
    : {};
  if (needsMigration) {
    await saveSettings();
  }
}

function applySortSetting(savedSort) {
  if (!savedSort) {
    currentSortKey = 'custom';
    currentSortOrder = 'asc';
    return false;
  }

  if (typeof savedSort === 'object') {
    currentSortKey = savedSort.key || 'custom';
    currentSortOrder = savedSort.order === 'desc' ? 'desc' : 'asc';
    return false;
  }

  if (typeof savedSort === 'string') {
    const normalized = savedSort.replace(/[\s|]+/g, ':');
    const parts = normalized.split(/[:\-]/);
    currentSortKey = parts[0] || 'custom';
    currentSortOrder = parts[1] === 'desc' ? 'desc' : 'asc';
    return true;
  }

  return false;
}

async function saveSettings() {
  await chrome.storage.local.set({
    sortBy: { key: currentSortKey, order: currentSortOrder },
    tagOrder,
    bookmarkOrder
  });
}

async function loadBookmarks() {
  const bookmarks = await Storage.getBookmarksWithMetadata();
  allBookmarks = bookmarks.map(bookmark => ({
    ...bookmark,
    title: bookmark.title || bookmark.url || '',
    url: bookmark.url || '',
    domain: bookmark.domain || Storage.getDomain(bookmark.url || ''),
    tags: Array.isArray(bookmark.tags) ? [...bookmark.tags] : [],
    color: bookmark.color || ''
  }));

  const orderChanged = ensureBookmarkOrderConsistency(allBookmarks);
  if (orderChanged && currentSortKey === 'custom') {
    await saveSettings();
  }

  applyFilters();
}

function ensureBookmarkOrderConsistency(bookmarks) {
  let changed = false;
  const existingIds = new Set(bookmarks.map(bookmark => bookmark.id));

  Object.keys(bookmarkOrder).forEach(id => {
    if (!existingIds.has(id)) {
      delete bookmarkOrder[id];
      changed = true;
    }
  });

  bookmarks.forEach((bookmark, index) => {
    if (typeof bookmarkOrder[bookmark.id] !== 'number') {
      bookmarkOrder[bookmark.id] = index;
      changed = true;
    }
  });

  return changed;
}

function applyFilters() {
  const search = currentSearchQuery.toLowerCase();

  filteredBookmarks = allBookmarks.filter(bookmark => {
    if (currentColorFilter && bookmark.color !== currentColorFilter) {
      return false;
    }

    if (currentTagFilters.length > 0) {
      const wantsUntagged = currentTagFilters.includes('__untagged__');
      const requiredTags = currentTagFilters.filter(tag => tag !== '__untagged__');
      const bookmarkTags = bookmark.tags || [];
      
      // 使用 OR 逻辑：书签包含任一选中的标签即可
      const hasAnyTag = requiredTags.length > 0 && requiredTags.some(tag => bookmarkTags.includes(tag));
      const isUntagged = bookmarkTags.length === 0;

      if (!((requiredTags.length > 0 && hasAnyTag) || (wantsUntagged && isUntagged))) {
        return false;
      }
    }

    if (search) {
      const matchTitle = bookmark.title.toLowerCase().includes(search);
      const matchUrl = bookmark.url.toLowerCase().includes(search);
      const matchDomain = bookmark.domain.toLowerCase().includes(search);
      const matchTags = (bookmark.tags || []).some(tag =>
        tag.toLowerCase().includes(search)
      );

      if (!matchTitle && !matchUrl && !matchDomain && !matchTags) {
        return false;
      }
    }

    return true;
  });

  filteredBookmarks = sortBookmarks(filteredBookmarks);
  renderBookmarks();
}
function sortBookmarks(list) {
  const sorted = [...list];

  switch (currentSortKey) {
    case 'name':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'time':
      sorted.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
      break;
    case 'domain':
      sorted.sort((a, b) => a.domain.localeCompare(b.domain));
      break;
    case 'color':
      sorted.sort((a, b) => getColorRank(a.color) - getColorRank(b.color));
      break;
    case 'custom':
    default:
      sorted.sort((a, b) => {
        const rankA = typeof bookmarkOrder[a.id] === 'number' ? bookmarkOrder[a.id] : Number.MAX_SAFE_INTEGER;
        const rankB = typeof bookmarkOrder[b.id] === 'number' ? bookmarkOrder[b.id] : Number.MAX_SAFE_INTEGER;
        return rankA - rankB;
      });
      return sorted;
  }

  if (currentSortOrder === 'desc') {
    sorted.reverse();
  }

  return sorted;
}

function renderBookmarks() {
  const listEl = document.getElementById('bookmarksList');
  const emptyState = document.getElementById('emptyState');
  const countEl = document.getElementById('bookmarkCount');

  countEl.textContent = filteredBookmarks.length.toString();

  if (filteredBookmarks.length === 0) {
    listEl.innerHTML = '';
    emptyState?.classList.remove('hidden');
    return;
  }

  emptyState?.classList.add('hidden');

  listEl.innerHTML = filteredBookmarks.map(bookmark => renderBookmarkItem(bookmark)).join('');
  bindBookmarkEvents();
}

function renderBookmarkItem(bookmark) {
  const bookmarkId = escapeHtml(bookmark.id);
  const favicon = escapeHtml(bookmark.favicon || '');
  const displayDomain = bookmark.domain || bookmark.url || '';
  const secondaryText = escapeHtml(displayDomain);
  const urlTitle = escapeHtml(bookmark.url || '');
  const colorClass = bookmark.color ? 'has-color' : '';
  const colorStyle = bookmark.color ? ` style="background-color: ${getColorHex(bookmark.color)};"` : '';
  const tagsHTML = (bookmark.tags && bookmark.tags.length > 0)
    ? bookmark.tags.map(tag => `<span class="tag-mini" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`).join('')
    : '';
  const draggableAttr = currentSortKey === 'custom' ? ' draggable="true"' : '';

  return `
    <div class="bookmark-item" data-id="${bookmarkId}"${draggableAttr}>
      <div class="bookmark-color-indicator ${colorClass}"${colorStyle}></div>
  <img src="${favicon}" alt="" class="bookmark-favicon" onerror="this.src='data:image/svg+xml,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;0 0 24 24&quot;><text y=&quot;20&quot; font-size=&quot;20&quot;>B</text></svg>'">
      <div class="bookmark-info">
        <div class="bookmark-title">${escapeHtml(bookmark.title || '未命名书签')}</div>
        <div class="bookmark-url" title="${urlTitle}">${secondaryText}</div>
        <div class="bookmark-tags">${tagsHTML}</div>
      </div>
      <div class="bookmark-actions">
        <button class="icon-btn bookmark-color" title="选择颜色">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
          </svg>
        </button>
        <button class="icon-btn bookmark-edit" title="编辑标签">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="icon-btn bookmark-ai" title="AI 标签建议">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v12M6 12h12"/>
          </svg>
        </button>
        <button class="icon-btn bookmark-delete" title="删除">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function bindBookmarkEvents() {
  const items = document.querySelectorAll('.bookmark-item');

  items.forEach(item => {
    const bookmarkId = item.dataset.id;
    const bookmark = allBookmarks.find(b => b.id === bookmarkId);

    if (!bookmark) {
      return;
    }

    item.addEventListener('dragover', handleBookmarkDragOver);
    item.addEventListener('dragleave', handleBookmarkDragLeave);
    item.addEventListener('drop', handleBookmarkDrop);

    if (currentSortKey === 'custom') {
      item.addEventListener('dragstart', handleBookmarkDragStart);
      item.addEventListener('dragend', handleBookmarkDragEnd);
      item.addEventListener('dragover', handleBookmarkItemDragOver);
      item.addEventListener('drop', handleBookmarkItemDrop);
    } else {
      item.removeAttribute('draggable');
    }

    const colorBtn = item.querySelector('.bookmark-color');
    colorBtn?.addEventListener('click', event => {
      event.stopPropagation();
      showColorPicker(colorBtn, bookmarkId);
    });

    const editBtn = item.querySelector('.bookmark-edit');
    editBtn?.addEventListener('click', async event => {
      event.stopPropagation();
      await editBookmarkTags(bookmarkId);
    });

    const aiBtn = item.querySelector('.bookmark-ai');
    aiBtn?.addEventListener('click', event => {
      event.stopPropagation();
      showAISuggestions(bookmarkId);
    });

    const deleteBtn = item.querySelector('.bookmark-delete');
    deleteBtn?.addEventListener('click', async event => {
      event.stopPropagation();
      await deleteBookmark(bookmarkId);
    });

    item.querySelectorAll('.bookmark-tags .tag-mini').forEach(tagChip => {
      tagChip.addEventListener('click', event => {
        event.stopPropagation();
        const tag = tagChip.dataset.tag;
        if (!tag) {
          return;
        }
        // 右键或 Ctrl+点击删除标签，否则切换过滤
        if (event.ctrlKey || event.metaKey || event.button === 2) {
          event.preventDefault();
          removeTagFromBookmarkInline(bookmarkId, tag);
        } else {
          toggleTagFilterFromBookmark(tag);
        }
      });
      
      // 阻止右键菜单
      tagChip.addEventListener('contextmenu', event => {
        event.preventDefault();
        const tag = tagChip.dataset.tag;
        if (tag) {
          removeTagFromBookmarkInline(bookmarkId, tag);
        }
      });
    });

    item.addEventListener('click', () => {
      if (bookmark.url) {
        chrome.tabs.create({ url: bookmark.url });
      }
    });
  });
}

async function editBookmarkTags(bookmarkId) {
  const bookmark = allBookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) {
    console.error('Bookmark not found:', bookmarkId);
    return;
  }

  currentEditingBookmarkId = bookmarkId;
  // 确保 tags 始终是一个数组
  currentEditingTags = Array.isArray(bookmark.tags) ? [...bookmark.tags] : [];

  // 显示对话框
  const dialog = document.getElementById('tagEditDialog');
  const favicon = document.getElementById('tagEditFavicon');
  const titleInput = document.getElementById('tagEditTitleInput');
  const urlEl = document.getElementById('tagEditUrl');
  const currentTagsEl = document.getElementById('tagEditCurrent');
  const suggestionsEl = document.getElementById('tagEditSuggestions');
  const input = document.getElementById('tagEditInput');

  if (!dialog || !titleInput || !urlEl) {
    console.error('Dialog elements not found');
    return;
  }

  favicon.src = bookmark.favicon || '';
  titleInput.value = bookmark.title || '';
  urlEl.textContent = bookmark.url || '';

  renderCurrentTags();
  await renderTagSuggestions();

  dialog.classList.remove('hidden');
  input.value = '';
  titleInput.focus();
  titleInput.select();
}

function renderCurrentTags() {
  const currentTagsEl = document.getElementById('tagEditCurrent');
  if (!currentTagsEl) return;

  // 即使没有标签也要显示容器，以便用户知道可以添加标签
  if (!Array.isArray(currentEditingTags) || currentEditingTags.length === 0) {
    currentTagsEl.innerHTML = '<div style="color: var(--text-secondary); font-size: 12px; padding: 8px;">暂无标签，从下方选择或输入新标签</div>';
    return;
  }

  currentTagsEl.innerHTML = currentEditingTags.map(tag => `
    <div class="tag-edit-chip">
      <span>${escapeHtml(tag)}</span>
      <button class="tag-edit-chip-remove" data-tag="${escapeHtml(tag)}" title="删除">×</button>
    </div>
  `).join('');

  currentTagsEl.querySelectorAll('.tag-edit-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      currentEditingTags = currentEditingTags.filter(t => t !== tag);
      renderCurrentTags();
      renderTagSuggestions(); // 重新渲染建议，因为可能有新的可用标签
    });
  });
}

async function renderTagSuggestions() {
  const suggestionsEl = document.getElementById('tagEditSuggestions');
  if (!suggestionsEl) return;

  const allTags = await Storage.getTags();
  const availableTags = allTags.filter(tag => !currentEditingTags.includes(tag));

  if (availableTags.length === 0) {
    suggestionsEl.innerHTML = '<span style="color: #9ca3af; font-size: 11px;">暂无可用标签</span>';
    return;
  }

  suggestionsEl.innerHTML = availableTags.slice(0, 12).map(tag => `
    <button class="tag-suggestion-chip" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
  `).join('');

  suggestionsEl.querySelectorAll('.tag-suggestion-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (!currentEditingTags.includes(tag)) {
        currentEditingTags.push(tag);
        renderCurrentTags();
        renderTagSuggestions();
      }
    });
  });
}

async function saveTagEdit() {
  if (!currentEditingBookmarkId) return;

  const input = document.getElementById('tagEditInput');
  const titleInput = document.getElementById('tagEditTitleInput');
  const inputTags = normalizeTagNames(input.value);
  
  // 合并输入的新标签
  inputTags.forEach(tag => {
    if (!currentEditingTags.includes(tag)) {
      currentEditingTags.push(tag);
    }
  });

  // 保存标签
  const meta = await Storage.getBookmarkMeta(currentEditingBookmarkId);
  meta.tags = currentEditingTags;
  await Storage.saveBookmarkMeta(currentEditingBookmarkId, meta);
  
  if (currentEditingTags.length > 0) {
    await Storage.saveTagsBulk(currentEditingTags);
  }

  // 保存书签标题
  const newTitle = titleInput.value.trim();
  if (newTitle) {
    try {
      await chrome.bookmarks.update(currentEditingBookmarkId, { title: newTitle });
    } catch (error) {
      console.error('Failed to update bookmark title:', error);
    }
  }

  closeTagEditDialog();
  await loadBookmarks();
  await loadTags();
  await refreshTagManagerIfOpen();
}

function closeTagEditDialog() {
  const dialog = document.getElementById('tagEditDialog');
  dialog?.classList.add('hidden');
  currentEditingBookmarkId = null;
  currentEditingTags = [];
}

async function removeTagFromBookmarkInline(bookmarkId, tag) {
  await Storage.removeTagFromBookmark(bookmarkId, tag);
  await loadBookmarks();
  await loadTags();
  await refreshTagManagerIfOpen();
}

async function deleteBookmark(bookmarkId) {
  const bookmark = allBookmarks.find(b => b.id === bookmarkId);
  const name = bookmark ? (bookmark.title || bookmark.url || '该书签') : '该书签';
  if (!confirm(`确定要删除“${name}”吗？`)) {
    return;
  }

  await Storage.deleteBookmark(bookmarkId);
  if (bookmarkOrder[bookmarkId] !== undefined) {
    delete bookmarkOrder[bookmarkId];
    await saveSettings();
  }

  await loadBookmarks();
  await loadTags();
  await refreshTagManagerIfOpen();
}
function toggleTagFilterFromBookmark(tag) {
  if (currentTagFilters.includes(tag)) {
    currentTagFilters = currentTagFilters.filter(existing => existing !== tag);
  } else {
    currentTagFilters = [...currentTagFilters, tag];
  }

  // 标签筛选激活时，清除颜色筛选（互斥）
  if (currentTagFilters.length > 0) {
    currentColorFilter = '';
    updateColorFilterState();
  }

  // 更新颜色过滤器按钮状态
  const tagButtons = document.querySelectorAll('.tag-filter[data-tag]');
  tagButtons.forEach(button => {
    const tagValue = button.dataset.tag;
    if (!tagValue) {
      return;
    }
    if (currentTagFilters.includes(tagValue)) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });

  // 更新标签栏中的标签芯片状态
  updateTagChipState();

  applyFilters();
}

function showColorPicker(targetEl, bookmarkId) {
  closeColorPicker();
  currentColorPickerBookmark = bookmarkId;

  const picker = document.getElementById('colorPicker');
  if (!picker) {
    return;
  }

  // 使用网格布局的色块
  picker.innerHTML = COLOR_ORDER.map(colorKey => {
    const hex = getColorHex(colorKey);
    const label = getColorLabel(colorKey);
    return `<button class="color-option" data-color="${colorKey}" title="${label}" style="--color:${hex}"><span>${label}</span></button>`;
  }).join('');

  // 添加"无颜色"选项
  const noneBtn = document.createElement('button');
  noneBtn.className = 'color-option color-option-none';
  noneBtn.dataset.color = '';
  noneBtn.title = '无颜色';
  picker.appendChild(noneBtn);

  picker.classList.remove('hidden');

  // 获取元素和视口边界
  const rect = targetEl.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  
  // 先设置初始位置以获取picker尺寸
  picker.style.top = `${rect.bottom + window.scrollY + 4}px`;
  picker.style.left = `${rect.left + window.scrollX}px`;
  
  // 获取picker实际尺寸
  const pickerRect = picker.getBoundingClientRect();
  const pickerHeight = pickerRect.height;
  const pickerWidth = pickerRect.width;
  
  // 垂直方向：检查是否超出底部边界
  let top = rect.bottom + 4;
  if (rect.bottom + pickerHeight + 10 > viewportHeight) {
    // 如果超出底部，则显示在上方
    top = rect.top - pickerHeight - 4;
    // 如果上方也放不下，则靠底部对齐
    if (top < 10) {
      top = viewportHeight - pickerHeight - 10;
    }
  }
  
  // 水平方向：检查是否超出右边界
  let left = rect.left;
  if (rect.left + pickerWidth + 10 > viewportWidth) {
    left = viewportWidth - pickerWidth - 10;
  }
  // 检查是否超出左边界
  if (left < 10) {
    left = 10;
  }
  
  picker.style.top = `${top + window.scrollY}px`;
  picker.style.left = `${left + window.scrollX}px`;

  picker.querySelectorAll('.color-option').forEach(option => {
    option.addEventListener('click', handleColorOptionSelect);
  });

  // 阻止点击picker时关闭
  picker.addEventListener('click', event => {
    event.stopPropagation();
  });

  document.addEventListener('mousedown', handleColorPickerOutsideClick, { once: true, capture: true });
}

function closeColorPicker() {
  const picker = document.getElementById('colorPicker');
  if (picker) {
    picker.classList.add('hidden');
    picker.innerHTML = '';
  }
  currentColorPickerBookmark = null;
}

async function handleColorOptionSelect(event) {
  const picker = document.getElementById('colorPicker');
  const button = event.currentTarget;
  const color = button.dataset.color || '';

  if (!picker || !currentColorPickerBookmark) {
    return;
  }

  const bookmark = allBookmarks.find(b => b.id === currentColorPickerBookmark);
  if (!bookmark) {
    closeColorPicker();
    return;
  }

  const meta = await Storage.getBookmarkMeta(bookmark.id);
  meta.color = color;
  await Storage.saveBookmarkMeta(bookmark.id, meta);

  closeColorPicker();
  await loadBookmarks();
}

function handleColorPickerOutsideClick(event) {
  const picker = document.getElementById('colorPicker');
  if (!picker) {
    return;
  }

  if (picker.contains(event.target)) {
    document.addEventListener('mousedown', handleColorPickerOutsideClick, { once: true, capture: true });
    return;
  }

  closeColorPicker();
}

function handleBookmarkDragStart(event) {
  const id = event.currentTarget.dataset.id;
  if (!id) {
    return;
  }
  draggedBookmark = id;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', id);
  event.currentTarget.classList.add('dragging');
}

function handleBookmarkDragEnd(event) {
  event.currentTarget.classList.remove('dragging');
  draggedBookmark = null;
}

function handleBookmarkDragOver(event) {
  if (!draggedTag && !draggedBookmark) {
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = draggedTag ? 'copy' : 'move';
  event.currentTarget.classList.add('drag-over');
}

function handleBookmarkDragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}

async function handleBookmarkDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  if (!draggedTag) {
    return;
  }

  const bookmarkId = event.currentTarget.dataset.id;
  if (!bookmarkId) {
    return;
  }

  const tag = draggedTag;
  draggedTag = null;

  await Storage.addTagToBookmark(bookmarkId, tag);
  await loadBookmarks();
  await loadTags();
}

function handleBookmarkItemDragOver(event) {
  event.preventDefault();

  const target = event.currentTarget;
  const dragging = document.querySelector('.bookmark-item.dragging');
  if (!dragging || target === dragging) {
    return;
  }

  const bounding = target.getBoundingClientRect();
  const offset = event.clientY - bounding.top;
  const half = bounding.height / 2;

  if (offset > half) {
    target.classList.add('drag-over-bottom');
    target.classList.remove('drag-over-top');
  } else {
    target.classList.add('drag-over-top');
    target.classList.remove('drag-over-bottom');
  }
}

function handleBookmarkItemDrop(event) {
  event.preventDefault();
  const target = event.currentTarget;
  const targetId = target.dataset.id;

  document.querySelectorAll('.bookmark-item').forEach(item => {
    item.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  if (!draggedBookmark || !targetId || draggedBookmark === targetId) {
    return;
  }

  const draggingIndex = filteredBookmarks.findIndex(bookmark => bookmark.id === draggedBookmark);
  const targetIndex = filteredBookmarks.findIndex(bookmark => bookmark.id === targetId);
  if (draggingIndex < 0 || targetIndex < 0) {
    return;
  }

  const moved = [...filteredBookmarks];
  const [draggedItem] = moved.splice(draggingIndex, 1);
  moved.splice(targetIndex, 0, draggedItem);

  filteredBookmarks = moved;

  filteredBookmarks.forEach((bookmark, index) => {
    bookmarkOrder[bookmark.id] = index;
  });

  renderBookmarks();
  saveSettings();
}
function initColorFilters() {
  const colorButtons = document.querySelectorAll('.color-filter');
  colorButtons.forEach(button => {
    button.addEventListener('click', () => {
      const color = button.dataset.color || '';
      if (currentColorFilter === color) {
        currentColorFilter = '';
      } else {
        currentColorFilter = color;
        // 颜色筛选激活时，清除标签筛选（互斥）
        currentTagFilters = [];
        updateTagChipState();
      }
      updateColorFilterState();
      applyFilters();
    });
  });

  updateColorFilterState();
}

function updateColorFilterState() {
  const colorButtons = document.querySelectorAll('.color-filter');
  colorButtons.forEach(button => {
    const color = button.dataset.color || '';
    if (currentColorFilter === color) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });
}

function initSearch() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) {
    return;
  }

  let debounceTimer = null;
  searchInput.addEventListener('input', () => {
    const value = searchInput.value.trim();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearchQuery = value;
      applyFilters();
    }, 120);
  });
}

function initTagDragAndDrop() {
  const list = document.getElementById('tagsList');
  if (!list) {
    return;
  }

  list.addEventListener('dragstart', event => {
    const target = event.target.closest('.tag-chip');
    if (!target) {
      return;
    }
    const tagName = target.dataset.tag || null;
    draggedTag = tagName && !tagName.startsWith('__') ? tagName : null;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', tagName || '');
    target.classList.add('dragging');
  });

  list.addEventListener('dragend', event => {
    const target = event.target.closest('.tag-chip');
    target?.classList.remove('dragging');
    draggedTag = null;
  });

  list.addEventListener('dragover', event => {
    if (!draggedTag) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
}

function initBookmarkDragAndDrop() {
  const list = document.getElementById('bookmarksList');
  if (!list) {
    return;
  }

  list.addEventListener('dragover', event => {
    event.preventDefault();
  });

  list.addEventListener('drop', event => {
    event.preventDefault();
  });
}

function initSortButtons() {
  const buttons = document.querySelectorAll('.sort-btn');
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const sortKey = button.dataset.sort || 'custom';
      const defaultOrder = button.dataset.defaultOrder === 'desc' ? 'desc' : 'asc';

      if (currentSortKey === sortKey) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        currentSortKey = sortKey;
        currentSortOrder = defaultOrder;
      }

      updateSortButtonState();
      applyFilters();
      saveSettings();
    });
  });
}

function updateSortButtonState() {
  const buttons = document.querySelectorAll('.sort-btn');
  buttons.forEach(button => {
    const sortKey = button.dataset.sort;
    if (sortKey === currentSortKey) {
      button.classList.add('active');
      button.setAttribute('data-order', currentSortOrder);
    } else {
      button.classList.remove('active');
      button.removeAttribute('data-order');
    }
  });

  const list = document.getElementById('bookmarksList');
  if (list) {
    if (currentSortKey === 'custom') {
      list.classList.add('custom-sorting');
    } else {
      list.classList.remove('custom-sorting');
    }
  }
}

function initDialogs() {
  const aiDialog = document.getElementById('aiDialog');
  const closeAiBtn = document.getElementById('closeAIDialog');
  const acceptAllBtn = document.getElementById('aiAcceptAll');
  const retryBtn = document.getElementById('aiRetry');
  
  closeAiBtn?.addEventListener('click', () => {
    hideAIDialog();
  });

  aiDialog?.addEventListener('click', event => {
    if (event.target === aiDialog) {
      hideAIDialog();
    }
  });

  // 全部接受按钮
  acceptAllBtn?.addEventListener('click', async () => {
    const suggestions = document.querySelectorAll('.ai-suggestion:not(:disabled)');
    if (suggestions.length === 0 || !currentAIBookmarkId) return;

    acceptAllBtn.disabled = true;
    acceptAllBtn.textContent = '添加中...';

    for (const button of suggestions) {
      const tag = button.dataset.tag;
      if (tag) {
        button.disabled = true;
        await Storage.addTagToBookmark(currentAIBookmarkId, tag);
      }
    }

    await loadBookmarks();
    await loadTags();
    
    acceptAllBtn.textContent = '✓ 已全部添加';
    
    setTimeout(() => {
      hideAIDialog();
    }, 1000);
  });

  // 重试按钮
  retryBtn?.addEventListener('click', async () => {
    if (currentAIBookmarkId) {
      await showAISuggestions(currentAIBookmarkId);
    }
  });

  const tagManager = document.getElementById('tagManagerPanel');
  const closeTagBtn = document.getElementById('closeTagManager');
  closeTagBtn?.addEventListener('click', () => {
    closeTagManager();
  });

  tagManager?.addEventListener('click', event => {
    if (event.target === tagManager) {
      closeTagManager();
    }
  });

  const input = document.getElementById('tagManagerInput');
  const addBtn = document.getElementById('tagManagerAddBtn');
  const deleteAllBtn = document.getElementById('tagManagerDeleteAllBtn');

  input?.addEventListener('keydown', async event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await addTagFromManagerInput();
    }
  });

  addBtn?.addEventListener('click', async () => {
    await addTagFromManagerInput();
  });

  deleteAllBtn?.addEventListener('click', async () => {
    await deleteAllTagsFromManager();
  });

  // 标签编辑对话框
  const tagEditDialog = document.getElementById('tagEditDialog');
  const closeTagEditBtn = document.getElementById('closeTagEditDialog');
  const tagEditSaveBtn = document.getElementById('tagEditSaveBtn');
  const tagEditCancelBtn = document.getElementById('tagEditCancelBtn');
  const tagEditInput = document.getElementById('tagEditInput');

  closeTagEditBtn?.addEventListener('click', closeTagEditDialog);
  tagEditCancelBtn?.addEventListener('click', closeTagEditDialog);
  tagEditSaveBtn?.addEventListener('click', saveTagEdit);

  tagEditDialog?.addEventListener('click', event => {
    if (event.target === tagEditDialog) {
      closeTagEditDialog();
    }
  });

  tagEditInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const tags = normalizeTagNames(event.target.value);
      tags.forEach(tag => {
        if (!currentEditingTags.includes(tag)) {
          currentEditingTags.push(tag);
        }
      });
      event.target.value = '';
      renderCurrentTags();
      renderTagSuggestions();
    }
  });

  // 去重对话框
  const deduplicateBtn = document.getElementById('deduplicateBtn');
  const deduplicateDialog = document.getElementById('deduplicateDialog');
  const closeDeduplicateDialog = document.getElementById('closeDeduplicateDialog');
  const dedupeCloseBtn = document.getElementById('dedupeCloseBtn');
  const dedupeScanBtn = document.getElementById('dedupeScanBtn');
  const dedupeAutoBtn = document.getElementById('dedupeAutoBtn');

  deduplicateBtn?.addEventListener('click', () => {
    showDeduplicateDialog();
  });

  closeDeduplicateDialog?.addEventListener('click', () => {
    hideDeduplicateDialog();
  });

  dedupeCloseBtn?.addEventListener('click', () => {
    hideDeduplicateDialog();
  });

  deduplicateDialog?.addEventListener('click', event => {
    if (event.target === deduplicateDialog) {
      hideDeduplicateDialog();
    }
  });

  dedupeScanBtn?.addEventListener('click', async () => {
    await scanDuplicates();
  });

  dedupeAutoBtn?.addEventListener('click', async () => {
    await autoDeduplicateBookmarks();
  });
}

async function loadTags() {
  const storedTags = await Storage.getTags();
  const uniqueTags = Array.from(new Set(storedTags.map(tag => tag.trim()).filter(Boolean)));

  const orderChanged = ensureTagOrderConsistency(uniqueTags);
  if (orderChanged) {
    await saveSettings();
  }

  renderTags(uniqueTags);
  await refreshTagManagerIfOpen();
}

function ensureTagOrderConsistency(tags) {
  let changed = false;
  const existing = new Set(tags);

  tagOrder = tagOrder.filter(tag => existing.has(tag));
  if (tagOrder.length !== tags.length) {
    tags.forEach(tag => {
      if (!tagOrder.includes(tag)) {
        tagOrder.push(tag);
        changed = true;
      }
    });
  }

  return changed;
}

function renderTags(tagList) {
  const list = document.getElementById('tagsList');
  if (!list) {
    return;
  }

  const tagsToRender = Array.isArray(tagList) ? tagList : tagOrder;
  const counts = calculateTagCounts();
  const hasUntagged = counts.untagged > 0;
  if (!hasUntagged && currentTagFilters.includes('__untagged__')) {
    currentTagFilters = currentTagFilters.filter(tag => tag !== '__untagged__');
  }
  const chips = [];

  chips.push(renderTagChip({ name: '__all__', label: '全部', count: allBookmarks.length }));
  if (hasUntagged) {
    chips.push(renderTagChip({ name: '__untagged__', label: '未标记', count: counts.untagged }));
  }

  tagsToRender.forEach(tag => {
    chips.push(renderTagChip({ name: tag, label: tag, count: counts.byName[tag] || 0 }));
  });

  list.innerHTML = chips.join('');

  // Defer measurement so we can flag when the chip list overflows.
  requestAnimationFrame(() => {
    const hasOverflow = list.scrollHeight > list.clientHeight + 1;
    list.classList.toggle('has-scroll', hasOverflow);
  });

  list.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      if (!tag) {
        return;
      }

      if (tag === '__all__') {
        currentTagFilters = [];
      } else if (tag === '__untagged__') {
        if (currentTagFilters.includes('__untagged__')) {
          currentTagFilters = currentTagFilters.filter(t => t !== '__untagged__');
        } else {
          currentTagFilters = ['__untagged__'];
        }
      } else {
        if (currentTagFilters.includes(tag)) {
          currentTagFilters = currentTagFilters.filter(t => t !== tag);
        } else {
          currentTagFilters = [...currentTagFilters.filter(t => t !== '__untagged__'), tag];
        }
      }

      updateTagChipState();
      applyFilters();
    });
  });

  updateTagChipState();
}

function renderTagChip({ name, label, count }) {
  const active = isTagChipActive(name) ? ' active' : '';
  const draggable = name.startsWith('__') ? '' : ' draggable="true"';
  return `
    <button class="tag-chip${active}" data-tag="${escapeHtml(name)}" data-count="${count}"${draggable}>
      <span class="tag-label">${escapeHtml(label)}</span>
      <span class="tag-count">${count}</span>
    </button>
  `;
}

function isTagChipActive(tag) {
  if (tag === '__all__') {
    return currentTagFilters.length === 0;
  }
  if (tag === '__untagged__') {
    return currentTagFilters.includes('__untagged__');
  }
  return currentTagFilters.includes(tag);
}

function updateTagChipState() {
  const chips = document.querySelectorAll('.tag-chip');
  chips.forEach(chip => {
    const tag = chip.dataset.tag;
    if (!tag) {
      return;
    }
    if (isTagChipActive(tag)) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

function calculateTagCounts() {
  const counts = { byName: {}, untagged: 0 };
  allBookmarks.forEach(bookmark => {
    if (!bookmark.tags || bookmark.tags.length === 0) {
      counts.untagged += 1;
      return;
    }
    bookmark.tags.forEach(tag => {
      counts.byName[tag] = (counts.byName[tag] || 0) + 1;
    });
  });
  return counts;
}
async function refreshTagManagerIfOpen() {
  const panel = document.getElementById('tagManagerPanel');
  if (panel && !panel.classList.contains('hidden')) {
    await renderTagManagerList();
  }
}

async function addTagFromManagerInput() {
  const input = document.getElementById('tagManagerInput');
  if (!input) {
    return;
  }

  const tags = normalizeTagNames(input.value);
  if (tags.length === 0) {
    showTagManagerMessage('请输入有效的标签名', 'error');
    return;
  }

  const newTags = [];
  for (const tag of tags) {
    if (!tagOrder.includes(tag)) {
      tagOrder.push(tag);
      newTags.push(tag);
    }
    await Storage.saveTag(tag);
  }

  if (newTags.length > 0) {
    await saveSettings();
    showTagManagerMessage(`已添加 ${newTags.join('、')}`);
  } else {
    showTagManagerMessage('标签已存在', 'info');
  }

  input.value = '';
  await loadTags();
}

function openTagManager() {
  const panel = document.getElementById('tagManagerPanel');
  if (!panel) {
    return;
  }
  panel.classList.remove('hidden');
  renderTagManagerList();
  const input = document.getElementById('tagManagerInput');
  input?.focus();
}

function closeTagManager() {
  const panel = document.getElementById('tagManagerPanel');
  if (!panel) {
    return;
  }
  panel.classList.add('hidden');
  tagManagerEditingTag = null;
}

async function renderTagManagerList() {
  const list = document.getElementById('tagManagerList');
  if (!list) {
    return;
  }

  const tags = await Storage.getTags();
  ensureTagOrderConsistency(tags);

  const counts = calculateTagCounts();
  const html = tagOrder.map(tag => {
    const count = counts.byName[tag] || 0;
    const isEditing = tagManagerEditingTag === tag;
    return renderTagManagerItem({ tag, count, isEditing });
  }).join('');

  list.innerHTML = html || '<p class="tag-manager-empty">暂时没有标签</p>';
  attachTagManagerItemEvents();
}

function renderTagManagerItem({ tag, count, isEditing }) {
  if (isEditing) {
    return `
      <div class="tag-manager-item editing" data-tag="${escapeHtml(tag)}">
        <input type="text" class="tag-manager-edit-input" value="${escapeHtml(tag)}">
        <div class="tag-manager-actions">
          <button class="text-btn action-save">保存</button>
          <button class="text-btn action-cancel">取消</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="tag-manager-item" data-tag="${escapeHtml(tag)}">
      <div class="tag-manager-info">
        <span class="tag-manager-name">${escapeHtml(tag)}</span>
        <span class="tag-manager-count">${count} 个书签</span>
      </div>
      <div class="tag-manager-actions">
        <button class="icon-btn action-move-up" title="上移">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>
        <button class="icon-btn action-move-down" title="下移">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <button class="icon-btn action-rename" title="重命名">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="icon-btn action-delete" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function attachTagManagerItemEvents() {
  const list = document.getElementById('tagManagerList');
  if (!list) {
    return;
  }

  list.querySelectorAll('.tag-manager-item').forEach(item => {
    const tag = item.dataset.tag;
    if (!tag) {
      return;
    }

    const moveUp = item.querySelector('.action-move-up');
    const moveDown = item.querySelector('.action-move-down');
    const renameBtn = item.querySelector('.action-rename');
    const deleteBtn = item.querySelector('.action-delete');

    moveUp?.addEventListener('click', async () => {
      await moveTag(tag, -1);
    });

    moveDown?.addEventListener('click', async () => {
      await moveTag(tag, 1);
    });

    renameBtn?.addEventListener('click', () => {
      startTagRename(tag);
    });

    deleteBtn?.addEventListener('click', async () => {
      await deleteTagFromManager(tag);
    });

    if (item.classList.contains('editing')) {
      const input = item.querySelector('.tag-manager-edit-input');
      const saveBtn = item.querySelector('.action-save');
      const cancelBtn = item.querySelector('.action-cancel');

      input?.addEventListener('keydown', async event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          await submitTagRename(tag, input.value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelTagRename();
        }
      });

      saveBtn?.addEventListener('click', async () => {
        await submitTagRename(tag, input?.value || '');
      });

      cancelBtn?.addEventListener('click', () => {
        cancelTagRename();
      });

      input?.focus();
      input?.select();
    }
  });
}

async function moveTag(tag, direction) {
  const index = tagOrder.indexOf(tag);
  if (index < 0) {
    return;
  }
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= tagOrder.length) {
    return;
  }

  const [moved] = tagOrder.splice(index, 1);
  tagOrder.splice(newIndex, 0, moved);
  await saveSettings();
  renderTags();
  await renderTagManagerList();
}

function startTagRename(tag) {
  tagManagerEditingTag = tag;
  renderTagManagerList();
}

function cancelTagRename() {
  tagManagerEditingTag = null;
  renderTagManagerList();
}

async function submitTagRename(oldName, newName) {
  const normalized = normalizeTagNames(newName);
  if (normalized.length === 0) {
    showTagManagerMessage('请输入有效的名称', 'error');
    return;
  }

  const finalName = normalized[0];
  if (finalName === oldName) {
    cancelTagRename();
    return;
  }

  if (tagOrder.includes(finalName)) {
    showTagManagerMessage('标签名称已存在', 'error');
    return;
  }

  const index = tagOrder.indexOf(oldName);
  if (index >= 0) {
    tagOrder[index] = finalName;
  }

  await Storage.renameTag(oldName, finalName);
  await saveSettings();
  tagManagerEditingTag = null;
  await loadTags();
  showTagManagerMessage(`已重命名为 ${finalName}`);
}

async function deleteTagFromManager(tag) {
  const confirmed = confirm(`确定要删除标签“${tag}”吗？该标签将在所有书签中被移除。`);
  if (!confirmed) {
    return;
  }

  tagOrder = tagOrder.filter(existing => existing !== tag);
  await Storage.deleteTag(tag);
  await saveSettings();
  await loadTags();
  showTagManagerMessage(`已删除标签 ${tag}`);
}

async function deleteAllTagsFromManager() {
  const existingTags = await Storage.getTags();
  if (!existingTags || existingTags.length === 0) {
    showTagManagerMessage('当前没有可清空的标签', 'info');
    return;
  }

  const confirmed = confirm('确定要删除所有标签吗？所有书签的标签都会被清空。');
  if (!confirmed) {
    return;
  }

  tagOrder = [];
  currentTagFilters = [];
  await Storage.clearAllTags();
  await saveSettings();
  await loadBookmarks();
  await loadTags();
  showTagManagerMessage('已清空所有标签');
}

function showTagManagerMessage(message, type = 'success') {
  const el = document.getElementById('tagManagerMessage');
  if (!el) {
    return;
  }
  el.textContent = message;
  el.className = `tag-manager-message ${type}`;
  el.classList.remove('hidden');

  clearTimeout(tagManagerMessageTimer);
  tagManagerMessageTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, 2000);
}
function hideAIDialog() {
  const dialog = document.getElementById('aiDialog');
  dialog?.classList.add('hidden');
}

function showAIDialog() {
  const dialog = document.getElementById('aiDialog');
  dialog?.classList.remove('hidden');
}

// 初始化标签栏折叠功能
function initTagsCollapse() {
  const tagsBar = document.querySelector('.tags-bar');
  const toggleBtn = document.getElementById('tagsToggleBtn');
  
  if (!tagsBar || !toggleBtn) return;
  
  // 从存储读取折叠状态
  chrome.storage.local.get(['tagsBarCollapsed'], (result) => {
    if (result.tagsBarCollapsed) {
      tagsBar.classList.add('collapsed');
    }
  });
  
  // 切换折叠状态
  toggleBtn.addEventListener('click', () => {
    const isCollapsed = tagsBar.classList.toggle('collapsed');
    chrome.storage.local.set({ tagsBarCollapsed: isCollapsed });
  });
}

async function showAISuggestions(bookmarkId) {
  const dialog = document.getElementById('aiDialog');
  const bookmarkInfoEl = document.getElementById('aiBookmarkInfo');
  const faviconEl = document.getElementById('aiBookmarkFavicon');
  const titleEl = document.getElementById('aiBookmarkTitle');
  const urlEl = document.getElementById('aiBookmarkUrl');
  const loadingEl = document.getElementById('aiLoading');
  const suggestionsEl = document.getElementById('aiSuggestions');
  const actionsEl = document.getElementById('aiActions');

  if (!dialog || !loadingEl || !suggestionsEl) {
    return;
  }

  const bookmark = allBookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) {
    return;
  }

  // 保存当前状态
  currentAIBookmarkId = bookmarkId;
  currentAISuggestedTags = [];

  // 显示书签信息
  if (bookmarkInfoEl && faviconEl && titleEl && urlEl) {
    faviconEl.src = bookmark.favicon || '';
    titleEl.textContent = bookmark.title || '未命名书签';
    urlEl.textContent = bookmark.url || '';
    bookmarkInfoEl.classList.remove('hidden');
  }

  showAIDialog();
  loadingEl.classList.remove('hidden');
  suggestionsEl.classList.add('hidden');
  actionsEl?.classList.add('hidden');
  suggestionsEl.innerHTML = '';

  try {
    const existingTags = bookmark.tags || [];
    const context = buildAIContext(bookmark);
    const suggestions = await AI.getSuggestedTags(bookmark, existingTags, context);
    const uniqueSuggestions = uniqueNewTags(suggestions, existingTags);

    currentAISuggestedTags = uniqueSuggestions;

    if (!uniqueSuggestions || uniqueSuggestions.length === 0) {
      suggestionsEl.innerHTML = '<p class="ai-empty">😔 AI 暂无新标签建议</p>';
      actionsEl?.classList.add('hidden');
    } else {
      renderAISuggestions(uniqueSuggestions, bookmarkId);
      actionsEl?.classList.remove('hidden');
    }
  } catch (error) {
    suggestionsEl.innerHTML = `<p class="ai-error">❌ ${escapeHtml(error.message || '获取建议失败，请检查 API 配置')}</p>`;
    actionsEl?.classList.add('hidden');
  } finally {
    loadingEl.classList.add('hidden');
    suggestionsEl.classList.remove('hidden');
  }
}

function renderAISuggestions(suggestions, bookmarkId) {
  const suggestionsEl = document.getElementById('aiSuggestions');
  if (!suggestionsEl) return;

  // 获取书签当前的标签
  const bookmark = allBookmarks.find(b => b.id === bookmarkId);
  const currentTags = bookmark?.tags || [];

  suggestionsEl.innerHTML = `
    <p style="margin-bottom: 12px; color: #6b7280;">💡 AI 为您推荐以下标签：</p>
    <div class="ai-tags">
      ${suggestions.map(tag => {
        const isAlreadyAdded = currentTags.includes(tag);
        return `
          <button class="ai-suggestion" 
                  data-tag="${escapeHtml(tag)}" 
                  data-bookmark-id="${escapeHtml(bookmarkId)}"
                  ${isAlreadyAdded ? 'disabled' : ''}>
            ${isAlreadyAdded ? '✓ ' : '+ '}${escapeHtml(tag)}
          </button>
        `;
      }).join('')}
    </div>
  `;

  // 绑定单个标签添加事件
  suggestionsEl.querySelectorAll('.ai-suggestion').forEach(button => {
    button.addEventListener('click', async () => {
      const tag = button.dataset.tag;
      const bmId = button.dataset.bookmarkId;
      if (!tag || !bmId || button.disabled) return;

      button.disabled = true;
      button.textContent = `✓ ${tag}`;
      
      await Storage.addTagToBookmark(bmId, tag);
      await loadBookmarks();
      await loadTags();
      
      // 更新全部接受按钮状态
      updateAcceptAllButtonState();
    });
  });

  // 初始化全部接受按钮状态
  updateAcceptAllButtonState();
}

function updateAcceptAllButtonState() {
  const acceptAllBtn = document.getElementById('aiAcceptAll');
  const suggestions = document.querySelectorAll('.ai-suggestion:not(:disabled)');
  
  if (acceptAllBtn) {
    acceptAllBtn.disabled = suggestions.length === 0;
    if (suggestions.length === 0) {
      acceptAllBtn.textContent = '✓ 已全部添加';
    } else {
      acceptAllBtn.textContent = `全部接受 (${suggestions.length})`;
    }
  }
}

async function runAIClassification() {
  if (isAIBulkClassifying) {
    return;
  }

  const untaggedBookmarks = allBookmarks.filter(bookmark => !bookmark.tags || bookmark.tags.length === 0);
  if (untaggedBookmarks.length === 0) {
    alert('当前没有未标记的书签。');
    return;
  }

  const confirmed = confirm(`AI 将尝试为 ${untaggedBookmarks.length} 个未标记书签生成标签，这可能会消耗您的 API 配额。是否继续？`);
  if (!confirmed) {
    return;
  }

  isAIBulkClassifying = true;

  const dialog = document.getElementById('aiDialog');
  const loadingEl = document.getElementById('aiLoading');
  const suggestionsEl = document.getElementById('aiSuggestions');

  if (dialog && loadingEl && suggestionsEl) {
    showAIDialog();
    loadingEl.classList.remove('hidden');
    suggestionsEl.classList.remove('hidden');
    suggestionsEl.innerHTML = '<p class="ai-info">AI 正在为未标记的书签生成标签...</p>';
  }

  let successCount = 0;
  let failureCount = 0;
  const resultLines = [];

  try {
    for (const bookmark of untaggedBookmarks) {
      try {
        const context = buildAIContext(bookmark);
        const suggestions = await AI.getSuggestedTags(bookmark, bookmark.tags || [], context);
        const uniqueTags = uniqueNewTags(suggestions, bookmark.tags || []);

        if (uniqueTags.length > 0) {
          for (const tag of uniqueTags) {
            await Storage.addTagToBookmark(bookmark.id, tag);
          }
          successCount += 1;
          resultLines.push(`<p class="ai-result ai-result-success"><strong>${escapeHtml(bookmark.title || bookmark.url || '未命名书签')}</strong>：${uniqueTags.map(escapeHtml).join('、')}</p>`);
        } else {
          failureCount += 1;
          resultLines.push(`<p class="ai-result ai-result-muted"><strong>${escapeHtml(bookmark.title || bookmark.url || '未命名书签')}</strong>：未生成标签</p>`);
        }
      } catch (error) {
        console.error('AI bulk classification failed', error);
        failureCount += 1;
        resultLines.push(`<p class="ai-result ai-result-error"><strong>${escapeHtml(bookmark.title || bookmark.url || '未命名书签')}</strong>：${escapeHtml(error.message || '生成失败')}</p>`);
      }
    }

    if (loadingEl) {
      loadingEl.classList.add('hidden');
    }

    if (suggestionsEl) {
      const summary = `<p class="ai-result-summary">分类完成：${successCount} 个成功，${failureCount} 个未生成。</p>`;
      suggestionsEl.innerHTML = summary + resultLines.join('');
    }

    await loadBookmarks();
    await loadTags();
  } finally {
    isAIBulkClassifying = false;
  }
}

function buildAIContext(bookmark) {
  const counts = calculateTagCounts();
  const knownTags = [...new Set([...tagOrder, ...Object.keys(counts.byName || {})])];

  const sameDomain = allBookmarks.filter(item => item.id !== bookmark.id && item.domain === bookmark.domain);
  const tagFrequency = {};
  const examples = [];

  sameDomain.forEach(item => {
    if (item.tags && item.tags.length > 0) {
      item.tags.forEach(tag => {
        tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
      });
      if (examples.length < 3) {
        examples.push(`${item.title || item.url || '未命名书签'} → ${item.tags.join('、')}`);
      }
    }
  });

  const relatedTags = Object.entries(tagFrequency)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 6);

  let path = '';
  try {
    const urlObj = new URL(bookmark.url);
    path = urlObj.pathname.replace(/\/+/g, '/');
  } catch (error) {
    path = '';
  }

  const keywords = extractKeywordsFromTitle(bookmark.title);

  return {
    knownTags,
    relatedTags,
    examples,
    urlInfo: { domain: bookmark.domain || '', path },
    keywords
  };
}

function getColorHex(color) {
  return COLOR_PALETTE[color]?.hex || '#d1d5db';
}

function getColorLabel(color) {
  return COLOR_PALETTE[color]?.label || '无颜色';
}

function getColorRank(color) {
  const index = COLOR_ORDER.indexOf(color);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function normalizeTagNames(input) {
  if (Array.isArray(input)) {
    return input.map(tag => tag.trim()).filter(Boolean);
  }

  if (typeof input !== 'string') {
    return [];
  }

  return input
    .split(/[\s,，;；\/\\]+/)
    .map(tag => tag.trim())
    .filter(Boolean);
}

function uniqueNewTags(tags, existingTags = []) {
  const existing = new Set((existingTags || []).map(tag => tag.toLowerCase()));
  const result = [];

  (tags || []).forEach(tag => {
    if (typeof tag !== 'string') {
      return;
    }
    const trimmed = tag.trim();
    if (!trimmed) {
      return;
    }
    const lower = trimmed.toLowerCase();
    if (existing.has(lower)) {
      return;
    }
    existing.add(lower);
    result.push(trimmed);
  });

  return result.slice(0, 3);
}

function escapeHtml(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractKeywordsFromTitle(title) {
  if (!title) {
    return [];
  }

  const tokens = title
    .replace(/[|\-,，。！？!?：:;；\/\\()[\]{}<>"']/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);

  const seen = new Set();
  const keywords = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (seen.has(lower)) {
      continue;
    }
    seen.add(lower);
    keywords.push(token);
    if (keywords.length >= 6) {
      break;
    }
  }

  return keywords;
}

const COLOR_PALETTE = {
  red: { hex: '#ef4444', label: '红色' },
  orange: { hex: '#f97316', label: '橙色' },
  yellow: { hex: '#eab308', label: '黄色' },
  green: { hex: '#22c55e', label: '绿色' },
  cyan: { hex: '#06b6d4', label: '青色' },
  blue: { hex: '#3b82f6', label: '蓝色' },
  purple: { hex: '#a855f7', label: '紫色' }
};

// ===== 书签去重功能 =====

let currentDuplicates = null;
let selectedKeepIds = {}; // { normalizedUrl: bookmarkId }

function showDeduplicateDialog() {
  const dialog = document.getElementById('deduplicateDialog');
  if (dialog) {
    dialog.classList.remove('hidden');
    // 重置状态
    currentDuplicates = null;
    selectedKeepIds = {};
    document.getElementById('dedupeResults')?.classList.add('hidden');
    document.getElementById('dedupeStatus')?.classList.remove('hidden');
    document.getElementById('dedupeAutoBtn').disabled = true;
  }
}

function hideDeduplicateDialog() {
  const dialog = document.getElementById('deduplicateDialog');
  if (dialog) {
    dialog.classList.add('hidden');
  }
}

async function scanDuplicates() {
  const scanBtn = document.getElementById('dedupeScanBtn');
  const statusEl = document.getElementById('dedupeStatus');
  const resultsEl = document.getElementById('dedupeResults');
  
  if (!scanBtn || !statusEl || !resultsEl) return;

  scanBtn.disabled = true;
  scanBtn.textContent = '扫描中...';
  statusEl.querySelector('.dedupe-status-text').textContent = '正在扫描重复书签...';

  try {
    currentDuplicates = await Storage.findDuplicateBookmarks();
    const groupCount = Object.keys(currentDuplicates).length;
    
    if (groupCount === 0) {
      statusEl.querySelector('.dedupe-status-text').textContent = '未发现重复书签';
      scanBtn.textContent = '重新扫描';
      scanBtn.disabled = false;
      resultsEl.classList.add('hidden');
      document.getElementById('dedupeAutoBtn').disabled = true;
      return;
    }

    // 计算总数
    let totalDuplicates = 0;
    for (const url in currentDuplicates) {
      totalDuplicates += currentDuplicates[url].length;
    }

    // 显示结果
    statusEl.classList.add('hidden');
    resultsEl.classList.remove('hidden');
    
    document.getElementById('dedupeGroupCount').textContent = groupCount;
    document.getElementById('dedupeTotalCount').textContent = totalDuplicates;
    
    renderDuplicateList(currentDuplicates);
    
    scanBtn.textContent = '重新扫描';
    scanBtn.disabled = false;
    document.getElementById('dedupeAutoBtn').disabled = false;
    
  } catch (error) {
    console.error('Error scanning duplicates:', error);
    statusEl.querySelector('.dedupe-status-text').textContent = '扫描失败，请重试';
    scanBtn.textContent = '重新扫描';
    scanBtn.disabled = false;
  }
}

function renderDuplicateList(duplicates) {
  const listEl = document.getElementById('dedupeList');
  if (!listEl) return;

  listEl.innerHTML = '';
  selectedKeepIds = {};

  for (const normalizedUrl in duplicates) {
    const bookmarkList = duplicates[normalizedUrl];
    if (bookmarkList.length < 2) continue;

    // 默认选择最新的书签（第一个，因为已按时间排序）
    const sorted = bookmarkList.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
    selectedKeepIds[normalizedUrl] = sorted[0].id;

    const groupDiv = document.createElement('div');
    groupDiv.className = 'dedupe-group';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'dedupe-group-header';
    
    const urlSpan = document.createElement('span');
    urlSpan.className = 'dedupe-group-url';
    urlSpan.textContent = bookmarkList[0].url;
    urlSpan.title = bookmarkList[0].url;
    
    const countSpan = document.createElement('span');
    countSpan.className = 'dedupe-group-count';
    countSpan.textContent = `${bookmarkList.length} 个重复`;
    
    headerDiv.appendChild(urlSpan);
    headerDiv.appendChild(countSpan);
    
    const itemsDiv = document.createElement('div');
    itemsDiv.className = 'dedupe-items';
    
    for (const bookmark of sorted) {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'dedupe-item';
      if (bookmark.id === selectedKeepIds[normalizedUrl]) {
        itemDiv.classList.add('selected');
      }
      
      // 单选按钮
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `keep-${normalizedUrl}`;
      radio.className = 'dedupe-item-radio';
      radio.value = bookmark.id;
      radio.checked = bookmark.id === selectedKeepIds[normalizedUrl];
      radio.addEventListener('change', () => {
        if (radio.checked) {
          selectedKeepIds[normalizedUrl] = bookmark.id;
          // 更新选中状态
          itemsDiv.querySelectorAll('.dedupe-item').forEach(item => {
            item.classList.remove('selected');
          });
          itemDiv.classList.add('selected');
        }
      });
      
      // Favicon
      const favicon = document.createElement('img');
      favicon.className = 'dedupe-item-favicon';
      favicon.src = `chrome://favicon/${bookmark.url}`;
      favicon.alt = '';
      
      // 信息
      const infoDiv = document.createElement('div');
      infoDiv.className = 'dedupe-item-info';
      
      const titleDiv = document.createElement('div');
      titleDiv.className = 'dedupe-item-title';
      titleDiv.textContent = bookmark.title || '无标题';
      titleDiv.title = bookmark.title || '无标题';
      
      const metaDiv = document.createElement('div');
      metaDiv.className = 'dedupe-item-meta';
      
      const dateDiv = document.createElement('div');
      dateDiv.className = 'dedupe-item-date';
      dateDiv.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        ${formatDate(bookmark.dateAdded)}
      `;
      
      metaDiv.appendChild(dateDiv);
      
      // 获取标签
      Storage.getBookmarkMeta(bookmark.id).then(meta => {
        if (meta.tags && meta.tags.length > 0) {
          const tagsDiv = document.createElement('div');
          tagsDiv.className = 'dedupe-item-tags';
          tagsDiv.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            ${meta.tags.slice(0, 3).map(tag => `<span class="dedupe-item-tag">${escapeHtml(tag)}</span>`).join('')}
            ${meta.tags.length > 3 ? `<span class="dedupe-item-tag">+${meta.tags.length - 3}</span>` : ''}
          `;
          metaDiv.appendChild(tagsDiv);
        }
      });
      
      infoDiv.appendChild(titleDiv);
      infoDiv.appendChild(metaDiv);
      
      // 操作按钮
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'dedupe-item-actions';
      
      const viewBtn = document.createElement('button');
      viewBtn.className = 'dedupe-item-btn';
      viewBtn.textContent = '查看';
      viewBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: bookmark.url });
      });
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'dedupe-item-btn danger';
      deleteBtn.textContent = '删除';
      deleteBtn.addEventListener('click', async () => {
        if (confirm('确定要删除这个书签吗？')) {
          try {
            await chrome.bookmarks.remove(bookmark.id);
            showToast('书签已删除');
            // 重新扫描
            await scanDuplicates();
            await loadBookmarks();
          } catch (error) {
            console.error('Error deleting bookmark:', error);
            showToast('删除失败', 'error');
          }
        }
      });
      
      actionsDiv.appendChild(viewBtn);
      actionsDiv.appendChild(deleteBtn);
      
      itemDiv.appendChild(radio);
      itemDiv.appendChild(favicon);
      itemDiv.appendChild(infoDiv);
      itemDiv.appendChild(actionsDiv);
      
      itemsDiv.appendChild(itemDiv);
    }
    
    groupDiv.appendChild(headerDiv);
    groupDiv.appendChild(itemsDiv);
    listEl.appendChild(groupDiv);
  }
}

async function autoDeduplicateBookmarks() {
  if (!currentDuplicates || Object.keys(currentDuplicates).length === 0) {
    return;
  }

  const autoBtn = document.getElementById('dedupeAutoBtn');
  if (!autoBtn) return;

  if (!confirm('将自动保留每组中选中的书签，删除其他重复项。此操作不可撤销，确定继续吗？')) {
    return;
  }

  autoBtn.disabled = true;
  autoBtn.textContent = '处理中...';

  try {
    let totalRemoved = 0;
    let totalFailed = 0;

    for (const normalizedUrl in currentDuplicates) {
      const bookmarkList = currentDuplicates[normalizedUrl];
      if (bookmarkList.length < 2) continue;

      const keepId = selectedKeepIds[normalizedUrl] || bookmarkList[0].id;
      const allIds = bookmarkList.map(b => b.id);

      const result = await Storage.removeDuplicateBookmarks(allIds, keepId);
      totalRemoved += result.success;
      totalFailed += result.failed;
    }

    showToast(`去重完成：移除 ${totalRemoved} 个重复书签${totalFailed > 0 ? `，${totalFailed} 个失败` : ''}`);
    
    // 刷新列表
    await loadBookmarks();
    
    // 重新扫描
    await scanDuplicates();
    
  } catch (error) {
    console.error('Error auto deduplicating:', error);
    showToast('自动去重失败', 'error');
    autoBtn.textContent = '自动去重';
    autoBtn.disabled = false;
  }
}

function formatDate(timestamp) {
  if (!timestamp) return '未知';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) {
    return '今天';
  } else if (days === 1) {
    return '昨天';
  } else if (days < 7) {
    return `${days} 天前`;
  } else if (days < 30) {
    return `${Math.floor(days / 7)} 周前`;
  } else if (days < 365) {
    return `${Math.floor(days / 30)} 个月前`;
  } else {
    return `${Math.floor(days / 365)} 年前`;
  }
}
