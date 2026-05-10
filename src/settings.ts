import type { HiWordsSettings } from './utils';

export const DEFAULT_AI_DEFINITION_PROMPT = 'Please provide a concise definition for the word "{{word}}" based on this context:\n\nSentence: {{sentence}}\n\nFormat:\n1) Part of speech\n2) English definition\n3) Chinese translation\n4) Example sentence (use the original sentence if appropriate)';

export const DEFAULT_TRANSLATE_PROMPT = 'Translate the following text to {{to}}. Only return the translation, no explanation.\n\nText: {{text}}';

/**
 * 插件默认设置
 */
export const DEFAULT_SETTINGS: HiWordsSettings = {
    vocabularyBooks: [],
    studyProgress: {},
    showDefinitionOnHover: true,
    enableAutoHighlight: true,
    highlightStyle: 'underline', // 默认使用下划线样式
    enableMasteredFeature: true, // 默认启用已掌握功能
    showMasteredInSidebar: true,  // 跟随 enableMasteredFeature 的值
    blurDefinitions: false, // 默认不启用模糊效果
    // 发音地址模板（用户可在设置里修改）
    ttsTemplate: 'https://dict.youdao.com/dictvoice?audio={{word}}&type=2',
    pronunciationVariant: 'us',
    // AI 服务配置
    aiService: {
        provider: 'openai-compatible',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini',
        extraParams: '{}'
    },
    // AI 释义配置
    aiDefinition: {
        enabled: true,
        prompt: DEFAULT_AI_DEFINITION_PROMPT
    },
    // 自动布局（简化版，使用固定参数）
    autoLayoutEnabled: true,
    // 卡片尺寸设置
    cardWidth: 260,
    cardHeight: 120,
    // 高亮范围设置
    highlightMode: 'all',
    highlightPaths: '',
    // 文件节点解析模式
    fileNodeParseMode: 'filename-with-alias',
    // 分区 Tab 显示
    enableSectionTabs: true,
    // 侧边栏默认显示模式
    sidebarDefaultDisplayMode: 'detail',
    // 划词翻译配置
    selectionTranslate: {
        enabled: false,
        targetLang: 'zh-CN',
        prompt: DEFAULT_TRANSLATE_PROMPT
    },
};
