// 使用 Obsidian 官方 Canvas 类型
import type { AllCanvasNodeData, CanvasData as ObsidianCanvasData } from 'obsidian/canvas';

// 导出官方类型的别名以保持向后兼容
export type CanvasNode = AllCanvasNodeData;
export type CanvasData = ObsidianCanvasData;

export interface WordSection {
    title: string;
    content: string;
}

export interface WordCardDefinition {
    pos?: string;
    zh?: string;
    en?: string;
}

export interface WordCardExample {
    text: string;
    translation?: string;
    source?: string;
}

export interface WordCardMemory {
    hint?: string;
    note?: string;
    root?: string;
}

export interface WordCardPhonetics {
    uk?: string;
    us?: string;
}

export interface WordCardAudio {
    uk?: string;
    us?: string;
    default?: string;
}

export interface WordCardImage {
    src: string;
    alt?: string;
    caption?: string;
    credit?: string;
}

export interface WordCardConfusable {
    word: string;
    note: string;
}

export interface WordCard {
    word: string;
    aliases?: string[];
    color?: string; // Optional Canvas-style color id: "1".."6"
    phonetic?: string; // v1 compatibility; prefer phonetics in new .hiwords packs
    phonetics?: WordCardPhonetics;
    audio?: WordCardAudio;
    language?: string;
    level?: string;
    tags?: string[];
    frequency?: number;
    register?: string;
    domains?: string[];
    examTags?: string[];
    definitions?: WordCardDefinition[];
    definition?: string;
    examples?: WordCardExample[];
    memory?: WordCardMemory;
    collocations?: string[];
    confusables?: WordCardConfusable[];
    images?: WordCardImage[];
}

// 词汇定义
export interface WordDefinition {
    word: string;
    aliases?: string[]; // 单词的别名列表
    definition: string; // 兼容旧版：有分区时保存首个分区内容
    rawDefinition?: string; // 原始完整定义（包含所有分区）
    sections?: WordSection[]; // 使用 --- 分隔的多分区内容
    source: string; // Canvas 文件路径
    nodeId: string; // Canvas 节点 ID
    color?: string;
    mastered?: boolean; // 是否已掌握
    isPattern?: boolean; // 是否为模式短语（包含 ... 占位符）
    patternParts?: string[]; // 模式短语的各个部分（不包含 ...）
    card?: WordCard; // HiWords 结构化词卡（来自 .hiwords 词库包）
}

// 生词本配置
export interface VocabularyBook {
    path: string; // Canvas 文件路径
    name: string; // 显示名称
    enabled: boolean; // 是否启用
    color?: string; // .hiwords 词库默认颜色，使用 Canvas-style color id: "1".."6"
    progressKey?: string; // .hiwords 进度稳定键，优先使用词库包 ID
}

// 高亮样式类型
export type HighlightStyle = 'underline' | 'background' | 'bold' | 'dotted' | 'wavy';

export type AIProvider = 'openai-compatible' | 'anthropic' | 'gemini' | 'custom';

export interface AIServiceSettings {
    provider: AIProvider;
    apiUrl: string;
    apiKey: string;
    model: string;
    extraParams: string;
}

export interface AIDefinitionSettings {
    enabled: boolean;
    prompt: string;
}

export interface SelectionTranslateSettings {
    enabled: boolean;
    targetLang: string;
    prompt: string;
}

// 插件设置
export interface HiWordsSettings {
    vocabularyBooks: VocabularyBook[];
    hiWordsProgress?: Record<string, Record<string, { mastered?: boolean }>>;
    showDefinitionOnHover: boolean;
    enableAutoHighlight: boolean;
    highlightStyle: HighlightStyle; // 高亮样式
    enableMasteredFeature: boolean; // 启用已掌握功能
    showMasteredInSidebar: boolean; // 在侧边栏显示已掌握单词
    blurDefinitions: boolean; // 模糊定义内容，悬停时显示
    // 已掌握判定模式：'group'（根据是否位于 Mastered 分组）或 'color'（根据颜色是否为绿色4）
    masteredDetection?: 'group' | 'color';
    // 发音地址模板（如：https://dict.youdao.com/dictvoice?audio={{word}}&type=2）
    ttsTemplate?: string;
    pronunciationVariant?: 'uk' | 'us';
    // AI 配置
    aiService: AIServiceSettings;
    aiDefinition: AIDefinitionSettings;
    // 自动布局设置（简化版）
    autoLayoutEnabled?: boolean; // 是否启用自动布局（使用固定参数的简单网格）
    // 卡片尺寸设置
    cardWidth?: number; // 卡片宽度（默认 260）
    cardHeight?: number; // 卡片高度（默认 120）
    // 高亮范围设置
    highlightMode?: 'all' | 'exclude' | 'include'; // 高亮模式：全部/排除/仅指定
    highlightPaths?: string; // 文件路径列表（逗号分隔）
    // 文件节点解析模式
    fileNodeParseMode?: 'filename' | 'content' | 'filename-with-alias'; // 文件节点解析模式
    // 启用分区 Tab 显示
    enableSectionTabs?: boolean;
    // 侧边栏默认显示模式：详情模式显示完整内容，单词模式仅显示标题行
    sidebarDefaultDisplayMode?: 'detail' | 'word';
    // 划词翻译配置
    selectionTranslate: SelectionTranslateSettings;
}

// 词汇匹配信息
export interface WordMatch {
    word: string;
    definition: WordDefinition;
    from: number;
    to: number;
    color: string;
    matchedText?: string; // 实际匹配到的文本（用于模式短语）
    segments?: Array<{from: number, to: number}>; // 分段高亮的位置（用于模式短语）
}
