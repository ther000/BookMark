// 书签导入导出模块

const ImportExport = {
  /**
   * 导出书签为JSON格式
   * @param {Array} bookmarks - 书签列表（包含元数据）
   * @param {Array} tags - 标签列表
   * @returns {Object}
   */
  exportToJSON(bookmarks, tags) {
    const exportData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      bookmarks: bookmarks.map(b => ({
        id: b.id,
        title: b.title,
        url: b.url,
        tags: b.tags || [],
        color: b.color || '',
        dateAdded: b.dateAdded,
        parentId: b.parentId
      })),
      tags: tags,
      metadata: {
        totalBookmarks: bookmarks.length,
        totalTags: tags.length
      }
    };
    
    return exportData;
  },

  /**
   * 导出为HTML书签文件格式（Chrome/Firefox兼容）
   * @param {Array} bookmarks - 书签列表
   * @returns {string}
   */
  exportToHTML(bookmarks) {
    const now = Math.floor(Date.now() / 1000);
    
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${now}" LAST_MODIFIED="${now}">导出的书签</H3>
    <DL><p>
`;

    bookmarks.forEach(bookmark => {
      const addDate = bookmark.dateAdded ? Math.floor(bookmark.dateAdded / 1000) : now;
      const tags = bookmark.tags && bookmark.tags.length > 0 ? bookmark.tags.join(',') : '';
      const color = bookmark.color || '';
      
      // 使用TAGS属性保存标签，使用ICON_URI保存颜色（非标准但有效）
      html += `        <DT><A HREF="${this.escapeHtml(bookmark.url)}" ADD_DATE="${addDate}"`;
      if (tags) html += ` TAGS="${this.escapeHtml(tags)}"`;
      if (color) html += ` COLOR="${this.escapeHtml(color)}"`;
      html += `>${this.escapeHtml(bookmark.title)}</A>\n`;
    });

    html += `    </DL><p>
</DL><p>
`;
    
    return html;
  },

  /**
   * 从JSON导入书签
   * @param {Object} data - JSON数据
   * @returns {Object} - { bookmarks, tags, errors }
   */
  importFromJSON(data) {
    const errors = [];
    const bookmarks = [];
    const tags = [];

    try {
      // 验证数据格式
      if (!data || typeof data !== 'object') {
        throw new Error('无效的JSON格式');
      }

      // 导入标签
      if (Array.isArray(data.tags)) {
        data.tags.forEach(tag => {
          if (typeof tag === 'string' && tag.trim()) {
            tags.push(tag.trim());
          }
        });
      }

      // 导入书签
      if (Array.isArray(data.bookmarks)) {
        data.bookmarks.forEach((item, index) => {
          try {
            // 验证必需字段
            if (!item.url || !Utils.isValidUrl(item.url)) {
              errors.push(`书签 #${index + 1}: 无效的URL - ${item.url || '(空)'}`);
              return;
            }

            bookmarks.push({
              title: Utils.sanitizeTitle(item.title || ''),
              url: item.url,
              tags: Array.isArray(item.tags) ? item.tags.filter(t => Utils.isValidTag(t)) : [],
              color: this.validateColor(item.color),
              dateAdded: item.dateAdded || Date.now(),
              parentId: item.parentId || '1'
            });
          } catch (err) {
            errors.push(`书签 #${index + 1}: ${err.message}`);
          }
        });
      }

      return { bookmarks, tags, errors };
    } catch (err) {
      return { bookmarks: [], tags: [], errors: [err.message] };
    }
  },

  /**
   * 从HTML导入书签
   * @param {string} html - HTML内容
   * @returns {Object} - { bookmarks, tags, errors }
   */
  importFromHTML(html) {
    const errors = [];
    const bookmarks = [];
    const tagsSet = new Set();

    try {
      // 创建临时DOM解析HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // 查找所有书签链接
      const links = doc.querySelectorAll('a[href]');
      
      links.forEach((link, index) => {
        try {
          const url = link.getAttribute('href');
          const title = link.textContent.trim();
          
          // 验证URL
          if (!url || !Utils.isValidUrl(url)) {
            errors.push(`书签 #${index + 1}: 无效的URL - ${url || '(空)'}`);
            return;
          }

          // 提取标签（从TAGS属性）
          const tagsAttr = link.getAttribute('tags') || '';
          const tags = tagsAttr.split(',').filter(t => t.trim()).map(t => t.trim());
          
          // 提取颜色（从COLOR属性）
          const color = this.validateColor(link.getAttribute('color') || '');
          
          // 提取添加日期
          const addDateStr = link.getAttribute('add_date');
          const dateAdded = addDateStr ? parseInt(addDateStr) * 1000 : Date.now();

          bookmarks.push({
            title: Utils.sanitizeTitle(title || url),
            url: url,
            tags: tags,
            color: color,
            dateAdded: dateAdded,
            parentId: '1'
          });

          // 收集所有标签
          tags.forEach(tag => tagsSet.add(tag));
        } catch (err) {
          errors.push(`书签 #${index + 1}: ${err.message}`);
        }
      });

      return {
        bookmarks,
        tags: Array.from(tagsSet),
        errors
      };
    } catch (err) {
      return {
        bookmarks: [],
        tags: [],
        errors: [err.message]
      };
    }
  },

  /**
   * 执行导入操作（创建Chrome书签并保存元数据）
   * @param {Array} bookmarks - 要导入的书签
   * @param {Object} options - 选项
   * @returns {Promise<Object>} - { success, failed, errors }
   */
  async performImport(bookmarks, options = {}) {
    const {
      parentId = '1', // 默认导入到书签栏
      skipDuplicates = true, // 跳过重复URL
      mergeMode = 'skip' // 'skip', 'overwrite', 'merge'
    } = options;

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    try {
      // 获取现有书签
      const existingBookmarks = await Storage.getAllBookmarks();
      const existingUrls = new Set(existingBookmarks.map(b => Utils.normalizeUrl(b.url)));

      for (const bookmark of bookmarks) {
        try {
          const normalizedUrl = Utils.normalizeUrl(bookmark.url);
          
          // 检查重复
          if (skipDuplicates && existingUrls.has(normalizedUrl)) {
            results.skipped++;
            continue;
          }

          // 创建Chrome书签
          const created = await chrome.bookmarks.create({
            parentId: parentId,
            title: bookmark.title,
            url: bookmark.url
          });

          // 保存元数据（标签和颜色）
          if (bookmark.tags?.length > 0 || bookmark.color) {
            await Storage.saveBookmarkMeta(created.id, {
              tags: bookmark.tags || [],
              color: bookmark.color || ''
            });

            // 保存标签到标签列表
            for (const tag of bookmark.tags || []) {
              await Storage.saveTag(tag);
            }
          }

          results.success++;
        } catch (err) {
          results.failed++;
          results.errors.push(`导入失败: ${bookmark.title} - ${err.message}`);
        }
      }

      return results;
    } catch (err) {
      results.errors.push(`导入过程出错: ${err.message}`);
      return results;
    }
  },

  /**
   * 执行导出操作
   * @param {Array} bookmarks - 书签列表
   * @param {Array} tags - 标签列表
   * @param {string} format - 导出格式: 'json' 或 'html'
   */
  performExport(bookmarks, tags, format = 'json') {
    try {
      let content, filename, mimeType;

      if (format === 'json') {
        const data = this.exportToJSON(bookmarks, tags);
        content = JSON.stringify(data, null, 2);
        filename = `bookmarks_${this.getDateString()}.json`;
        mimeType = 'application/json';
      } else if (format === 'html') {
        content = this.exportToHTML(bookmarks);
        filename = `bookmarks_${this.getDateString()}.html`;
        mimeType = 'text/html';
      } else {
        throw new Error('不支持的导出格式');
      }

      // 下载文件
      Utils.downloadFile(content, filename, mimeType);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * 导出选中的书签
   * @param {Array<string>} bookmarkIds - 书签ID列表
   * @param {Array} allBookmarks - 所有书签
   * @param {Array} tags - 标签列表
   * @param {string} format - 导出格式
   */
  exportSelected(bookmarkIds, allBookmarks, tags, format = 'json') {
    const selected = allBookmarks.filter(b => bookmarkIds.includes(b.id));
    
    // 提取选中书签使用的标签
    const usedTags = new Set();
    selected.forEach(b => {
      (b.tags || []).forEach(tag => usedTags.add(tag));
    });
    
    const filteredTags = tags.filter(tag => usedTags.has(tag));
    
    return this.performExport(selected, filteredTags, format);
  },

  /**
   * 按标签导出
   * @param {string} tag - 标签名
   * @param {Array} allBookmarks - 所有书签
   * @param {Array} tags - 标签列表
   * @param {string} format - 导出格式
   */
  exportByTag(tag, allBookmarks, tags, format = 'json') {
    const filtered = allBookmarks.filter(b => 
      b.tags && b.tags.includes(tag)
    );
    
    return this.performExport(filtered, [tag], format);
  },

  // ===== 辅助函数 =====

  /**
   * 验证颜色值
   * @param {string} color - 颜色值
   * @returns {string}
   */
  validateColor(color) {
    const validColors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
    return validColors.includes(color) ? color : '';
  },

  /**
   * 转义HTML
   * @param {string} str - 输入字符串
   * @returns {string}
   */
  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * 获取日期字符串（用于文件名）
   * @returns {string}
   */
  getDateString() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  },

  /**
   * 检测文件类型
   * @param {File} file - 文件对象
   * @returns {string} - 'json' 或 'html'
   */
  detectFileType(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.json')) return 'json';
    if (name.endsWith('.html') || name.endsWith('.htm')) return 'html';
    
    // 根据MIME类型判断
    if (file.type === 'application/json') return 'json';
    if (file.type === 'text/html') return 'html';
    
    return 'unknown';
  },

  /**
   * 合并书签（处理重复）
   * @param {Array} existing - 现有书签
   * @param {Array} incoming - 导入的书签
   * @param {string} strategy - 合并策略: 'skip', 'overwrite', 'merge'
   * @returns {Array}
   */
  mergeBookmarks(existing, incoming, strategy = 'skip') {
    const urlMap = new Map();
    
    // 先添加现有书签
    existing.forEach(b => {
      const normalizedUrl = Utils.normalizeUrl(b.url);
      urlMap.set(normalizedUrl, b);
    });

    // 处理导入的书签
    incoming.forEach(b => {
      const normalizedUrl = Utils.normalizeUrl(b.url);
      
      if (!urlMap.has(normalizedUrl)) {
        // 新书签，直接添加
        urlMap.set(normalizedUrl, b);
      } else if (strategy === 'overwrite') {
        // 覆盖现有书签
        urlMap.set(normalizedUrl, b);
      } else if (strategy === 'merge') {
        // 合并标签和保留较新的数据
        const existingBookmark = urlMap.get(normalizedUrl);
        const mergedTags = [...new Set([...existingBookmark.tags, ...b.tags])];
        urlMap.set(normalizedUrl, {
          ...existingBookmark,
          tags: mergedTags,
          color: b.color || existingBookmark.color,
          dateAdded: Math.min(existingBookmark.dateAdded, b.dateAdded)
        });
      }
      // strategy === 'skip' 时不做任何操作
    });

    return Array.from(urlMap.values());
  }
};

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImportExport;
}
