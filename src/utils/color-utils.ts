/**
 * 颜色工具函数
 */

/**
 * 将Canvas节点颜色映射为Obsidian CSS变量
 * @param canvasColor Canvas节点的颜色值（数字或颜色名称）
 * @param fallback 默认颜色（可选）
 * @returns Obsidian CSS变量字符串
 */
export function mapCanvasColorToCSSVar(
    canvasColor: string | undefined, 
    fallback: string = 'var(--color-accent)'
): string {
    if (!canvasColor) return fallback;
    
    // Canvas颜色映射表
    const colorMap: { [key: string]: string } = {
        // 数字映射（Canvas常用）
        '1': 'var(--color-red)',
        '2': 'var(--color-orange)', 
        '3': 'var(--color-yellow)',
        '4': 'var(--color-green)',
        '5': 'var(--color-cyan)',
        '6': 'var(--color-purple)',
        
        // 颜色名称映射
        'red': 'var(--color-red)',
        'orange': 'var(--color-orange)',
        'yellow': 'var(--color-yellow)',
        'green': 'var(--color-green)',
        'cyan': 'var(--color-cyan)',
        'blue': 'var(--color-blue)',
        'purple': 'var(--color-purple)',
        'pink': 'var(--color-pink)',
        
        // 额外的颜色支持
        'gray': 'var(--color-base-60)',
        'grey': 'var(--color-base-60)',
        'white': 'var(--color-base-00)',
        'black': 'var(--color-base-100)'
    };
    
    // 如果找到映射，返回CSS变量；否则返回原始颜色值
    return colorMap[canvasColor.toLowerCase()] || canvasColor;
}

/**
 * 获取颜色的淡化版本（用于背景色）
 * @param cssVar CSS变量字符串
 * @param opacity 透明度 (0-1)
 * @returns 带透明度的颜色字符串
 */
export function getColorWithOpacity(cssVar: string, opacity: number = 0.1): string {
    // 如果是CSS变量，使用color-mix函数来创建透明度效果
    if (cssVar.startsWith('var(--color-')) {
        // 使用现代CSS的color-mix函数
        return `color-mix(in srgb, ${cssVar} ${opacity * 100}%, transparent)`;
    }
    
    // 对于其他颜色值，也使用color-mix
    if (cssVar.startsWith('#') || cssVar.startsWith('rgb') || cssVar.startsWith('hsl')) {
        return `color-mix(in srgb, ${cssVar} ${opacity * 100}%, transparent)`;
    }
    
    // 如果都不匹配，直接返回原值
    return cssVar;
}

/**
 * 检查是否为有效的Canvas颜色
 * @param color 颜色值
 * @returns 是否为有效颜色
 */
export function isValidCanvasColor(color: string | undefined): boolean {
    if (!color) return false;
    
    const validColors = ['1', '2', '3', '4', '5', '6', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];
    return validColors.includes(color.toLowerCase());
}
