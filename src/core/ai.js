// AI 自动标记功能模块
// 负责与 AI API 通信，获取书签标签建议

const AI = {
  // 调用 AI API 获取标签建议
  async getSuggestedTags(bookmark, existingTags = [], context = {}) {
    const config = await Storage.getCurrentAIConfig();
    
    if (!config.apiEndpoint || !config.apiKey) {
      throw new Error('请先在设置中配置 AI API 信息');
    }

    const prompt = this.buildPrompt(bookmark, existingTags, context);
    
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
          temperature: 0.3,
          max_tokens: 256
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const parsed = this.parseAIResponse(content);
      return this.normalizeTags(parsed);
    } catch (error) {
      console.error('AI API 调用失败:', error);
      throw error;
    }
  },

  // 构建发送给 AI 的 Prompt
  buildPrompt(bookmark, existingTags, context = {}) {
    const {
      knownTags = [],
      relatedTags = [],
      examples = [],
      urlInfo = {},
      keywords = []
    } = context || {};

    const limitedKnownTags = Array.isArray(knownTags) ? knownTags.slice(0, 30) : [];
    const limitedExisting = Array.isArray(existingTags) ? existingTags.slice(0, 6) : [];
    const limitedRelated = Array.isArray(relatedTags) ? relatedTags.slice(0, 10) : [];
    const limitedExamples = Array.isArray(examples) ? examples.slice(0, 3) : [];
    const limitedKeywords = Array.isArray(keywords) ? keywords.slice(0, 8) : [];

    const knownTagsText = limitedKnownTags.length > 0 ? limitedKnownTags.join('、') : '暂无';
    const relatedTagsText = limitedRelated.length > 0 ? limitedRelated.join('、') : '暂无';
    const examplesText = limitedExamples.length > 0
      ? limitedExamples.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : '暂无';
    const keywordsText = limitedKeywords.length > 0 ? limitedKeywords.join('、') : '暂无';
    const existingText = limitedExisting.length > 0 ? limitedExisting.join('、') : '无';

    const lines = [
      '请作为资深信息分类专家，为以下书签推荐最合适的标签。',
      '',
      `网页标题：${bookmark?.title || '未提供'}`
    ];

    if (bookmark?.url) {
      lines.push(`网页URL：${bookmark.url}`);
    }
    if (urlInfo?.domain) {
      lines.push(`网页域名：${urlInfo.domain}`);
    }
    if (urlInfo?.path) {
      lines.push(`网页路径：${urlInfo.path}`);
    }
    if (bookmark?.description) {
      lines.push(`网页描述：${bookmark.description}`);
    }

    lines.push(`标题关键词：${keywordsText}`);
    lines.push(`书签已有标签：${existingText}`);
    lines.push(`已知标签体系（优先使用）：${knownTagsText}`);
    lines.push(`同域名热门标签：${relatedTagsText}`);
    lines.push('相似书签示例：');
    lines.push(examplesText);
    lines.push('');
    lines.push('要求：');
    lines.push('1. 返回 1-3 个标签，优先从“已知标签体系”中选择；若无合适可创建与主题高度相关的新标签。');
    lines.push('2. 标签需语义明确，长度 2-8 字，避免重复、含糊或过于宽泛。');
    lines.push('3. 仅输出 JSON 数组，例如 ["技术文章","前端开发"]。');
    lines.push('4. JSON 中只包含标签字符串，不要额外解释或添加字段。');
    lines.push('');
    lines.push('请根据以上信息返回标签数组。');

    return lines.join('\n');
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

  normalizeTags(tags) {
    if (!Array.isArray(tags)) {
      return [];
    }

    const seen = new Set();
    const normalized = [];

    tags.forEach(tag => {
      if (typeof tag !== 'string') {
        return;
      }
      const trimmed = tag.trim();
      if (!trimmed) {
        return;
      }
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) {
        return;
      }
      seen.add(lower);
      normalized.push(trimmed);
    });

    return normalized.slice(0, 5);
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
