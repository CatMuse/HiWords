// Canvas 节点类型定义
export interface CanvasNode {
    id: string;
    type: 'text' | 'group' | string; // 支持分组类型
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;      // 文本节点内容
    file?: string;
    color?: string;
    label?: string;     // 分组标签
    group?: string[];   // 所属分组ID数组
}

// Canvas 数据结构
export interface CanvasData {
    nodes: CanvasNode[];
    edges: any[];
}

// 词汇定义
export interface WordDefinition {
    word: string;
    aliases?: string[]; // 单词的别名列表
    definition: string;
    source: string; // Canvas 文件路径
    nodeId: string; // Canvas 节点 ID
    color?: string;
    mastered?: boolean; // 是否已掌握
}

// 生词本配置
export interface VocabularyBook {
    path: string; // Canvas 文件路径
    name: string; // 显示名称
    enabled: boolean; // 是否启用
}

// 高亮样式类型
export type HighlightStyle = 'underline' | 'background' | 'bold' | 'dotted' | 'wavy';

// 插件设置
export interface HiWordsSettings {
    vocabularyBooks: VocabularyBook[];
    showDefinitionOnHover: boolean;
    enableAutoHighlight: boolean;
    highlightStyle: HighlightStyle; // 高亮样式
    enableMasteredFeature: boolean; // 启用已掌握功能
    showMasteredInSidebar: boolean; // 在侧边栏显示已掌握单词
    blurDefinitions: boolean; // 模糊定义内容，悬停时显示
}

// 词汇匹配信息
export interface WordMatch {
    word: string;
    definition: WordDefinition;
    from: number;
    to: number;
    color: string;
}
