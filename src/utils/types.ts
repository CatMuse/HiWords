// 使用 Obsidian 官方 Canvas 类型
import type { AllCanvasNodeData, CanvasData as ObsidianCanvasData } from 'obsidian/canvas';

// 导出官方类型的别名以保持向后兼容
export type CanvasNode = AllCanvasNodeData;
export type CanvasData = ObsidianCanvasData;

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
    // 已掌握判定模式：'group'（根据是否位于 Mastered 分组）或 'color'（根据颜色是否为绿色4）
    masteredDetection?: 'group' | 'color';
    // 发音地址模板（如：https://dict.youdao.com/dictvoice?audio={{word}}&type=2）
    ttsTemplate?: string;
    // 自动布局设置（简化版）
    autoLayoutEnabled?: boolean; // 是否启用自动布局（使用固定参数的简单网格）
    // 卡片尺寸设置
    cardWidth?: number; // 卡片宽度（默认 260）
    cardHeight?: number; // 卡片高度（默认 120）
}

// 词汇匹配信息
export interface WordMatch {
    word: string;
    definition: WordDefinition;
    from: number;
    to: number;
    color: string;
}
