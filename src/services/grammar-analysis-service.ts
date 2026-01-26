import { DictionaryService } from './dictionary-service';
import { t } from '../i18n';

export class GrammarAnalysisService {
    private dictionaryService: DictionaryService;
    private outputLanguage: string;

    constructor(
        aiConfig: { apiUrl: string; apiKey: string; model: string; prompt: string },
        outputLanguage: string = 'zh'
    ) {
        this.dictionaryService = new DictionaryService(aiConfig);
        this.outputLanguage = outputLanguage;
    }

    async analyzeGrammarStream(
        text: string,
        onChunk: (content: string) => void,
        onComplete: () => void,
        onError: (error: Error) => void
    ): Promise<void> {
        const cleanText = text.trim();
        
        if (!cleanText) {
            onError(new Error(t('grammar.text_empty')));
            return;
        }

        if (cleanText.length > 2000) {
            onError(new Error(t('grammar.text_too_long')));
            return;
        }

        const prompt = this.buildAnalysisPrompt(cleanText);
        await this.dictionaryService.makeAIRequestStream(prompt, onChunk, onComplete, onError);
    }

    async analyzeGrammar(text: string): Promise<string> {
        const cleanText = text.trim();
        
        if (!cleanText) {
            throw new Error(t('grammar.text_empty'));
        }

        if (cleanText.length > 2000) {
            throw new Error(t('grammar.text_too_long'));
        }

        const prompt = this.buildAnalysisPrompt(cleanText);

        try {
            const cacheKey = `grammar:${cleanText}:${this.outputLanguage}`;
            return await this.dictionaryService.makeAIRequest(prompt, cacheKey, true);
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(t('grammar.analysis_failed'));
        }
    }

    private buildAnalysisPrompt(text: string): string {
        return `Analyze the grammar structure of the following text and provide a concise explanation in ${this.outputLanguage}. DO NOT repeat the original sentence in your response.

"${text}"

Please provide:
1. **Sentence Structure**: Subject, verb, object, and key components
2. **Grammar Points**: Important grammar patterns used
3. **Key Notes**: Any notable points or common mistakes to avoid

Format: Clear, concise Markdown. Keep explanations brief and focused.`;
    }
}
