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
  
  // 获取所有书签元数据
  async getBookmarkMetadata() {
    const result = await chrome.storage.sync.get(['bookmarkMetadata']);
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
    await chrome.storage.sync.set({ bookmarkMetadata: metadata });
  },

  // 删除书签元数据
  async deleteBookmarkMetadata(bookmarkId) {
    const metadata = await this.getBookmarkMetadata();
    delete metadata[bookmarkId];
    await chrome.storage.sync.set({ bookmarkMetadata: metadata });
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
    await chrome.storage.sync.set({ bookmarkMetadata: metadata });
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
      await chrome.storage.sync.set({ bookmarkMetadata: metadata });
    }
  },

  // 更新标签顺序
  async updateTagOrder(tagOrder) {
    await chrome.storage.sync.set({ tags: tagOrder });
  },

  // ===== 设置管理 =====
  
  // 获取设置
  async getSettings() {
    const result = await chrome.storage.local.get(['settings']);
    return result.settings || {
      autoAITag: false,
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
