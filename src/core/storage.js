// 数据存储和管理模块
// 处理 Chrome 书签、标签和颜色元数据的管理

const Storage = {
  // 生成唯一ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // ===== Chrome 书签 API 相关 =====
  
  // 获取所有书签（扁平化）
  async getAllBookmarks() {
    const tree = await chrome.bookmarks.getTree();
    const bookmarks = [];
    
    function traverse(nodes) {
      for (const node of nodes) {
        if (node.url) {
          bookmarks.push({
            id: node.id,
            title: node.title,
            url: node.url,
            dateAdded: node.dateAdded,
            parentId: node.parentId
          });
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    }
    
    traverse(tree);
    return bookmarks;
  },

  // 搜索书签
  async searchBookmarks(query) {
    const results = await chrome.bookmarks.search(query);
    return results.filter(item => item.url); // 只返回有 URL 的书签
  },

  // 创建书签（使用 Chrome API）
  async createBookmark(title, url, parentId) {
    return await chrome.bookmarks.create({
      title,
      url,
      parentId: parentId || '1' // 默认添加到书签栏
    });
  },

  // 更新书签
  async updateBookmark(id, changes) {
    return await chrome.bookmarks.update(id, changes);
  },

  // 删除书签
  async deleteBookmark(id) {
    await chrome.bookmarks.remove(id);
    // 同时删除元数据
    await this.deleteBookmarkMetadata(id);
  },

  // ===== 书签元数据（标签和颜色）=====
  
  // 迁移数据从 sync 到 local storage（一次性迁移）
  async migrateMetadataToLocal() {
    try {
      // 检查是否已迁移
      const localResult = await chrome.storage.local.get(['bookmarkMetadata', 'migrated']);
      if (localResult.migrated) {
        return; // 已经迁移过了
      }

      // 从 sync storage 读取旧数据
      const syncResult = await chrome.storage.sync.get(['bookmarkMetadata']);
      if (syncResult.bookmarkMetadata && Object.keys(syncResult.bookmarkMetadata).length > 0) {
        // 迁移到 local storage
        await chrome.storage.local.set({ 
          bookmarkMetadata: syncResult.bookmarkMetadata,
          migrated: true
        });
        console.log('✅ Successfully migrated bookmarkMetadata to local storage');
        
        // 可选：清除 sync storage 中的旧数据（小心执行）
        // await chrome.storage.sync.remove(['bookmarkMetadata']);
      } else {
        // 没有旧数据，标记为已迁移
        await chrome.storage.local.set({ migrated: true });
      }
    } catch (error) {
      console.error('❌ Migration failed:', error);
    }
  },
  
  // 获取所有书签元数据
  async getBookmarkMetadata() {
    // 使用 local storage 而非 sync，避免配额限制
    const result = await chrome.storage.local.get(['bookmarkMetadata']);
    return result.bookmarkMetadata || {};
  },

  // 获取单个书签的元数据
  async getBookmarkMeta(bookmarkId) {
    const metadata = await this.getBookmarkMetadata();
    return metadata[bookmarkId] || { tags: [], color: '' };
  },

  // 保存书签元数据
  async saveBookmarkMeta(bookmarkId, meta) {
    const metadata = await this.getBookmarkMetadata();
    metadata[bookmarkId] = {
      tags: meta.tags || [],
      color: meta.color || '',
      updatedAt: new Date().toISOString()
    };
    await chrome.storage.local.set({ bookmarkMetadata: metadata });
  },

  // 删除书签元数据
  async deleteBookmarkMetadata(bookmarkId) {
    const metadata = await this.getBookmarkMetadata();
    delete metadata[bookmarkId];
    await chrome.storage.local.set({ bookmarkMetadata: metadata });
  },

  // 为书签添加标签
  async addTagToBookmark(bookmarkId, tag) {
    const meta = await this.getBookmarkMeta(bookmarkId);
    if (!meta.tags.includes(tag)) {
      meta.tags.push(tag);
      await this.saveBookmarkMeta(bookmarkId, meta);
      await this.saveTag(tag); // 确保标签存在于标签列表
    }
  },

  // 从书签移除标签
  async removeTagFromBookmark(bookmarkId, tag) {
    const meta = await this.getBookmarkMeta(bookmarkId);
    meta.tags = meta.tags.filter(t => t !== tag);
    await this.saveBookmarkMeta(bookmarkId, meta);
  },

  // 设置书签颜色
  async setBookmarkColor(bookmarkId, color) {
    const meta = await this.getBookmarkMeta(bookmarkId);
    meta.color = color;
    await this.saveBookmarkMeta(bookmarkId, meta);
  },

  // 获取带元数据的完整书签列表
  async getBookmarksWithMetadata() {
    const bookmarks = await this.getAllBookmarks();
    const metadata = await this.getBookmarkMetadata();
    
    return bookmarks.map(bookmark => ({
      ...bookmark,
      domain: this.getDomain(bookmark.url),
      favicon: this.getFaviconUrl(bookmark.url),
      tags: metadata[bookmark.id]?.tags || [],
      color: metadata[bookmark.id]?.color || ''
    }));
  },

  // ===== 标签管理 =====
  
  // 获取所有标签
  async getTags() {
    const result = await chrome.storage.sync.get(['tags']);
    return result.tags || [];
  },

  // 保存标签
  async saveTag(tagName) {
    const tags = await this.getTags();
    
    if (!tags.includes(tagName)) {
      tags.push(tagName);
      await chrome.storage.sync.set({ tags });
    }
    
    return tags;
  },

  async saveTagsBulk(tagNames = []) {
    const tags = await this.getTags();
    const updated = [...tags];
    const addedTags = [];

    tagNames.forEach(tagName => {
      if (typeof tagName !== 'string') return;
      const trimmed = tagName.trim();
      if (!trimmed) return;
      if (!updated.includes(trimmed)) {
        updated.push(trimmed);
        addedTags.push(trimmed);
      }
    });

    if (addedTags.length > 0) {
      await chrome.storage.sync.set({ tags: updated });
    }

    return { updatedTags: updated, addedTags };
  },

  // 删除标签
  async deleteTag(tagName) {
    const tags = await this.getTags();
    const filtered = tags.filter(t => t !== tagName);
    await chrome.storage.sync.set({ tags: filtered });
    
    // 从所有书签元数据中移除该标签
    const metadata = await this.getBookmarkMetadata();
    for (const bookmarkId in metadata) {
      if (metadata[bookmarkId].tags) {
        metadata[bookmarkId].tags = metadata[bookmarkId].tags.filter(t => t !== tagName);
      }
    }
    await chrome.storage.local.set({ bookmarkMetadata: metadata });
  },

  async clearAllTags() {
    const metadata = await this.getBookmarkMetadata();
    let metadataChanged = false;

    for (const bookmarkId in metadata) {
      if (Array.isArray(metadata[bookmarkId].tags) && metadata[bookmarkId].tags.length > 0) {
        metadata[bookmarkId].tags = [];
        metadataChanged = true;
      }
    }

    await chrome.storage.sync.set({ tags: [] });
    if (metadataChanged) {
      await chrome.storage.local.set({ bookmarkMetadata: metadata });
    }
  },

  // 从书签中移除单个标签
  async removeTagFromBookmark(bookmarkId, tagName) {
    const meta = await this.getBookmarkMeta(bookmarkId);
    if (meta.tags) {
      meta.tags = meta.tags.filter(t => t !== tagName);
      await this.saveBookmarkMeta(bookmarkId, meta);
    }
  },

  // 重命名标签
  async renameTag(oldName, newName) {
    const tags = await this.getTags();
    const index = tags.indexOf(oldName);
    
    if (index >= 0 && !tags.includes(newName)) {
      tags[index] = newName;
      await chrome.storage.sync.set({ tags });
      
      // 更新所有书签元数据中的标签名
      const metadata = await this.getBookmarkMetadata();
      for (const bookmarkId in metadata) {
        if (metadata[bookmarkId].tags) {
          metadata[bookmarkId].tags = metadata[bookmarkId].tags.map(t => 
            t === oldName ? newName : t
          );
        }
      }
      await chrome.storage.local.set({ bookmarkMetadata: metadata });
    }
  },

  // ===== 书签去重功能 =====
  
  /**
   * 检测重复的书签
   * @returns {Object} 包含重复URL及其书签列表的对象
   */
  async findDuplicateBookmarks() {
    const bookmarks = await this.getAllBookmarks();
    const urlMap = new Map();
    const duplicates = {};

    // 按 URL 分组
    bookmarks.forEach(bookmark => {
      if (!bookmark.url) return;
      
      const normalizedUrl = this.normalizeUrl(bookmark.url);
      if (!urlMap.has(normalizedUrl)) {
        urlMap.set(normalizedUrl, []);
      }
      urlMap.get(normalizedUrl).push(bookmark);
    });

    // 找出重复项（URL 相同的书签超过1个）
    urlMap.forEach((bookmarkList, url) => {
      if (bookmarkList.length > 1) {
        duplicates[url] = bookmarkList.map(b => ({
          id: b.id,
          title: b.title,
          url: b.url,
          dateAdded: b.dateAdded,
          parentId: b.parentId
        }));
      }
    });

    return duplicates;
  },

  /**
   * 标准化URL用于比较
   * @param {string} url 
   * @returns {string} 标准化后的URL
   */
  normalizeUrl(url) {
    if (!url) return '';
    
    try {
      const urlObj = new URL(url);
      // 移除协议、www前缀、末尾斜杠、查询参数和片段标识符
      let normalized = urlObj.hostname.replace(/^www\./, '') + urlObj.pathname;
      normalized = normalized.replace(/\/$/, ''); // 移除末尾斜杠
      return normalized.toLowerCase();
    } catch (e) {
      // 如果URL解析失败，返回原始URL的小写版本
      return url.toLowerCase().trim();
    }
  },

  /**
   * 合并重复书签的元数据
   * @param {Array} bookmarkIds - 要合并的书签ID数组
   * @param {string} keepId - 保留的书签ID
   */
  async mergeDuplicateMetadata(bookmarkIds, keepId) {
    if (!Array.isArray(bookmarkIds) || bookmarkIds.length < 2) {
      return;
    }

    const metadata = await this.getBookmarkMetadata();
    const mergedTags = new Set();
    let mergedColor = '';

    // 收集所有重复书签的标签和颜色
    bookmarkIds.forEach(id => {
      const meta = metadata[id];
      if (meta) {
        if (Array.isArray(meta.tags)) {
          meta.tags.forEach(tag => mergedTags.add(tag));
        }
        if (meta.color && !mergedColor) {
          mergedColor = meta.color;
        }
      }
    });

    // 保存合并后的元数据到保留的书签
    metadata[keepId] = {
      tags: Array.from(mergedTags),
      color: mergedColor,
      updatedAt: new Date().toISOString()
    };

    // 删除其他重复书签的元数据
    bookmarkIds.forEach(id => {
      if (id !== keepId) {
        delete metadata[id];
      }
    });

    await chrome.storage.local.set({ bookmarkMetadata: metadata });
  },

  /**
   * 删除重复的书签（保留一个）
   * @param {Array} bookmarkIds - 重复的书签ID数组
   * @param {string} keepId - 要保留的书签ID
   */
  async removeDuplicateBookmarks(bookmarkIds, keepId) {
    if (!Array.isArray(bookmarkIds) || bookmarkIds.length < 2) {
      return { success: 0, failed: 0 };
    }

    // 先合并元数据
    await this.mergeDuplicateMetadata(bookmarkIds, keepId);

    let success = 0;
    let failed = 0;

    // 删除除了 keepId 之外的所有书签
    for (const id of bookmarkIds) {
      if (id === keepId) continue;
      
      try {
        await chrome.bookmarks.remove(id);
        success++;
      } catch (error) {
        console.error(`Failed to remove bookmark ${id}:`, error);
        failed++;
      }
    }

    return { success, failed };
  },

  /**
   * 自动去重：保留最新的书签
   * @param {Object} duplicates - findDuplicateBookmarks 返回的重复书签对象
   * @returns {Object} 删除结果统计
   */
  async autoDeduplicateBookmarks(duplicates) {
    if (!duplicates || Object.keys(duplicates).length === 0) {
      return { totalGroups: 0, totalRemoved: 0, totalFailed: 0 };
    }

    let totalRemoved = 0;
    let totalFailed = 0;
    const totalGroups = Object.keys(duplicates).length;

    for (const url in duplicates) {
      const bookmarkList = duplicates[url];
      if (bookmarkList.length < 2) continue;

      // 按添加时间排序，保留最新的
      const sorted = bookmarkList.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      const keepId = sorted[0].id;
      const removeIds = sorted.slice(1).map(b => b.id);

      const result = await this.removeDuplicateBookmarks([...removeIds, keepId], keepId);
      totalRemoved += result.success;
      totalFailed += result.failed;
    }

    return { totalGroups, totalRemoved, totalFailed };
  },

  // ===== 设置管理 =====
  
  // 获取设置
  async getSettings() {
    const result = await chrome.storage.local.get(['settings']);
    return result.settings || {
      autoAITag: false,
      theme: 'auto', // 'auto', 'light', 'dark'
      aiProvider: 'openai',
      providers: {
        openai: {
          apiEndpoint: 'https://api.openai.com/v1/chat/completions',
          apiKey: '',
          model: 'gpt-3.5-turbo'
        },
        deepseek: {
          apiEndpoint: 'https://api.deepseek.com/chat/completions',
          apiKey: '',
          model: 'deepseek-chat'
        },
        custom: {
          apiEndpoint: '',
          apiKey: '',
          model: 'gpt-3.5-turbo'
        }
      }
    };
  },

  // 保存设置
  async saveSettings(settings) {
    await chrome.storage.local.set({ settings });
  },

  // 获取主题设置
  async getTheme() {
    const settings = await this.getSettings();
    return settings.theme || 'auto';
  },

  // 保存主题设置
  async saveTheme(theme) {
    const settings = await this.getSettings();
    settings.theme = theme;
    await this.saveSettings(settings);
  },

  // 应用主题到文档
  applyTheme(theme = 'auto') {
    const root = document.documentElement;
    
    if (theme === 'auto') {
      // 检测系统主题
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  },

  // 初始化主题（包含系统主题监听）
  async initTheme() {
    const theme = await this.getTheme();
    this.applyTheme(theme);

    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', async (e) => {
      const currentTheme = await this.getTheme();
      if (currentTheme === 'auto') {
        this.applyTheme('auto');
      }
    });

    return theme;
  },
  
  // 获取当前 AI 提供商配置
  async getCurrentAIConfig() {
    const settings = await this.getSettings();
    const provider = settings.aiProvider || 'openai';
    const config = settings.providers?.[provider];
    
    if (!config) {
      return {
        apiEndpoint: '',
        apiKey: '',
        model: 'gpt-3.5-turbo'
      };
    }
    
    return {
      apiEndpoint: config.apiEndpoint || '',
      apiKey: config.apiKey || '',
      model: config.model || 'gpt-3.5-turbo'
    };
  },

  // ===== 工具函数 =====
  
  // 获取域名
  getDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return '';
    }
  },

  // 获取Favicon URL
  getFaviconUrl(url) {
    try {
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch (e) {
      return '';
    }
  }
};

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
}
