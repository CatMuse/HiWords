import { Notice } from 'obsidian';

interface AIConfig {
    apiUrl: string;
    apiKey: string;
    model: string;
    prompt: string;
}

type APIType = 'openai' | 'claude' | 'gemini';

/**
 * 词典服务 - 使用 AI API（支持多种格式）
 */
export class DictionaryService {
    private config: AIConfig;

    constructor(config: AIConfig) {
        this.config = config;
    }

    /**
     * 自动检测 API 类型
     */
    private detectAPIType(): APIType {
        const url = this.config.apiUrl.toLowerCase();
        
        // Claude API
        if (url.includes('anthropic')) {
            return 'claude';
        }
        
        // Google Gemini API
        if (url.includes('googleapis') || url.includes('generativelanguage')) {
            return 'gemini';
        }
        
        // 默认使用 OpenAI 兼容格式（支持大部分 API）
        return 'openai';
    }

    /**
     * 替换 prompt 中的占位符
     */
    private replacePlaceholders(word: string, sentence?: string): string {
        return this.config.prompt
            .replace(/\{\{word\}\}/g, word)
            .replace(/\{\{sentence\}\}/g, sentence || '');
    }

    /**
     * 获取单词释义
     * @param word 要查询的单词
     * @param sentence 单词所在的句子（可选）
     * @returns 释义文本
     */
    async fetchDefinition(word: string, sentence?: string): Promise<string> {
        if (!word || !word.trim()) {
            throw new Error('Word cannot be empty');
        }

        if (!this.config.apiKey) {
            throw new Error('API Key is not configured. Please set it in the plugin settings.');
        }

        const cleanWord = word.trim();
        const apiType = this.detectAPIType();
        
        // 根据 API 类型调用对应的方法
        switch (apiType) {
            case 'claude':
                return await this.fetchFromClaude(cleanWord, sentence);
            case 'gemini':
                return await this.fetchFromGemini(cleanWord, sentence);
            default:
                return await this.fetchFromOpenAI(cleanWord, sentence);
        }
    }

    /**
     * 从 OpenAI 兼容 API 获取释义
     */
    private async fetchFromOpenAI(word: string, sentence?: string): Promise<string> {
        const prompt = this.replacePlaceholders(word, sentence);

        const requestBody = {
            model: this.config.model,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 500
        };

        try {
            const response = await fetch(this.config.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI API request failed (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            
            // 提取 AI 的回复
            if (data.choices && data.choices.length > 0) {
                const content = data.choices[0].message?.content;
                if (content) {
                    return content.trim();
                }
            }

            throw new Error('Invalid response from OpenAI API');
        } catch (error) {
            console.error('Failed to fetch definition from OpenAI:', error);
            throw error;
        }
    }

    /**
     * 从 Anthropic Claude API 获取释义
     */
    private async fetchFromClaude(word: string, sentence?: string): Promise<string> {
        const prompt = this.replacePlaceholders(word, sentence);

        const requestBody = {
            model: this.config.model,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 1024
        };

        try {
            const response = await fetch(this.config.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Claude API request failed (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            
            // Claude 的响应格式
            if (data.content && data.content.length > 0) {
                const content = data.content[0].text;
                if (content) {
                    return content.trim();
                }
            }

            throw new Error('Invalid response from Claude API');
        } catch (error) {
            console.error('Failed to fetch definition from Claude:', error);
            throw error;
        }
    }

    /**
     * 从 Google Gemini API 获取释义
     */
    private async fetchFromGemini(word: string, sentence?: string): Promise<string> {
        const prompt = this.replacePlaceholders(word, sentence);

        const requestBody = {
            contents: [
                {
                    parts: [
                        {
                            text: prompt
                        }
                    ]
                }
            ]
        };

        try {
            // Gemini API URL 格式：.../models/{model}:generateContent
            let apiUrl = this.config.apiUrl;
            if (!apiUrl.includes(':generateContent')) {
                apiUrl = `${apiUrl.replace(/\/$/, '')}/models/${this.config.model}:generateContent`;
            }
            
            // API Key 通过 URL 参数传递
            const urlWithKey = `${apiUrl}?key=${this.config.apiKey}`;

            const response = await fetch(urlWithKey, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API request failed (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            
            // Gemini 的响应格式
            if (data.candidates && data.candidates.length > 0) {
                const candidate = data.candidates[0];
                if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                    const text = candidate.content.parts[0].text;
                    if (text) {
                        return text.trim();
                    }
                }
            }

            throw new Error('Invalid response from Gemini API');
        } catch (error) {
            console.error('Failed to fetch definition from Gemini:', error);
            throw error;
        }
    }

}
