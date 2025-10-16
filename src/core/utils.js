// 通用工具函数模块

const Utils = {
  // ===== 防抖和节流 =====
  
  /**
   * 防抖函数 - 延迟执行，多次调用只执行最后一次
   * @param {Function} func - 要防抖的函数
   * @param {number} wait - 等待时间(ms)
   * @returns {Function}
   */
  debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func.apply(this, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * 节流函数 - 限制执行频率
   * @param {Function} func - 要节流的函数
   * @param {number} limit - 时间限制(ms)
   * @returns {Function}
   */
  throttle(func, limit = 300) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  // ===== 数据验证 =====
  
  /**
   * 验证URL格式
   * @param {string} url - URL字符串
   * @returns {boolean}
   */
  isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const urlObj = new URL(url);
      return ['http:', 'https:', 'ftp:', 'file:'].includes(urlObj.protocol);
    } catch (e) {
      return false;
    }
  },

  /**
   * 验证标签名称
   * @param {string} tag - 标签名
   * @returns {boolean}
   */
  isValidTag(tag) {
    if (!tag || typeof tag !== 'string') return false;
    const trimmed = tag.trim();
    return trimmed.length >= 1 && trimmed.length <= 30;
  },

  /**
   * 清理和验证书签标题
   * @param {string} title - 书签标题
   * @returns {string}
   */
  sanitizeTitle(title) {
    if (!title || typeof title !== 'string') return '未命名书签';
    const cleaned = title.trim().replace(/\s+/g, ' ');
    return cleaned.substring(0, 200) || '未命名书签';
  },

  /**
   * 防止XSS攻击 - 转义HTML特殊字符
   * @param {string} str - 输入字符串
   * @returns {string}
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * 解码HTML实体
   * @param {string} html - HTML字符串
   * @returns {string}
   */
  unescapeHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent;
  },

  // ===== 数据处理 =====
  
  /**
   * 深度克隆对象
   * @param {any} obj - 要克隆的对象
   * @returns {any}
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (obj instanceof Object) {
      const cloned = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }
  },

  /**
   * 数组去重
   * @param {Array} arr - 输入数组
   * @param {Function} keyFunc - 获取唯一键的函数
   * @returns {Array}
   */
  uniqueBy(arr, keyFunc) {
    const seen = new Set();
    return arr.filter(item => {
      const key = keyFunc ? keyFunc(item) : item;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  /**
   * 分组数组
   * @param {Array} arr - 输入数组
   * @param {Function} keyFunc - 获取分组键的函数
   * @returns {Object}
   */
  groupBy(arr, keyFunc) {
    return arr.reduce((groups, item) => {
      const key = keyFunc(item);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
      return groups;
    }, {});
  },

  /**
   * 数组排序（保持原数组不变）
   * @param {Array} arr - 输入数组
   * @param {Function} compareFunc - 比较函数
   * @returns {Array}
   */
  sortBy(arr, compareFunc) {
    return [...arr].sort(compareFunc);
  },

  // ===== 字符串处理 =====
  
  /**
   * 高亮搜索关键词
   * @param {string} text - 原文本
   * @param {string} query - 搜索关键词
   * @returns {string} - 包含高亮标记的HTML
   */
  highlightText(text, query) {
    if (!text || !query) return this.escapeHtml(text);
    const escapedText = this.escapeHtml(text);
    const escapedQuery = this.escapeHtml(query);
    const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapedText.replace(regex, '<mark>$1</mark>');
  },

  /**
   * 截断文本
   * @param {string} text - 原文本
   * @param {number} maxLength - 最大长度
   * @param {string} suffix - 后缀
   * @returns {string}
   */
  truncate(text, maxLength = 100, suffix = '...') {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
  },

  /**
   * 提取关键词
   * @param {string} text - 文本
   * @param {number} maxKeywords - 最大关键词数
   * @returns {Array<string>}
   */
  extractKeywords(text, maxKeywords = 5) {
    if (!text) return [];
    // 简单的关键词提取：按空格分割，过滤停用词
    const stopWords = new Set(['的', '了', '和', '是', '在', '有', '我', '你', '他', '她', '它', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
    const words = text.toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word));
    
    // 统计词频
    const freq = {};
    words.forEach(word => {
      freq[word] = (freq[word] || 0) + 1;
    });
    
    // 按频率排序
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  },

  // ===== URL处理 =====
  
  /**
   * 获取域名
   * @param {string} url - URL字符串
   * @returns {string}
   */
  getDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return '';
    }
  },

  /**
   * 获取根域名
   * @param {string} url - URL字符串
   * @returns {string}
   */
  getRootDomain(url) {
    const domain = this.getDomain(url);
    const parts = domain.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return domain;
  },

  /**
   * 获取Favicon URL
   * @param {string} url - 网页URL
   * @param {number} size - 图标大小
   * @returns {string}
   */
  getFaviconUrl(url, size = 32) {
    const domain = this.getDomain(url);
    if (!domain) return '';
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  },

  /**
   * 标准化URL
   * @param {string} url - URL字符串
   * @returns {string}
   */
  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      // 移除尾部斜杠
      urlObj.pathname = urlObj.pathname.replace(/\/$/, '') || '/';
      // 排序查询参数
      urlObj.searchParams.sort();
      return urlObj.toString();
    } catch (e) {
      return url;
    }
  },

  // ===== 日期和时间 =====
  
  /**
   * 格式化日期
   * @param {Date|number} date - 日期对象或时间戳
   * @param {string} format - 格式字符串
   * @returns {string}
   */
  formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const pad = (n) => n.toString().padStart(2, '0');
    
    return format
      .replace('YYYY', d.getFullYear())
      .replace('MM', pad(d.getMonth() + 1))
      .replace('DD', pad(d.getDate()))
      .replace('HH', pad(d.getHours()))
      .replace('mm', pad(d.getMinutes()))
      .replace('ss', pad(d.getSeconds()));
  },

  /**
   * 相对时间
   * @param {Date|number} date - 日期对象或时间戳
   * @returns {string}
   */
  timeAgo(date) {
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const seconds = Math.floor((now - d) / 1000);
    
    if (seconds < 60) return '刚刚';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}天前`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}个月前`;
    return `${Math.floor(seconds / 31536000)}年前`;
  },

  // ===== 文件处理 =====
  
  /**
   * 下载文件
   * @param {string} content - 文件内容
   * @param {string} filename - 文件名
   * @param {string} mimeType - MIME类型
   */
  downloadFile(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * 读取文件
   * @param {File} file - 文件对象
   * @param {string} readAs - 读取方式: 'text', 'json', 'dataUrl'
   * @returns {Promise<any>}
   */
  readFile(file, readAs = 'text') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const result = e.target.result;
          if (readAs === 'json') {
            resolve(JSON.parse(result));
          } else {
            resolve(result);
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (e) => reject(e);
      
      if (readAs === 'dataUrl') {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  },

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string}
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
  },

  // ===== 本地存储 =====
  
  /**
   * 压缩JSON字符串
   * @param {Object} data - 要压缩的数据
   * @returns {string}
   */
  compressData(data) {
    // 简单的压缩：移除空格和换行
    return JSON.stringify(data);
  },

  /**
   * 解压JSON字符串
   * @param {string} compressed - 压缩的字符串
   * @returns {Object}
   */
  decompressData(compressed) {
    try {
      return JSON.parse(compressed);
    } catch (e) {
      return null;
    }
  },

  /**
   * 计算对象字节大小
   * @param {Object} obj - 对象
   * @returns {number}
   */
  getObjectSize(obj) {
    const str = JSON.stringify(obj);
    return new Blob([str]).size;
  },

  // ===== DOM操作 =====
  
  /**
   * 创建元素
   * @param {string} tag - 标签名
   * @param {Object} attrs - 属性对象
   * @param {string|Array} children - 子元素
   * @returns {HTMLElement}
   */
  createElement(tag, attrs = {}, children = null) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') {
        el.className = value;
      } else if (key === 'dataset') {
        Object.entries(value).forEach(([dataKey, dataValue]) => {
          el.dataset[dataKey] = dataValue;
        });
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.substring(2).toLowerCase(), value);
      } else {
        el.setAttribute(key, value);
      }
    });
    
    if (children) {
      if (typeof children === 'string') {
        el.textContent = children;
      } else if (Array.isArray(children)) {
        children.forEach(child => {
          if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
          } else if (child instanceof HTMLElement) {
            el.appendChild(child);
          }
        });
      } else if (children instanceof HTMLElement) {
        el.appendChild(children);
      }
    }
    
    return el;
  },

  /**
   * 显示Toast提示
   * @param {string} message - 提示信息
   * @param {string} type - 类型: 'success', 'error', 'warning', 'info'
   * @param {number} duration - 显示时长(ms)
   */
  showToast(message, type = 'info', duration = 3000) {
    // 创建或获取toast容器
    let container = document.getElementById('toast-container');
    if (!container) {
      container = this.createElement('div', {
        id: 'toast-container',
        className: 'toast-container'
      });
      document.body.appendChild(container);
    }

    // 创建toast元素
    const toast = this.createElement('div', {
      className: `toast toast-${type}`,
      innerHTML: `
        <span class="toast-icon">${this.getToastIcon(type)}</span>
        <span class="toast-message">${this.escapeHtml(message)}</span>
      `
    });

    container.appendChild(toast);

    // 触发动画
    setTimeout(() => toast.classList.add('show'), 10);

    // 自动移除
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        container.removeChild(toast);
        if (container.children.length === 0) {
          document.body.removeChild(container);
        }
      }, 300);
    }, duration);
  },

  /**
   * 获取Toast图标
   * @private
   */
  getToastIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons.info;
  },

  /**
   * 显示确认对话框
   * @param {string} message - 提示信息
   * @param {string} title - 标题
   * @returns {Promise<boolean>}
   */
  confirm(message, title = '确认') {
    return new Promise((resolve) => {
      if (window.confirm(`${title}\n\n${message}`)) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  },

  // ===== 性能优化 =====
  
  /**
   * 批量DOM操作
   * @param {Function} callback - 操作函数
   */
  batchDOMUpdate(callback) {
    requestAnimationFrame(() => {
      callback();
    });
  },

  /**
   * 延迟执行
   * @param {number} ms - 延迟时间(ms)
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * 空闲时执行
   * @param {Function} callback - 回调函数
   * @param {Object} options - 选项
   */
  runWhenIdle(callback, options = {}) {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(callback, options);
    } else {
      setTimeout(callback, 1);
    }
  }
};

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
