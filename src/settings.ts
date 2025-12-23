import type { HiWordsSettings } from './utils';

/**
 * 插件默认设置
 */
export const DEFAULT_SETTINGS: HiWordsSettings = {
    vocabularyBooks: [],
    showDefinitionOnHover: true,
    enableAutoHighlight: true,
    highlightStyle: 'underline', // 默认使用下划线样式
    enableMasteredFeature: true, // 默认启用已掌握功能
    showMasteredInSidebar: true,  // 跟随 enableMasteredFeature 的值
    blurDefinitions: false, // 默认不启用模糊效果
    // 发音地址模板（用户可在设置里修改）
    ttsTemplate: 'https://dict.youdao.com/dictvoice?audio={{word}}&type=2',
    // AI 词典配置
    aiDictionary: {
        apiUrl: '',
        apiKey: '',
        model: '',
        prompt: 'Please provide a concise definition for the word "{{word}}" based on this context:\n\nSentence: {{sentence}}\n\nFormat:\n1) Part of speech\n2) English definition\n3) Chinese translation\n4) Example sentence (use the original sentence if appropriate)',
        extraParams: '{}' // 默认空 JSON 对象
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
    fileNodeParseMode: 'filename-with-alias'
};
