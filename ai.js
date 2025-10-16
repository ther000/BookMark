// AI 自动标记功能模块
// 负责与 AI API 通信，获取书签标签建议

const AI = {
  // 调用 AI API 获取标签建议
  async getSuggestedTags(bookmark, existingTags) {
    const config = await Storage.getCurrentAIConfig();
    
    if (!config.apiEndpoint || !config.apiKey) {
      throw new Error('请先在设置中配置 AI API 信息');
    }

    const prompt = this.buildPrompt(bookmark, existingTags);
    
    try {
      const response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的内容分类助手，擅长为网页内容推荐合适的标签。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 200
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      return this.parseAIResponse(content);
    } catch (error) {
      console.error('AI API 调用失败:', error);
      throw error;
    }
  },

  // 构建发送给 AI 的 Prompt
  buildPrompt(bookmark, existingTags) {
    const tagList = existingTags.length > 0 
      ? existingTags.join('、') 
      : '暂无';

    return `请分析以下网页内容，并推荐合适的标签：

网页标题：${bookmark.title}
网页URL：${bookmark.url}
${bookmark.description ? `网页描述：${bookmark.description}` : ''}

现有标签列表：【${tagList}】

请从现有标签列表中选择最合适的 1-3 个标签。如果现有标签都不合适，请根据内容创建 1-2 个简洁、相关的新标签。

要求：
1. 标签应该简洁明了，2-6 个字
2. 标签应该准确反映网页的主题或类型
3. 请以 JSON 数组格式返回，例如：["技术文章", "JavaScript"]
4. 只返回 JSON 数组，不要有其他说明文字`;
  },

  // 解析 AI 返回的结果
  parseAIResponse(content) {
    try {
      // 尝试提取 JSON 数组
      const match = content.match(/\[[\s\S]*?\]/);
      if (match) {
        const tags = JSON.parse(match[0]);
        if (Array.isArray(tags)) {
          return tags.filter(tag => typeof tag === 'string' && tag.trim());
        }
      }
      
      // 如果无法解析，返回空数组
      return [];
    } catch (error) {
      console.error('解析 AI 响应失败:', error);
      return [];
    }
  },

  // 测试 AI API 连接
  async testConnection(apiEndpoint, apiKey, model) {
    try {
      // 根据 API 端点自动选择模型
      let testModel = model || 'gpt-3.5-turbo';
      if (apiEndpoint.includes('deepseek.com')) {
        testModel = 'deepseek-chat';
      }
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: testModel,
          messages: [
            {
              role: 'user',
              content: '测试连接'
            }
          ],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('连接测试失败:', errorText);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('连接测试失败:', error);
      return false;
    }
  },

  // 获取网页元信息
  async getPageMetadata(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const getMetaContent = (name) => {
            const meta = document.querySelector(`meta[name="${name}"]`) ||
                         document.querySelector(`meta[property="${name}"]`);
            return meta ? meta.content : '';
          };

          return {
            description: getMetaContent('description') || 
                        getMetaContent('og:description') ||
                        document.querySelector('p')?.textContent?.slice(0, 200) || '',
            keywords: getMetaContent('keywords')
          };
        }
      });

      return results[0]?.result || { description: '', keywords: '' };
    } catch (error) {
      console.error('获取页面元信息失败:', error);
      return { description: '', keywords: '' };
    }
  }
};

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AI;
}
