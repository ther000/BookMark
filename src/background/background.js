// Background service worker for AI Smart Bookmarks
// 处理扩展程序的后台任务和侧边栏

// 监听扩展安装或更新
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // 首次安装时初始化数据
    await chrome.storage.sync.set({
      bookmarkMetadata: {}, // 存储书签的标签和颜色 {bookmarkId: {tags: [], color: ''}}
      tags: [],
      settings: {
        autoAITag: false
      }
    });
  }
});

// 点击扩展图标时打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// 监听来自其他页面的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openSidePanel') {
    chrome.sidePanel.open({ windowId: request.windowId });
  }
  return true;
});
