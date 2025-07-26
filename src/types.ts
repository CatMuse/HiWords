// Canvas 节点类型定义
export interface CanvasNode {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
    file?: string;
    color?: string;
}

// Canvas 数据结构
export interface CanvasData {
    nodes: CanvasNode[];
    edges: any[];
}

// 词汇定义
export interface WordDefinition {
    word: string;
    definition: string;
    source: string; // Canvas 文件路径
    nodeId: string; // Canvas 节点 ID
    color?: string;
}

// 生词本配置
export interface VocabularyBook {
    path: string; // Canvas 文件路径
    name: string; // 显示名称
    enabled: boolean; // 是否启用
}

// 插件设置
export interface HelloWordSettings {
    vocabularyBooks: VocabularyBook[];
    showDefinitionOnHover: boolean;
    enableAutoHighlight: boolean;
}

// 词汇匹配信息
export interface WordMatch {
    word: string;
    definition: WordDefinition;
    from: number;
    to: number;
    color: string;
}
