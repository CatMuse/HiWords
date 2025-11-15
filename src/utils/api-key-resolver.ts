/**
 * API Key 解析工具
 * 优先从系统环境变量读取，如果未设置则使用直接输入的值
 */

/**
 * 解析 API Key
 * @param apiKey 直接输入的 API Key
 * @param apiKeyEnvVar 系统环境变量名（可选）
 * @returns 解析后的 API Key
 */
export function resolveApiKey(apiKey: string, apiKeyEnvVar?: string): string {
    // 如果设置了系统环境变量名，优先从系统环境变量读取
    if (apiKeyEnvVar && apiKeyEnvVar.trim()) {
        // 尝试从 process.env 读取系统环境变量
        // 注意：Obsidian 插件运行在 Electron 环境中，可以访问 process.env
        // 但某些情况下可能无法访问所有系统环境变量
        try {
            const envValue = (process as any).env?.[apiKeyEnvVar.trim()];
            if (envValue && typeof envValue === 'string' && envValue.trim()) {
                return envValue.trim();
            }
        } catch (error) {
            // 如果读取系统环境变量失败，回退到直接输入的值
            console.warn(`Failed to read system environment variable ${apiKeyEnvVar}:`, error);
        }
    }
    
    // 回退到直接输入的值
    return apiKey || '';
}

