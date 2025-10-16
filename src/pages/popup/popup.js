// Popup 页面逻辑
// 处理快速添加书签的交互

let selectedColor = '';
let selectedTags = [];
let currentTab = null;

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentTab();
  await loadExistingTags();
  initColorPicker();
  initTagInput();
  initAISuggest();
  initFormSubmit();
  
  // 打开管理器按钮
  document.getElementById('openManager').addEventListener('click', () => {
    chrome.tabs.create({ url: 'manager.html' });
  });
  
  // 取消按钮
  document.getElementById('cancel').addEventListener('click', () => {
    window.close();
  });
});

// 加载当前标签页信息
async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  
  document.getElementById('title').value = tab.title || '';
  document.getElementById('url').value = tab.url || '';
}

// 加载现有标签
async function loadExistingTags() {
  const tags = await Storage.getTags();
  // 可以在这里显示标签建议
}

// 初始化颜色选择器
function initColorPicker() {
  const colorOptions = document.querySelectorAll('.color-option');
  
  colorOptions.forEach(option => {
    option.addEventListener('click', () => {
      // 移除其他选中状态
      colorOptions.forEach(opt => opt.classList.remove('selected'));
      
      // 添加选中状态
      option.classList.add('selected');
      selectedColor = option.dataset.color;
    });
  });
  
  // 默认选中无颜色
  colorOptions[0].classList.add('selected');
}

// 初始化标签输入
function initTagInput() {
  const tagInput = document.getElementById('tagInput');
  const selectedTagsContainer = document.getElementById('selectedTags');
  const suggestionsContainer = document.getElementById('tagSuggestions');
  
  // 按回车添加标签
  tagInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tagName = tagInput.value.trim();
      
      if (tagName && !selectedTags.includes(tagName)) {
        selectedTags.push(tagName);
        await Storage.saveTag(tagName);
        renderSelectedTags();
        tagInput.value = '';
        suggestionsContainer.innerHTML = '';
      }
    }
  });
  
  // 输入时显示建议
  tagInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim().toLowerCase();
    
    if (query) {
      const allTags = await Storage.getTags();
      const suggestions = allTags
        .filter(tag => 
          tag.toLowerCase().includes(query) && 
          !selectedTags.includes(tag)
        )
        .slice(0, 5);
      
      renderTagSuggestions(suggestions);
    } else {
      suggestionsContainer.innerHTML = '';
    }
  });
  
  // 渲染选中的标签
  function renderSelectedTags() {
    selectedTagsContainer.innerHTML = selectedTags.map(tag => `
      <div class="tag-chip">
        <span>${tag}</span>
        <button type="button" class="tag-remove" data-tag="${tag}">×</button>
      </div>
    `).join('');
    
    // 绑定删除事件
    selectedTagsContainer.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        selectedTags = selectedTags.filter(t => t !== tag);
        renderSelectedTags();
      });
    });
  }
  
  // 渲染标签建议
  function renderTagSuggestions(suggestions) {
    if (suggestions.length === 0) {
      suggestionsContainer.innerHTML = '';
      return;
    }
    
    suggestionsContainer.innerHTML = suggestions.map(tag => `
      <div class="tag-suggestion" data-tag="${tag}">${tag}</div>
    `).join('');
    
    // 绑定点击事件
    suggestionsContainer.querySelectorAll('.tag-suggestion').forEach(item => {
      item.addEventListener('click', () => {
        const tag = item.dataset.tag;
        if (!selectedTags.includes(tag)) {
          selectedTags.push(tag);
          renderSelectedTags();
          tagInput.value = '';
          suggestionsContainer.innerHTML = '';
        }
      });
    });
  }
}

// 初始化 AI 建议
function initAISuggest() {
  const aiBtn = document.getElementById('aiSuggest');
  const aiLoading = document.getElementById('aiLoading');
  const aiSuggestions = document.getElementById('aiSuggestions');
  
  aiBtn.addEventListener('click', async () => {
    try {
      // 显示加载状态
      aiBtn.disabled = true;
      aiLoading.classList.remove('hidden');
      aiSuggestions.classList.add('hidden');
      
      // 获取页面元信息
      const metadata = await AI.getPageMetadata(currentTab.id);
      
      // 构建书签对象
      const bookmark = {
        title: document.getElementById('title').value,
        url: document.getElementById('url').value,
        description: metadata.description
      };
      
      // 获取现有标签
      const existingTags = await Storage.getTags();
      
      // 调用 AI API
      const suggestedTags = await AI.getSuggestedTags(bookmark, existingTags);
      
      // 显示建议
      if (suggestedTags.length > 0) {
        renderAISuggestions(suggestedTags);
      } else {
        showMessage('AI 未能生成标签建议', 'warning');
      }
    } catch (error) {
      showMessage(`AI 分析失败: ${error.message}`, 'error');
    } finally {
      aiBtn.disabled = false;
      aiLoading.classList.add('hidden');
    }
  });
  
  // 渲染 AI 建议
  function renderAISuggestions(suggestions) {
    aiSuggestions.innerHTML = `
      <div class="ai-suggestions-header">
        <span>AI 建议标签：</span>
        <button type="button" id="acceptAll" class="accept-all">全部采纳</button>
      </div>
      <div class="ai-tags">
        ${suggestions.map(tag => `
          <div class="ai-tag" data-tag="${tag}">
            <span>${tag}</span>
            <button type="button" class="ai-tag-add">+</button>
          </div>
        `).join('')}
      </div>
    `;
    
    aiSuggestions.classList.remove('hidden');
    
    // 绑定添加单个标签
    aiSuggestions.querySelectorAll('.ai-tag-add').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tag = btn.closest('.ai-tag').dataset.tag;
        if (!selectedTags.includes(tag)) {
          selectedTags.push(tag);
          await Storage.saveTag(tag);
          document.querySelector(`#selectedTags`).innerHTML += `
            <div class="tag-chip">
              <span>${tag}</span>
              <button type="button" class="tag-remove" data-tag="${tag}">×</button>
            </div>
          `;
          btn.closest('.ai-tag').remove();
        }
      });
    });
    
    // 绑定全部采纳
    document.getElementById('acceptAll').addEventListener('click', async () => {
      for (const tag of suggestions) {
        if (!selectedTags.includes(tag)) {
          selectedTags.push(tag);
          await Storage.saveTag(tag);
        }
      }
      
      // 重新渲染选中标签
      const selectedTagsContainer = document.getElementById('selectedTags');
      selectedTagsContainer.innerHTML = selectedTags.map(tag => `
        <div class="tag-chip">
          <span>${tag}</span>
          <button type="button" class="tag-remove" data-tag="${tag}">×</button>
        </div>
      `).join('');
      
      aiSuggestions.classList.add('hidden');
    });
  }
}

// 初始化表单提交
function initFormSubmit() {
  const form = document.getElementById('bookmarkForm');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
      const title = document.getElementById('title').value.trim();
      const url = document.getElementById('url').value.trim();
      
      if (!title || !url) {
        showMessage('请填写标题和 URL', 'error');
        return;
      }
      
      const bookmark = {
        title,
        url,
        domain: Storage.getDomain(url),
        favicon: Storage.getFaviconUrl(url),
        color: selectedColor,
        tags: selectedTags
      };
      
      await Storage.saveBookmark(bookmark);
      showMessage('书签保存成功！', 'success');
      
      // 延迟关闭窗口
      setTimeout(() => {
        window.close();
      }, 1000);
    } catch (error) {
      showMessage(`保存失败: ${error.message}`, 'error');
    }
  });
}

// 显示消息
function showMessage(text, type = 'info') {
  const messageEl = document.getElementById('message');
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.classList.remove('hidden');
  
  setTimeout(() => {
    messageEl.classList.add('hidden');
  }, 3000);
}
