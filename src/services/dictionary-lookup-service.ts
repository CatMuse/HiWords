import type { DictionaryResult } from '../utils';
import { t } from '../i18n';
import { DictionaryService } from './dictionary-service';

export class DictionaryLookupService {
    private dictionaryService: DictionaryService;
    private outputLanguage: string;

    constructor(
        aiConfig: { apiUrl: string; apiKey: string; model: string; prompt: string },
        outputLanguage: string = 'zh'
    ) {
        this.dictionaryService = new DictionaryService(aiConfig);
        this.outputLanguage = outputLanguage;
    }

    async lookupWordStream(
        word: string,
        onChunk: (content: string) => void,
        onComplete: () => void,
        onError: (error: Error) => void
    ): Promise<void> {
        if (!word || typeof word !== 'string') {
            onError(new Error(t('dictionary.word_empty')));
            return;
        }
        
        const cleanWord = word.trim().toLowerCase();
        
        if (!cleanWord) {
            onError(new Error(t('dictionary.word_empty')));
            return;
        }

        const prompt = this.buildLookupPrompt(cleanWord);
        await this.dictionaryService.makeAIRequestStream(prompt, onChunk, onComplete, onError);
    }

    async lookupWord(word: string): Promise<DictionaryResult> {
        if (!word || typeof word !== 'string') {
            throw new Error(t('dictionary.word_empty'));
        }
        
        const cleanWord = word.trim().toLowerCase();
        
        if (!cleanWord) {
            throw new Error(t('dictionary.word_empty'));
        }

        return await this.lookupWithAI(cleanWord);
    }

    private buildLookupPrompt(word: string): string {
        return `Please provide a concise dictionary definition for the word "${word}" in well-formatted Markdown. Please provide definitions in ${this.outputLanguage}, but keep example sentences in English.

Format:

${word} /phonetic transcription/

[Part of Speech]
1. Main definition (most common usage)
   - *Example: "example sentence in English"*

2. Secondary definition (if commonly used)
   - *Example: "example sentence in English"*

Requirements:
- Include phonetic transcription
- Focus on the 2-3 most common meanings only
- only Definitions in ${this.outputLanguage}
- Part of Speech should be in English
- Provide ONE clear example sentence per definition
- Keep content concise and suitable for vocabulary card recording
- NO synonyms or antonyms needed
- Use clear Markdown formatting`;
    }

    private async lookupWithAI(word: string): Promise<DictionaryResult> {
        const prompt = this.buildLookupPrompt(word);

        try {
            const cacheKey = `lookup:${word}:${this.outputLanguage}`;
            const content = await this.dictionaryService.makeAIRequest(prompt, cacheKey, true);
            const result = this.parseAIResponse(content);
            return result;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(t('dictionary.network_error'));
        }
    }

    private parseAIResponse(content: string): DictionaryResult {
        try {
            const data = JSON.parse(content);

            if (!data.word || !data.meanings || !Array.isArray(data.meanings)) {
                throw new Error('Invalid AI response format');
            }

            const result: DictionaryResult = {
                word: data.word,
                meanings: []
            };

            if (data.phonetic) {
                result.phonetic = data.phonetic;
            }

            if (data.phonetics && Array.isArray(data.phonetics)) {
                result.phonetics = data.phonetics
                    .filter((p: any) => p.text || p.audio)
                    .map((p: any) => ({
                        text: p.text,
                        audio: p.audio
                    }));
            }

            if (data.meanings && Array.isArray(data.meanings)) {
                result.meanings = data.meanings.map((meaning: any) => ({
                    partOfSpeech: meaning.partOfSpeech || '',
                    definitions: (meaning.definitions || []).map((def: any) => ({
                        definition: def.definition || '',
                        example: def.example,
                        synonyms: def.synonyms || [],
                        antonyms: def.antonyms || []
                    }))
                }));
            }

            if (data.sourceUrl) {
                result.sourceUrl = data.sourceUrl;
            }

            return result;
        } catch (error) {
            console.error('Failed to parse AI response:', content, error);
            throw new Error(t('dictionary.invalid_response'));
        }
    }
}
