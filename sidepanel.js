// 侧边栏主逻辑 - 使用 Chrome 书签 API + 拖拽交互

let allBookmarks = [];
let filteredBookmarks = [];
let currentColorFilter = '';
let currentTagFilters = []; // 改为数组支持多选
let draggedTag = null;
let draggedBookmark = null; // 用于书签拖拽排序
let currentColorPickerBookmark = null;
let currentSortBy = 'custom'; // custom, name, time, domain, color
let sortDirection = {}; // 记录每种排序的方向 {name: 'asc'/'desc', time: 'desc'/'asc', domain: 'asc'/'desc'}
let tagOrder = []; // 标签自定义排序
let bookmarkOrder = {}; // 书签自定义排序 {bookmarkId: order}
let currentTagMode = ''; // 标签模式：'sort', 'edit', 'delete', ''
let editingTag = null; // 当前编辑的标签

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadBookmarks();
  await loadTags();
  await loadSettings(); // 加载排序和标签顺序
  initColorFilters();
  initSearch();
  initTagDragAndDrop();
  initBookmarkDragAndDrop(); // 书签拖拽排序
  initSortButtons(); // 排序按钮
  initDialogs();
  initTagModeButtons(); // 标签模式按钮
  initCreateTagDialog(); // 新建标签对话框
  initEditTagDialog(); // 编辑标签对话框
  
  // 设置按钮
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  // 添加标签按钮 - 打开新建标签对话框
  document.getElementById('addTagBtn').addEventListener('click', () => {
    showCreateTagDialog();
  });
  
  // 监听 Chrome 书签变化
  chrome.bookmarks.onCreated.addListener(() => loadBookmarks());
  chrome.bookmarks.onRemoved.addListener(() => loadBookmarks());
  chrome.bookmarks.onChanged.addListener(() => loadBookmarks());
  chrome.bookmarks.onMoved.addListener(() => loadBookmarks());
});

// 加载设置（排序方式、标签顺序等）
async function loadSettings() {
  const result = await chrome.storage.local.get(['sortBy', 'tagOrder', 'bookmarkOrder', 'sortDirection']);
  currentSortBy = result.sortBy || 'custom';
  tagOrder = result.tagOrder || [];
  bookmarkOrder = result.bookmarkOrder || {};
  sortDirection = result.sortDirection || {};
  
  // 更新排序按钮状态
  updateSortButtonState();
}

// 保存设置
async function saveSettings() {
  await chrome.storage.local.set({
    sortBy: currentSortBy,
    tagOrder: tagOrder,
    bookmarkOrder: bookmarkOrder,
    sortDirection: sortDirection
  });
}

// 加载所有书签
async function loadBookmarks() {
  allBookmarks = await Storage.getBookmarksWithMetadata();
  sortBookmarks();
  applyFilters();
}

// 排序书签
function sortBookmarks() {
  switch (currentSortBy) {
    case 'name':
      // 按名称排序（默认正序A-Z，可切换）
      const nameDir = sortDirection.name || 'asc';
      if (nameDir === 'asc') {
        allBookmarks.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
      } else {
        allBookmarks.sort((a, b) => b.title.localeCompare(a.title, 'zh-CN'));
      }
      break;
      
    case 'time':
      // 按时间排序（默认倒序新→旧，可切换）
      const timeDir = sortDirection.time || 'desc';
      if (timeDir === 'desc') {
        allBookmarks.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      } else {
        allBookmarks.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
      }
      break;
      
    case 'domain':
      // 按域名排序（默认正序，可切换）
      const domainDir = sortDirection.domain || 'asc';
      if (domainDir === 'asc') {
        allBookmarks.sort((a, b) => (a.domain || '').localeCompare(b.domain || '', 'zh-CN'));
      } else {
        allBookmarks.sort((a, b) => (b.domain || '').localeCompare(a.domain || '', 'zh-CN'));
      }
      break;
      
    case 'color':
      // 按颜色排序
      const colorDir = sortDirection.color || 'asc';
      const colorOrder = { red: 0, orange: 1, yellow: 2, green: 3, cyan: 4, blue: 5, purple: 6, '': 7 };
      if (colorDir === 'asc') {
        allBookmarks.sort((a, b) => {
          const orderA = colorOrder[a.color] ?? 7;
          const orderB = colorOrder[b.color] ?? 7;
          return orderA - orderB;
        });
      } else {
        allBookmarks.sort((a, b) => {
          const orderA = colorOrder[a.color] ?? 7;
          const orderB = colorOrder[b.color] ?? 7;
          return orderB - orderA;
        });
      }
      break;
      
    case 'custom':
      // 自定义排序
      allBookmarks.sort((a, b) => {
        const orderA = bookmarkOrder[a.id] ?? 999999;
        const orderB = bookmarkOrder[b.id] ?? 999999;
        return orderA - orderB;
      });
      break;
  }
}

// 加载标签
async function loadTags() {
  let tags = await Storage.getTags();
  const tagsList = document.getElementById('tagsList');
  
  // 根据保存的顺序排序标签
  if (tagOrder.length > 0) {
    tags = tags.sort((a, b) => {
      const indexA = tagOrder.indexOf(a);
      const indexB = tagOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }
  
  // 统计每个标签的书签数量
  const tagCounts = {};
  allBookmarks.forEach(bookmark => {
    if (bookmark.tags && bookmark.tags.length > 0) {
      bookmark.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });
  
  // 统计未分类书签数量
  const untaggedCount = allBookmarks.filter(b => !b.tags || b.tags.length === 0).length;
  
  // 根据模式添加不同的类名
  let modeClass = '';
  if (currentTagMode === 'sort') modeClass = 'sort-mode';
  else if (currentTagMode === 'edit') modeClass = 'edit-mode';
  else if (currentTagMode === 'delete') modeClass = 'delete-mode';
  
  // 渲染标签，添加"未分类"标签
  const tagsHTML = `
    <div class="tag-chip tag-untagged ${currentTagFilters.includes('__untagged__') ? 'active' : ''} ${modeClass}" 
         data-tag="__untagged__"
         draggable="false">
      <span>未分类</span>
      <span class="tag-count">${untaggedCount}</span>
    </div>
    ${tags.map(tag => `
      <div class="tag-chip ${currentTagFilters.includes(tag) ? 'active' : ''} ${modeClass}" 
           draggable="true"
           data-tag="${escapeHtml(tag)}">
        <span>${escapeHtml(tag)}</span>
        <span class="tag-count">${tagCounts[tag] || 0}</span>
      </div>
    `).join('')}
  `;
  
  tagsList.innerHTML = tagsHTML || '<div class="empty-tags">暂无标签</div>';
  
  // 绑定标签事件
  bindTagEvents();
}

// 绑定标签事件
function bindTagEvents() {
  const tagsList = document.getElementById('tagsList');
  const tagChips = tagsList.querySelectorAll('.tag-chip');
  
  console.log(`绑定标签事件 - 当前模式: ${currentTagMode}, 标签数量: ${tagChips.length}`);
  
  tagChips.forEach((chip, index) => {
    const isUntagged = chip.classList.contains('tag-untagged');
    const tagName = chip.dataset.tag;
    
    // 清除所有之前的事件监听器（避免重复绑定）
    chip.replaceWith(chip.cloneNode(true));
    const newChip = tagsList.querySelectorAll('.tag-chip')[index];
    
    console.log(`绑定标签 [${tagName}] - 模式: ${currentTagMode}, 是否未分类: ${isUntagged}`);
    
    if (currentTagMode === 'sort') {
      // 排序模式：启用标签间拖拽排序（未分类标签除外）
      if (!isUntagged) {
        console.log(`为标签 [${tagName}] 绑定排序事件`);
        newChip.addEventListener('dragstart', handleTagDragStart);
        newChip.addEventListener('dragend', handleTagDragEnd);
        newChip.addEventListener('dragover', handleTagDragOver);
        newChip.addEventListener('drop', handleTagDrop);
        newChip.style.cursor = 'move';
      }
    } else if (currentTagMode === 'edit') {
      // 编辑模式：点击编辑（未分类标签除外）
      if (!isUntagged) {
        console.log(`为标签 [${tagName}] 绑定编辑事件`);
        newChip.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log(`点击编辑标签: ${tagName}`);
          showEditTagDialog(tagName);
        });
        newChip.style.cursor = 'pointer';
      }
    } else if (currentTagMode === 'delete') {
      // 删除模式：点击删除（未分类标签除外）
      if (!isUntagged) {
        console.log(`为标签 [${tagName}] 绑定删除事件`);
        newChip.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log(`点击删除标签: ${tagName}`);
          await handleTagDelete(tagName);
        });
        newChip.style.cursor = 'pointer';
      }
    } else {
      // 正常模式：拖拽给书签+点击筛选
      if (!isUntagged) {
        // 启用拖拽标签到书签的功能
        newChip.addEventListener('dragstart', (e) => {
          draggedTag = e.currentTarget.dataset.tag;
          e.dataTransfer.effectAllowed = 'copy';
          e.currentTarget.classList.add('dragging');
          console.log(`开始拖拽标签到书签: ${draggedTag}`);
        });
        
        newChip.addEventListener('dragend', (e) => {
          e.currentTarget.classList.remove('dragging');
          draggedTag = null;
          console.log(`结束拖拽标签`);
        });
      }
      
      // 所有标签都可以点击筛选
      newChip.addEventListener('click', (e) => {
        console.log(`点击筛选标签: ${tagName}`);
        handleTagClick(e);
      });
      newChip.style.cursor = 'pointer';
    }
  });
}

// 初始化颜色筛选
function initColorFilters() {
  const colorFilters = document.querySelectorAll('.color-filter');
  
  colorFilters.forEach(filter => {
    filter.addEventListener('click', () => {
      colorFilters.forEach(f => f.classList.remove('active'));
      filter.classList.add('active');
      currentColorFilter = filter.dataset.color;
      currentTagFilters = []; // 清除标签筛选
      updateTagChipsState();
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

// 应用筛选（支持多标签交集）
function applyFilters(searchQuery = '') {
  filteredBookmarks = allBookmarks.filter(bookmark => {
    // 颜色筛选
    if (currentColorFilter && bookmark.color !== currentColorFilter) {
      return false;
    }
    
    // 多标签交集筛选
    if (currentTagFilters.length > 0) {
      // 检查是否选中了"未分类"
      if (currentTagFilters.includes('__untagged__')) {
        // 如果只选了未分类，显示无标签的书签
        if (currentTagFilters.length === 1) {
          if (bookmark.tags && bookmark.tags.length > 0) {
            return false;
          }
        } else {
          // 如果未分类和其他标签都选了，不显示任何结果（逻辑冲突）
          return false;
        }
      } else {
        // 检查书签是否包含所有选中的标签（交集）
        if (!bookmark.tags || bookmark.tags.length === 0) {
          return false;
        }
        for (const filter of currentTagFilters) {
          if (!bookmark.tags.includes(filter)) {
            return false;
          }
        }
      }
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
  
  bookmarksList.innerHTML = filteredBookmarks.map(bookmark => `
    <div class="bookmark-item" 
         data-id="${bookmark.id}" 
         data-url="${escapeHtml(bookmark.url)}"
         draggable="${currentSortBy === 'custom' ? 'true' : 'false'}">
      <div class="bookmark-color-indicator ${bookmark.color ? 'has-color' : ''}" 
           style="background-color: ${getColorHex(bookmark.color)};">
      </div>
      <img src="${bookmark.favicon}" alt="" class="bookmark-favicon" 
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text y=%2220%22 font-size=%2220%22>🔖</text></svg>'">
      <div class="bookmark-info">
        <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
        <div class="bookmark-url">${escapeHtml(bookmark.domain)}</div>
        <div class="bookmark-tags">
          ${bookmark.tags && bookmark.tags.length > 0 ? bookmark.tags.map(tag => `
            <span class="tag-mini" data-bookmark-id="${bookmark.id}" data-tag="${escapeHtml(tag)}">
              ${escapeHtml(tag)}
            </span>
          `).join('') : ''}
        </div>
      </div>
      <div class="bookmark-actions">
        <button class="icon-btn bookmark-color-btn" title="修改颜色" data-bookmark-id="${bookmark.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        <button class="icon-btn bookmark-ai" title="AI 标签建议" data-bookmark-id="${bookmark.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </button>
        <button class="icon-btn bookmark-delete" title="删除" data-bookmark-id="${bookmark.id}">
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

// 绑定书签事件
function bindBookmarkEvents() {
  // 点击书签打开链接
  document.querySelectorAll('.bookmark-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // 如果点击的是按钮、标签或其他交互元素，不打开链接
      if (e.target.closest('.bookmark-actions') || 
          e.target.closest('.bookmark-tags') ||
          e.target.closest('.bookmark-color-indicator')) {
        return;
      }
      const url = item.dataset.url;
      if (url) {
        chrome.tabs.create({ url });
      }
    });
    
    // 书签拖拽排序（仅在自定义排序模式下）
    if (currentSortBy === 'custom') {
      item.addEventListener('dragstart', handleBookmarkDragStart);
      item.addEventListener('dragend', handleBookmarkDragEnd);
      item.addEventListener('dragover', handleBookmarkItemDragOver);
      item.addEventListener('drop', handleBookmarkItemDrop);
    }
    
    // 书签项作为标签拖放目标
    item.addEventListener('dragover', handleBookmarkDragOver);
    item.addEventListener('drop', handleBookmarkDrop);
    item.addEventListener('dragleave', handleBookmarkDragLeave);
  });
  
  // 颜色按钮点击
  document.querySelectorAll('.bookmark-color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showColorPicker(e.currentTarget, btn.dataset.bookmarkId);
    });
  });
  
  // AI 建议
  document.querySelectorAll('.bookmark-ai').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const bookmarkId = btn.dataset.bookmarkId;
      await showAISuggestions(bookmarkId);
    });
  });
  
  // 删除书签
  document.querySelectorAll('.bookmark-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('确定要删除这个书签吗？')) {
        const bookmarkId = btn.dataset.bookmarkId;
        await Storage.deleteBookmark(bookmarkId);
        await loadBookmarks();
      }
    });
  });
  
  // 书签标签点击 - 显示删除按钮
  document.querySelectorAll('.tag-mini').forEach(tagEl => {
    tagEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const bookmarkId = tagEl.dataset.bookmarkId;
      const tagName = tagEl.dataset.tag;
      
      // 如果已经有删除按钮，直接删除标签
      if (tagEl.classList.contains('delete-mode')) {
        removeTagFromBookmark(bookmarkId, tagName);
        return;
      }
      
      // 移除其他标签的删除模式
      document.querySelectorAll('.tag-mini').forEach(t => t.classList.remove('delete-mode'));
      
      // 添加删除模式
      tagEl.classList.add('delete-mode');
      
      // 3秒后自动取消删除模式
      setTimeout(() => {
        tagEl.classList.remove('delete-mode');
      }, 3000);
    });
  });
}

// ===== 拖拽交互 =====

function initTagDragAndDrop() {
  // 全局拖拽相关事件
  document.addEventListener('dragover', (e) => {
    if (draggedTag) {
      e.preventDefault();
    }
  });
}

// 标签开始拖拽
// ===== 标签排序功能（排序模式专用）=====

function handleTagDragStart(e) {
  try {
    draggedTag = e.currentTarget.dataset.tag;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedTag);
    
    console.log(`标签排序 - 开始拖拽: ${draggedTag}`);
  } catch (error) {
    console.error('标签拖拽开始失败:', error);
  }
}

function handleTagDragEnd(e) {
  try {
    e.currentTarget.classList.remove('dragging');
    // 移除所有拖拽高亮
    document.querySelectorAll('.tag-chip').forEach(chip => {
      chip.classList.remove('drag-over');
    });
    
    console.log(`标签排序 - 结束拖拽: ${draggedTag}`);
    draggedTag = null;
  } catch (error) {
    console.error('标签拖拽结束失败:', error);
  }
}

function handleTagDragOver(e) {
  if (!draggedTag) return;
  
  try {
    e.preventDefault();
    e.stopPropagation();
    
    const currentChip = e.currentTarget;
    const targetTag = currentChip.dataset.tag;
    
    // 不能拖到自己或未分类标签上
    if (targetTag === draggedTag || targetTag === '__untagged__') {
      return;
    }
    
    // 移除其他标签的高亮
    document.querySelectorAll('.tag-chip').forEach(chip => {
      if (chip !== currentChip) {
        chip.classList.remove('drag-over');
      }
    });
    
    currentChip.classList.add('drag-over');
    console.log(`标签排序 - 拖拽经过: ${targetTag}`);
  } catch (error) {
    console.error('标签拖拽经过失败:', error);
  }
}

async function handleTagDrop(e) {
  try {
    e.preventDefault();
    e.stopPropagation();
    
    const currentChip = e.currentTarget;
    const targetTag = currentChip.dataset.tag;
    
    currentChip.classList.remove('drag-over');
    
    console.log(`标签排序 - 准备放置: ${draggedTag} → ${targetTag}`);
    
    // 验证
    if (!draggedTag || draggedTag === targetTag || targetTag === '__untagged__') {
      console.log('标签排序 - 无效的拖拽操作');
      return;
    }
    
    // 获取所有标签
    const tags = await Storage.getTags();
    console.log(`标签排序 - 当前所有标签:`, tags);
    
    // 初始化标签顺序（如果为空）
    if (tagOrder.length === 0) {
      tagOrder = [...tags];
      console.log(`标签排序 - 初始化标签顺序:`, tagOrder);
    }
    
    // 确保两个标签都在列表中
    if (!tagOrder.includes(draggedTag)) {
      tagOrder.push(draggedTag);
      console.log(`标签排序 - 添加拖拽标签到顺序列表: ${draggedTag}`);
    }
    if (!tagOrder.includes(targetTag)) {
      tagOrder.push(targetTag);
      console.log(`标签排序 - 添加目标标签到顺序列表: ${targetTag}`);
    }
    
    // 执行重新排列
    const draggedIndex = tagOrder.indexOf(draggedTag);
    const targetIndex = tagOrder.indexOf(targetTag);
    
    console.log(`标签排序 - 原位置: ${draggedIndex}, 目标位置: ${targetIndex}`);
    
    if (draggedIndex !== -1 && targetIndex !== -1) {
      // 移除拖拽标签
      tagOrder.splice(draggedIndex, 1);
      
      // 重新计算目标位置（因为移除了一个元素）
      const newTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
      
      // 插入到目标位置
      tagOrder.splice(newTargetIndex, 0, draggedTag);
      
      console.log(`标签排序 - 新顺序:`, tagOrder);
      
      // 保存并刷新
      await saveSettings();
      await loadTags();
      
      console.log('标签排序 - 操作完成');
      showToast(`标签 "${draggedTag}" 已移动`);
    } else {
      console.error('标签排序 - 找不到标签位置');
    }
    
  } catch (error) {
    console.error('标签排序失败:', error);
    showToast('标签排序失败，请重试');
  }
}


// ===== 书签拖拽接收标签 =====

// 书签上方拖拽标签
function handleBookmarkDragOver(e) {
  if (draggedTag) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
  }
}

// 标签拖拽离开书签
function handleBookmarkDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

// 标签放到书签上
async function handleBookmarkDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  
  if (draggedTag) {
    const bookmarkId = e.currentTarget.dataset.id;
    await Storage.addTagToBookmark(bookmarkId, draggedTag);
    await loadBookmarks();
    await loadTags();
  }
}


// 标签点击筛选（支持多选）
// 处理标签删除
async function handleTagDelete(tagName) {
  try {
    console.log(`开始删除标签: ${tagName}`);
    
    if (!tagName) {
      console.error('标签名称不能为空');
      alert('标签名称不能为空');
      return;
    }
    
    // 统计使用该标签的书签数量
    const affectedBookmarks = allBookmarks.filter(b => b.tags && b.tags.includes(tagName));
    const count = affectedBookmarks.length;
    
    console.log(`标签 "${tagName}" 被 ${count} 个书签使用`);
    
    // 构建确认消息
    let confirmMsg = `确定要删除标签 "${tagName}" 吗？`;
    if (count > 0) {
      confirmMsg += `\n\n该标签被 ${count} 个书签使用，删除后这些书签将失去该标签。`;
      confirmMsg += `\n\n受影响的书签包括：`;
      
      // 显示前5个受影响的书签名称
      const sampleBookmarks = affectedBookmarks.slice(0, 5).map(b => `• ${b.title}`).join('\n');
      confirmMsg += `\n${sampleBookmarks}`;
      if (count > 5) {
        confirmMsg += `\n...还有 ${count - 5} 个书签`;
      }
    }
    
    if (!confirm(confirmMsg)) {
      console.log('用户取消删除标签');
      return;
    }
    
    console.log('用户确认删除标签，开始执行删除操作...');
    
    // 从所有书签中移除该标签
    let removedCount = 0;
    for (const bookmark of affectedBookmarks) {
      console.log(`从书签 [${bookmark.title}] 中移除标签 "${tagName}"`);
      await Storage.removeTagFromBookmark(bookmark.id, tagName);
      removedCount++;
    }
    
    console.log(`已从 ${removedCount} 个书签中移除标签`);
    
    // 从标签顺序中移除
    const index = tagOrder.indexOf(tagName);
    if (index > -1) {
      tagOrder.splice(index, 1);
      await saveSettings();
      console.log(`已从标签顺序列表中移除，原位置: ${index}`);
    }
    
    // 从当前筛选中移除（如果正在使用该标签筛选）
    const filterIndex = currentTagFilters.indexOf(tagName);
    if (filterIndex > -1) {
      currentTagFilters.splice(filterIndex, 1);
      console.log('已从当前筛选中移除该标签');
    }
    
    // 刷新显示
    await loadBookmarks();
    await loadTags();
    
    // 显示成功提示
    showToast(`标签 "${tagName}" 已删除`);
    console.log(`标签删除完成: ${tagName}`);
    
  } catch (error) {
    console.error('删除标签失败:', error);
    alert(`删除标签失败: ${error.message || '未知错误'}`);
  }
}

// 显示提示信息
function showToast(message) {
  // 创建toast元素
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 13px;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
  `;
  
  document.body.appendChild(toast);
  
  // 3秒后移除
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
}

function handleTagClick(e) {
  e.stopPropagation();
  
  const tag = e.currentTarget.dataset.tag;
  
  // 切换标签选中状态
  const index = currentTagFilters.indexOf(tag);
  if (index > -1) {
    // 取消选中
    currentTagFilters.splice(index, 1);
    e.currentTarget.classList.remove('active');
  } else {
    // 选中
    currentTagFilters.push(tag);
    e.currentTarget.classList.add('active');
  }
  
  // 如果选中了标签，清除颜色筛选
  if (currentTagFilters.length > 0) {
    document.querySelectorAll('.color-filter').forEach(f => f.classList.remove('active'));
    document.querySelector('.color-filter[data-color=""]').classList.add('active');
    currentColorFilter = '';
  }
  
  applyFilters();
}

// 更新标签选中状态显示
function updateTagChipsState() {
  document.querySelectorAll('.tag-chip').forEach(chip => {
    const tag = chip.dataset.tag;
    if (currentTagFilters.includes(tag)) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

// ===== 书签拖拽排序 =====

function initBookmarkDragAndDrop() {
  // 在渲染书签时动态绑定
}

function handleBookmarkDragStart(e) {
  if (currentSortBy !== 'custom') return;
  
  draggedBookmark = e.currentTarget.dataset.id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleBookmarkDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  draggedBookmark = null;
  
  // 移除所有拖拽高亮
  document.querySelectorAll('.bookmark-item').forEach(item => {
    item.classList.remove('drag-over-bookmark');
  });
}

function handleBookmarkItemDragOver(e) {
  if (!draggedBookmark) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  const targetId = e.currentTarget.dataset.id;
  if (targetId === draggedBookmark) return;
  
  // 移除其他书签的高亮
  document.querySelectorAll('.bookmark-item').forEach(item => {
    if (item.dataset.id !== targetId) {
      item.classList.remove('drag-over-bookmark');
    }
  });
  
  e.currentTarget.classList.add('drag-over-bookmark');
}

async function handleBookmarkItemDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const targetId = e.currentTarget.dataset.id;
  e.currentTarget.classList.remove('drag-over-bookmark');
  
  if (!draggedBookmark || draggedBookmark === targetId) return;
  
  try {
    // 获取当前显示的书签ID列表
    const displayedIds = filteredBookmarks.map(b => b.id);
    const draggedIndex = displayedIds.indexOf(draggedBookmark);
    const targetIndex = displayedIds.indexOf(targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // 重新排列
    displayedIds.splice(draggedIndex, 1);
    displayedIds.splice(targetIndex, 0, draggedBookmark);
    
    // 更新所有书签的顺序
    displayedIds.forEach((id, index) => {
      bookmarkOrder[id] = index;
    });
    
    // 保存并刷新
    await saveSettings();
    await loadBookmarks();
    
  } catch (error) {
    console.error('书签排序失败:', error);
  }
}

// 排序按钮初始化
// ===== 标签模式系统 =====

function initTagModeButtons() {
  // 排序模式按钮
  document.getElementById('tagSortModeBtn').addEventListener('click', () => {
    toggleTagMode('sort');
  });
  
  // 编辑模式按钮
  document.getElementById('tagEditModeBtn').addEventListener('click', () => {
    toggleTagMode('edit');
  });
  
  // 删除模式按钮
  document.getElementById('tagDeleteModeBtn').addEventListener('click', () => {
    toggleTagMode('delete');
  });
  
  // 退出模式按钮
  document.getElementById('exitTagModeBtn').addEventListener('click', () => {
    exitTagMode();
  });
}

function toggleTagMode(mode) {
  if (currentTagMode === mode) {
    exitTagMode();
  } else {
    currentTagMode = mode;
    updateTagModeUI();
  }
}

function exitTagMode() {
  currentTagMode = '';
  updateTagModeUI();
}

function updateTagModeUI() {
  // 更新模式按钮状态
  document.querySelectorAll('.tag-mode-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // 显示/隐藏模式提示
  const hint = document.getElementById('tagModeHint');
  const hintText = document.getElementById('tagModeHintText');
  
  if (currentTagMode) {
    // 激活对应按钮
    if (currentTagMode === 'sort') {
      document.getElementById('tagSortModeBtn').classList.add('active');
      hintText.textContent = '🔀 拖动标签进行排序';
    } else if (currentTagMode === 'edit') {
      document.getElementById('tagEditModeBtn').classList.add('active');
      hintText.textContent = '✎ 点击标签进行编辑';
    } else if (currentTagMode === 'delete') {
      document.getElementById('tagDeleteModeBtn').classList.add('active');
      hintText.textContent = '🗑️ 点击标签进行删除';
    }
    hint.style.display = 'flex';
  } else {
    hint.style.display = 'none';
  }
  
  // 重新渲染标签
  loadTags();
}

function initSortButtons() {
  const sortBtns = document.querySelectorAll('.sort-btn');
  sortBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const sortBy = btn.dataset.sort;
      
      // 如果点击的是当前排序，切换方向（支持name/time/domain/color）
      if (currentSortBy === sortBy && ['name', 'time', 'domain', 'color'].includes(sortBy)) {
        // 切换方向
        if (sortBy === 'name') {
          sortDirection.name = sortDirection.name === 'asc' ? 'desc' : 'asc';
        } else if (sortBy === 'time') {
          sortDirection.time = sortDirection.time === 'desc' ? 'asc' : 'desc';
        } else if (sortBy === 'domain') {
          sortDirection.domain = sortDirection.domain === 'asc' ? 'desc' : 'asc';
        } else if (sortBy === 'color') {
          sortDirection.color = sortDirection.color === 'asc' ? 'desc' : 'asc';
        }
      } else {
        // 切换到新的排序方式，使用默认方向
        currentSortBy = sortBy;
        if (sortBy === 'name' && !sortDirection.name) sortDirection.name = 'asc';
        if (sortBy === 'time' && !sortDirection.time) sortDirection.time = 'desc';
        if (sortBy === 'domain' && !sortDirection.domain) sortDirection.domain = 'asc';
        if (sortBy === 'color' && !sortDirection.color) sortDirection.color = 'asc';
      }
      
      await saveSettings();
      updateSortButtonState();
      await loadBookmarks();
    });
  });
}

function updateSortButtonState() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    const sortBy = btn.dataset.sort;
    
    if (sortBy === currentSortBy) {
      btn.classList.add('active');
      
      // 根据方向更新提示文字
      if (sortBy === 'name') {
        btn.title = sortDirection.name === 'asc' ? '按名称 A-Z（点击切换）' : '按名称 Z-A（点击切换）';
      } else if (sortBy === 'time') {
        btn.title = sortDirection.time === 'desc' ? '按时间 新→旧（点击切换）' : '按时间 旧→新（点击切换）';
      } else if (sortBy === 'domain') {
        btn.title = sortDirection.domain === 'asc' ? '按域名 A-Z（点击切换）' : '按域名 Z-A（点击切换）';
      } else if (sortBy === 'color') {
        btn.title = sortDirection.color === 'asc' ? '按颜色 红→紫（点击切换）' : '按颜色 紫→红（点击切换）';
      }
    } else {
      btn.classList.remove('active');
      
      // 恢复默认提示
      if (sortBy === 'name') btn.title = '按名称排序';
      else if (sortBy === 'time') btn.title = '按时间排序';
      else if (sortBy === 'domain') btn.title = '按域名排序';
      else if (sortBy === 'custom') btn.title = '自定义排序（拖拽）';
      else if (sortBy === 'color') btn.title = '按颜色排序';
    }
  });
}

// 从书签中移除标签
async function removeTagFromBookmark(bookmarkId, tagName) {
  await Storage.removeTagFromBookmark(bookmarkId, tagName);
  await loadBookmarks();
  await loadTags();
}

// ===== 颜色选择器 =====

function showColorPicker(targetElement, bookmarkId) {
  currentColorPickerBookmark = bookmarkId;
  const picker = document.getElementById('colorPicker');
  
  // 获取按钮位置
  const rect = targetElement.getBoundingClientRect();
  const pickerHeight = 280; // 颜色选择器大致高度
  const pickerWidth = 150; // 颜色选择器宽度
  
  // 计算最佳位置
  let top = rect.bottom + 5;
  let left = rect.left;
  
  // 检查是否超出底部
  if (top + pickerHeight > window.innerHeight) {
    // 显示在按钮上方
    top = rect.top - pickerHeight - 5;
  }
  
  // 检查是否超出右侧
  if (left + pickerWidth > window.innerWidth) {
    left = window.innerWidth - pickerWidth - 10;
  }
  
  // 确保不超出左侧
  if (left < 10) {
    left = 10;
  }
  
  // 确保不超出顶部
  if (top < 10) {
    top = 10;
  }
  
  picker.style.top = `${top}px`;
  picker.style.left = `${left}px`;
  picker.classList.remove('hidden');
  
  // 绑定颜色选择
  const options = picker.querySelectorAll('.color-option');
  options.forEach(option => {
    option.onclick = async () => {
      const color = option.dataset.color;
      await Storage.setBookmarkColor(bookmarkId, color);
      picker.classList.add('hidden');
      await loadBookmarks();
    };
  });
  
  // 点击外部关闭
  setTimeout(() => {
    document.addEventListener('click', closeColorPicker);
  }, 0);
}

function closeColorPicker(e) {
  const picker = document.getElementById('colorPicker');
  if (!picker.contains(e.target)) {
    picker.classList.add('hidden');
    document.removeEventListener('click', closeColorPicker);
  }
}

// ===== AI 建议 =====

async function showAISuggestions(bookmarkId) {
  const dialog = document.getElementById('aiDialog');
  const loading = document.getElementById('aiLoading');
  const suggestions = document.getElementById('aiSuggestions');
  
  dialog.classList.remove('hidden');
  loading.classList.remove('hidden');
  suggestions.classList.add('hidden');
  
  try {
    const bookmark = allBookmarks.find(b => b.id === bookmarkId);
    const existingTags = await Storage.getTags();
    
    const suggestedTags = await AI.getSuggestedTags(bookmark, existingTags);
    
    if (suggestedTags.length > 0) {
      suggestions.innerHTML = `
        <p>AI 建议以下标签：</p>
        <div class="ai-tags">
          ${suggestedTags.map(tag => `
            <button class="ai-tag-btn" data-tag="${escapeHtml(tag)}" data-bookmark-id="${bookmarkId}">
              ${escapeHtml(tag)}
            </button>
          `).join('')}
        </div>
      `;
      
      // 绑定点击添加
      suggestions.querySelectorAll('.ai-tag-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const tag = btn.dataset.tag;
          const bid = btn.dataset.bookmarkId;
          await Storage.addTagToBookmark(bid, tag);
          btn.disabled = true;
          btn.textContent = '✓ ' + btn.textContent;
          await loadBookmarks();
          await loadTags();
        });
      });
      
      suggestions.classList.remove('hidden');
    } else {
      suggestions.innerHTML = '<p>AI 未能生成标签建议</p>';
      suggestions.classList.remove('hidden');
    }
  } catch (error) {
    suggestions.innerHTML = `<p class="error">AI 分析失败: ${error.message}</p>`;
    suggestions.classList.remove('hidden');
  } finally {
    loading.classList.add('hidden');
  }
}

// ===== 对话框 =====

function initDialogs() {
  // AI 对话框
  document.getElementById('closeAIDialog').addEventListener('click', () => {
    document.getElementById('aiDialog').classList.add('hidden');
  });
}

// ===== 新建标签对话框 =====

function initCreateTagDialog() {
  const dialog = document.getElementById('createTagDialog');
  const tabs = document.querySelectorAll('.create-tag-tab');
  const singleTab = document.getElementById('singleCreateTab');
  const batchTab = document.getElementById('batchCreateTab');
  
  // 标签页切换
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      if (tab.dataset.tab === 'single') {
        singleTab.classList.remove('hidden');
        batchTab.classList.add('hidden');
      } else {
        singleTab.classList.add('hidden');
        batchTab.classList.remove('hidden');
      }
    });
  });
  
  // 单个创建
  document.getElementById('confirmSingleCreate').addEventListener('click', async () => {
    const tagName = document.getElementById('singleTagName').value.trim();
    if (!tagName) {
      alert('请输入标签名称');
      return;
    }
    
    try {
      await Storage.saveTag(tagName);
      await loadTags();
      closeCreateTagDialog();
      showToast(`标签 "${tagName}" 创建成功`);
    } catch (error) {
      console.error('创建标签失败:', error);
      alert('创建标签失败，请重试');
    }
  });
  
  document.getElementById('cancelSingleCreate').addEventListener('click', closeCreateTagDialog);
  
  // 批量创建
  const batchInput = document.getElementById('batchTagNames');
  const batchCount = document.getElementById('batchCount');
  
  batchInput.addEventListener('input', () => {
    const lines = batchInput.value.split('\n').filter(line => line.trim());
    batchCount.textContent = lines.length;
  });
  
  document.getElementById('confirmBatchCreate').addEventListener('click', async () => {
    const lines = batchInput.value.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      alert('请输入至少一个标签名称');
      return;
    }
    
    try {
      for (const tagName of lines) {
        await Storage.saveTag(tagName);
      }
      await loadTags();
      closeCreateTagDialog();
      showToast(`成功创建 ${lines.length} 个标签`);
    } catch (error) {
      console.error('批量创建标签失败:', error);
      alert('批量创建标签失败，请重试');
    }
  });
  
  document.getElementById('cancelBatchCreate').addEventListener('click', closeCreateTagDialog);
  
  // 关闭对话框
  document.getElementById('closeCreateTagDialog').addEventListener('click', closeCreateTagDialog);
  
  // 点击背景关闭
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeCreateTagDialog();
    }
  });
}

function showCreateTagDialog() {
  const dialog = document.getElementById('createTagDialog');
  
  // 重置表单
  document.getElementById('singleTagName').value = '';
  document.getElementById('batchTagNames').value = '';
  document.getElementById('batchCount').textContent = '0';
  
  // 显示单个创建标签页
  document.querySelectorAll('.create-tag-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.create-tag-tab[data-tab="single"]').classList.add('active');
  document.getElementById('singleCreateTab').classList.remove('hidden');
  document.getElementById('batchCreateTab').classList.add('hidden');
  
  dialog.classList.remove('hidden');
}

function closeCreateTagDialog() {
  document.getElementById('createTagDialog').classList.add('hidden');
}

// ===== 编辑标签对话框 =====

function initEditTagDialog() {
  const dialog = document.getElementById('editTagDialog');
  
  // 关闭对话框
  document.getElementById('closeEditTagDialog').addEventListener('click', closeEditTagDialog);
  
  // 取消按钮
  document.getElementById('cancelEditTag').addEventListener('click', closeEditTagDialog);
  
  // 保存按钮
  document.getElementById('confirmEditTag').addEventListener('click', async () => {
    const newTagName = document.getElementById('editTagName').value.trim();
    if (!newTagName) {
      alert('请输入标签名称');
      return;
    }
    
    if (newTagName === editingTag) {
      // 名称未改变，只关闭对话框
      closeEditTagDialog();
      return;
    }
    
    try {
      // 重命名标签
      await renameTag(editingTag, newTagName);
      closeEditTagDialog();
      showToast(`标签已更新为 "${newTagName}"`);
    } catch (error) {
      console.error('编辑标签失败:', error);
      alert('编辑标签失败，请重试');
    }
  });
  
  // 点击背景关闭
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeEditTagDialog();
    }
  });
}

function showEditTagDialog(tagName) {
  try {
    console.log(`显示编辑标签对话框: ${tagName}`);
    
    if (!tagName) {
      console.error('标签名称不能为空');
      alert('标签名称不能为空');
      return;
    }
    
    editingTag = tagName;
    const inputElement = document.getElementById('editTagName');
    const dialogElement = document.getElementById('editTagDialog');
    
    if (!inputElement || !dialogElement) {
      console.error('找不到编辑标签对话框元素');
      alert('编辑功能初始化失败');
      return;
    }
    
    inputElement.value = tagName;
    dialogElement.classList.remove('hidden');
    
    // 聚焦到输入框并选中文本
    setTimeout(() => {
      inputElement.focus();
      inputElement.select();
    }, 100);
    
    console.log(`编辑标签对话框已打开: ${tagName}`);
  } catch (error) {
    console.error('显示编辑标签对话框失败:', error);
    alert('打开编辑对话框失败，请重试');
  }
}

function closeEditTagDialog() {
  try {
    console.log(`关闭编辑标签对话框: ${editingTag}`);
    
    const dialogElement = document.getElementById('editTagDialog');
    if (dialogElement) {
      dialogElement.classList.add('hidden');
    }
    
    editingTag = null;
    console.log('编辑标签对话框已关闭');
  } catch (error) {
    console.error('关闭编辑标签对话框失败:', error);
  }
}

// 重命名标签
async function renameTag(oldName, newName) {
  try {
    console.log(`开始重命名标签: "${oldName}" → "${newName}"`);
    
    if (!oldName || !newName) {
      throw new Error('标签名称不能为空');
    }
    
    if (newName === oldName) {
      console.log('标签名称未改变，跳过重命名');
      return;
    }
    
    // 检查新名称是否已存在
    const existingTags = await Storage.getTags();
    if (existingTags.includes(newName)) {
      throw new Error(`标签 "${newName}" 已存在`);
    }
    
    console.log(`查找使用标签 "${oldName}" 的书签...`);
    
    // 更新所有使用该标签的书签
    let updatedCount = 0;
    for (const bookmark of allBookmarks) {
      if (bookmark.tags && bookmark.tags.includes(oldName)) {
        console.log(`更新书签 [${bookmark.title}] 的标签`);
        await Storage.removeTagFromBookmark(bookmark.id, oldName);
        await Storage.addTagToBookmark(bookmark.id, newName);
        updatedCount++;
      }
    }
    
    console.log(`共更新了 ${updatedCount} 个书签的标签`);
    
    // 更新标签顺序
    const index = tagOrder.indexOf(oldName);
    if (index > -1) {
      tagOrder[index] = newName;
      await saveSettings();
      console.log(`已更新标签顺序: 位置 ${index}`);
    }
    
    // 刷新显示
    await loadBookmarks();
    await loadTags();
    
    console.log(`标签重命名完成: "${oldName}" → "${newName}"`);
  } catch (error) {
    console.error('重命名标签失败:', error);
    alert(`重命名标签失败: ${error.message}`);
    throw error;
  }
}


// ===== 工具函数 =====

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
  return colors[color] || 'transparent';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
