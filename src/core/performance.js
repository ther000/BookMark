// 性能优化模块

const Performance = {
  // 缓存
  cache: {
    bookmarks: null,
    tags: null,
    metadata: null,
    lastUpdate: 0,
    ttl: 5000 // 缓存有效期: 5秒
  },

  // 虚拟滚动配置
  virtualScroll: {
    itemHeight: 80, // 每项高度(px)
    bufferSize: 5, // 缓冲区大小
    visibleRange: { start: 0, end: 0 },
    totalHeight: 0
  },

  /**
   * 获取书签（带缓存）
   * @param {boolean} forceRefresh - 强制刷新
   * @returns {Promise<Array>}
   */
  async getBookmarksWithCache(forceRefresh = false) {
    const now = Date.now();
    
    if (!forceRefresh && 
        this.cache.bookmarks && 
        now - this.cache.lastUpdate < this.cache.ttl) {
      return this.cache.bookmarks;
    }

    const bookmarks = await Storage.getBookmarksWithMetadata();
    this.cache.bookmarks = bookmarks;
    this.cache.lastUpdate = now;
    
    return bookmarks;
  },

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.bookmarks = null;
    this.cache.tags = null;
    this.cache.metadata = null;
    this.cache.lastUpdate = 0;
  },

  /**
   * 局部更新书签
   * @param {string} bookmarkId - 书签ID
   * @param {Object} updates - 更新内容
   */
  updateBookmarkLocally(bookmarkId, updates) {
    if (!this.cache.bookmarks) return;

    const index = this.cache.bookmarks.findIndex(b => b.id === bookmarkId);
    if (index >= 0) {
      this.cache.bookmarks[index] = {
        ...this.cache.bookmarks[index],
        ...updates
      };
    }
  },

  /**
   * 局部删除书签
   * @param {string} bookmarkId - 书签ID
   */
  deleteBookmarkLocally(bookmarkId) {
    if (!this.cache.bookmarks) return;

    this.cache.bookmarks = this.cache.bookmarks.filter(b => b.id !== bookmarkId);
  },

  /**
   * 初始化虚拟滚动
   * @param {HTMLElement} container - 容器元素
   * @param {Array} items - 数据数组
   * @param {Function} renderItem - 渲染函数
   */
  initVirtualScroll(container, items, renderItem) {
    const viewport = container;
    const content = viewport.querySelector('.bookmarks-content') || viewport;
    
    // 计算总高度
    this.virtualScroll.totalHeight = items.length * this.virtualScroll.itemHeight;
    content.style.height = `${this.virtualScroll.totalHeight}px`;
    content.style.position = 'relative';

    // 监听滚动
    let isScrolling;
    viewport.addEventListener('scroll', () => {
      clearTimeout(isScrolling);
      
      isScrolling = setTimeout(() => {
        this.updateVisibleItems(viewport, items, renderItem);
      }, 50);
    }, { passive: true });

    // 初始渲染
    this.updateVisibleItems(viewport, items, renderItem);
  },

  /**
   * 更新可见项
   * @private
   */
  updateVisibleItems(viewport, items, renderItem) {
    const scrollTop = viewport.scrollTop;
    const viewportHeight = viewport.clientHeight;

    const startIndex = Math.max(0, Math.floor(scrollTop / this.virtualScroll.itemHeight) - this.virtualScroll.bufferSize);
    const endIndex = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / this.virtualScroll.itemHeight) + this.virtualScroll.bufferSize);

    this.virtualScroll.visibleRange = { start: startIndex, end: endIndex };

    // 渲染可见项
    const fragment = document.createDocumentFragment();
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = `${startIndex * this.virtualScroll.itemHeight}px`;
    container.style.width = '100%';

    for (let i = startIndex; i < endIndex; i++) {
      const item = items[i];
      const el = renderItem(item, i);
      container.appendChild(el);
    }

    const content = viewport.querySelector('.bookmarks-content') || viewport;
    content.innerHTML = '';
    content.appendChild(container);
  },

  /**
   * 批量DOM操作
   * @param {Array} operations - 操作数组
   */
  batchDOMOperations(operations) {
    requestAnimationFrame(() => {
      const fragment = document.createDocumentFragment();
      
      operations.forEach(op => {
        if (op.type === 'append') {
          fragment.appendChild(op.element);
        } else if (op.type === 'update') {
          op.element.textContent = op.content;
        }
      });

      if (operations[0]?.container) {
        operations[0].container.appendChild(fragment);
      }
    });
  },

  /**
   * 防抖搜索
   * @param {Function} searchFunc - 搜索函数
   * @param {number} delay - 延迟时间
   * @returns {Function}
   */
  createDebouncedSearch(searchFunc, delay = 300) {
    return Utils.debounce(searchFunc, delay);
  },

  /**
   * 节流滚动
   * @param {Function} scrollFunc - 滚动处理函数
   * @param {number} limit - 限制时间
   * @returns {Function}
   */
  createThrottledScroll(scrollFunc, limit = 100) {
    return Utils.throttle(scrollFunc, limit);
  },

  /**
   * 懒加载图片
   * @param {HTMLElement} container - 容器元素
   */
  setupLazyLoading(container) {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.dataset.src;
            
            if (src) {
              img.src = src;
              img.removeAttribute('data-src');
              observer.unobserve(img);
            }
          }
        });
      }, {
        rootMargin: '50px'
      });

      container.querySelectorAll('img[data-src]').forEach(img => {
        observer.observe(img);
      });

      return observer;
    } else {
      // 降级方案：直接加载所有图片
      container.querySelectorAll('img[data-src]').forEach(img => {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      });
    }
  },

  /**
   * 预加载关键资源
   * @param {Array<string>} urls - 资源URL列表
   */
  preloadResources(urls) {
    urls.forEach(url => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = url;
      link.as = this.getResourceType(url);
      document.head.appendChild(link);
    });
  },

  /**
   * 获取资源类型
   * @private
   */
  getResourceType(url) {
    if (url.endsWith('.js')) return 'script';
    if (url.endsWith('.css')) return 'style';
    if (url.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) return 'image';
    return 'fetch';
  },

  /**
   * 使用Web Worker处理大数据
   * @param {Array} data - 数据
   * @param {string} operation - 操作类型
   * @returns {Promise}
   */
  async processInWorker(data, operation) {
    return new Promise((resolve, reject) => {
      // 创建内联Worker
      const workerCode = `
        self.onmessage = function(e) {
          const { data, operation } = e.data;
          let result;
          
          try {
            switch(operation) {
              case 'search':
                result = data.filter(item => 
                  item.title.toLowerCase().includes(e.data.query.toLowerCase()) ||
                  item.url.toLowerCase().includes(e.data.query.toLowerCase())
                );
                break;
              case 'sort':
                result = data.sort((a, b) => 
                  a[e.data.key].localeCompare(b[e.data.key])
                );
                break;
              default:
                result = data;
            }
            
            self.postMessage({ success: true, result });
          } catch (error) {
            self.postMessage({ success: false, error: error.message });
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      worker.onmessage = (e) => {
        if (e.data.success) {
          resolve(e.data.result);
        } else {
          reject(new Error(e.data.error));
        }
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };

      worker.onerror = (error) => {
        reject(error);
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };

      worker.postMessage({ data, operation });
    });
  },

  /**
   * 性能监控
   * @param {string} name - 标记名称
   * @param {Function} func - 要监控的函数
   * @returns {Promise}
   */
  async measure(name, func) {
    const startMark = `${name}-start`;
    const endMark = `${name}-end`;
    
    performance.mark(startMark);
    const result = await func();
    performance.mark(endMark);
    
    performance.measure(name, startMark, endMark);
    
    const measures = performance.getEntriesByName(name);
    if (measures.length > 0) {
      console.log(`${name}: ${measures[0].duration.toFixed(2)}ms`);
    }
    
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
    performance.clearMeasures(name);
    
    return result;
  },

  /**
   * 内存优化：清理未使用的数据
   */
  cleanup() {
    this.clearCache();
    
    // 清理事件监听器引用
    if (this.listeners) {
      this.listeners.clear();
    }
    
    // 强制垃圾回收（如果可用）
    if (window.gc) {
      window.gc();
    }
  }
};

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Performance;
}
