// 设置页面逻辑

// AI 提供商预设配置
const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI (ChatGPT)',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-3.5-turbo',
    hint: '使用 OpenAI 官方 API，需要 OpenAI API Key'
  },
  deepseek: {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    hint: '使用 DeepSeek API，支持中文，性价比高'
  },
  custom: {
    name: '自定义',
    endpoint: '',
    model: 'gpt-3.5-turbo',
    hint: '兼容 OpenAI API 格式的其他服务'
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  // 初始化主题
  await Storage.initTheme();
  
  await loadSettings();
  initForms();
  
  // 主题选择
  document.getElementById('themeSelect').addEventListener('change', async (e) => {
    const theme = e.target.value;
    await Storage.saveTheme(theme);
    Storage.applyTheme(theme);
    showMessage('主题设置已保存');
  });
  
  // AI 提供商选择
  document.getElementById('aiProvider').addEventListener('change', (e) => {
    updateAIProviderFields(e.target.value);
  });
  
  // 返回按钮
  document.getElementById('backBtn').addEventListener('click', () => {
    window.close(); // 关闭设置页
  });
});

// 更新 AI 提供商字段
function updateAIProviderFields(provider) {
  const config = AI_PROVIDERS[provider];
  if (!config) return;
  
  const endpointInput = document.getElementById('apiEndpoint');
  const modelInput = document.getElementById('model');
  const endpointHint = document.getElementById('endpointHint');
  const modelHint = document.getElementById('modelHint');
  
  if (provider !== 'custom') {
    endpointInput.readOnly = true;
    endpointInput.placeholder = config.endpoint;
    modelInput.placeholder = config.model;
  } else {
    endpointInput.readOnly = false;
    endpointInput.placeholder = '输入自定义 API 端点';
    modelInput.placeholder = 'gpt-3.5-turbo';
  }
  
  endpointHint.textContent = config.hint;
  modelHint.textContent = `推荐模型：${config.model}`;
  
  // 加载对应提供商的已保存配置
  loadProviderConfig(provider);
}

// 加载提供商配置
async function loadProviderConfig(provider) {
  const settings = await Storage.getSettings();
  const providers = settings.providers || {};
  const providerConfig = providers[provider];
  
  if (providerConfig) {
    document.getElementById('apiEndpoint').value = providerConfig.apiEndpoint || AI_PROVIDERS[provider].endpoint;
    document.getElementById('apiKey').value = providerConfig.apiKey || '';
    document.getElementById('model').value = providerConfig.model || AI_PROVIDERS[provider].model;
  } else {
    // 使用默认值
    document.getElementById('apiEndpoint').value = AI_PROVIDERS[provider].endpoint;
    document.getElementById('apiKey').value = '';
    document.getElementById('model').value = AI_PROVIDERS[provider].model;
  }
}

// 加载设置
async function loadSettings() {
  const settings = await Storage.getSettings();
  
  const provider = settings.aiProvider || 'openai';
  const providers = settings.providers || {};
  const theme = settings.theme || 'auto';
  
  // 加载主题设置
  document.getElementById('themeSelect').value = theme;
  
  document.getElementById('aiProvider').value = provider;
  
  // 加载当前提供商的配置
  const currentConfig = providers[provider] || AI_PROVIDERS[provider];
  document.getElementById('apiEndpoint').value = currentConfig.apiEndpoint || '';
  document.getElementById('apiKey').value = currentConfig.apiKey || '';
  document.getElementById('model').value = currentConfig.model || '';
  document.getElementById('autoAITag').checked = settings.autoAITag || false;
  
  updateAIProviderFields(provider);
}

// 初始化表单
function initForms() {
  // AI 设置表单
  const aiForm = document.getElementById('aiSettingsForm');
  
  aiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveAISettings();
  });
  
  // 测试连接
  document.getElementById('testConnection').addEventListener('click', async () => {
    await testAPIConnection();
  });
}

// 保存 AI 设置
async function saveAISettings() {
  try {
    const provider = document.getElementById('aiProvider').value;
    const apiEndpoint = document.getElementById('apiEndpoint').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('model').value.trim() || AI_PROVIDERS[provider].model;
    
    if (!apiEndpoint || !apiKey) {
      showMessage('请填写 API 端点地址和密钥', 'error');
      return;
    }
    
    // 获取现有设置
    const settings = await Storage.getSettings();
    
    // 更新当前提供商的配置
    if (!settings.providers) {
      settings.providers = {};
    }
    
    settings.providers[provider] = {
      apiEndpoint,
      apiKey,
      model
    };
    
    settings.aiProvider = provider;
    settings.autoAITag = document.getElementById('autoAITag').checked;
    
    await Storage.saveSettings(settings);
    showMessage('设置保存成功！', 'success');
  } catch (error) {
    showMessage(`保存失败: ${error.message}`, 'error');
  }
}

// 测试 API 连接
async function testAPIConnection() {
  const resultEl = document.getElementById('testResult');
  const testBtn = document.getElementById('testConnection');
  
  try {
    testBtn.disabled = true;
    testBtn.textContent = '测试中...';
    resultEl.classList.add('hidden');
    
    const apiEndpoint = document.getElementById('apiEndpoint').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('model').value.trim();
    
    if (!apiEndpoint || !apiKey) {
      showMessage('请先填写 API 端点地址和密钥', 'error');
      return;
    }
    
    const success = await AI.testConnection(apiEndpoint, apiKey, model);
    
    if (success) {
      resultEl.textContent = '✓ 连接成功！API 配置正确。';
      resultEl.className = 'test-result success';
    } else {
      resultEl.textContent = '✗ 连接失败，请检查 API 端点地址和密钥是否正确。';
      resultEl.className = 'test-result error';
    }
    
    resultEl.classList.remove('hidden');
  } catch (error) {
    resultEl.textContent = `✗ 测试失败: ${error.message}`;
    resultEl.className = 'test-result error';
    resultEl.classList.remove('hidden');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '测试连接';
  }
}

// 显示消息
function showMessage(text, type = 'info') {
  const messageEl = document.getElementById('message');
  messageEl.textContent = text;
  messageEl.className = `message-toast ${type}`;
  messageEl.classList.remove('hidden');
  
  setTimeout(() => {
    messageEl.classList.add('hidden');
  }, 3000);
}
