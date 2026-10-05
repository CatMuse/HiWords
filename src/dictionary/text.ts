import { getLanguage } from 'obsidian';
const messages = {
    setting: ['Offline dictionary', '离线词典'],
    description: ['Use a .hidict file for offline lookup. Does not affect highlighting.', '使用 .hidict 文件离线查词，不参与高亮。'],
    select: ['Select dictionary', '选择词典'], clear: ['Clear selection', '取消选择'],
    none: ['No dictionary selected', '未选择词典'], empty: ['No .hidict files found in this vault', '仓库中未找到 .hidict 文件'],
    unavailable: ['Unavailable', '不可用'],
    missing: ['Dictionary file is missing. Select it again in settings.', '词典文件不存在，请在设置中重新选择。'],
    changed: ['Dictionary changed. Select the word again.', '词典已变更，请重新划词查询。'],
    invalid: ['Invalid or unsupported .hidict dictionary', '词典内容无效或格式版本不受支持'],
    miss: ['Word not found. Enable selection translation for AI fallback.', '词典未收录此词。开启划词翻译后可使用 AI 翻译。'],
    loading: ['Looking up…', '正在查询…'], phonetic: ['Phonetic', '音标'],
    pronounce: ['Play pronunciation', '播放发音'],
    pronounceUK: ['Play British pronunciation', '播放英音'],
    pronounceUS: ['Play American pronunciation', '播放美音'],
    definition: ['Definition', '释义'],
    forms: ['Word forms', '词形变化'],
    frequency: ['Frequency', '词频'], unknown: ['Unknown frequency', '词频未知'],
    add: ['Add word', '添加单词'], copy: ['Copy definition', '复制释义'],
    candidates: ['Matching headword', '对应原词'],
    past: ['past', '过去式'], pastParticiple: ['past participle', '过去分词'],
    presentParticiple: ['present participle', '现在分词'], thirdPersonSingular: ['third person singular', '第三人称单数'],
    plural: ['plural', '复数'], comparative: ['comparative', '比较级'], superlative: ['superlative', '最高级'],
} as const;
export function dictText(key: keyof typeof messages): string {
    return messages[key][getLanguage().startsWith('zh') ? 1 : 0];
}
