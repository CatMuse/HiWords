// 简单的 TTS 工具：根据模板生成 URL 并播放
import type HiWordsPlugin from '../../main';

let __hiw_shared_audio__: HTMLAudioElement | null = null;

export function buildTtsUrl(tpl: string | undefined, word: string): string | null {
  if (!tpl || !word) return null;
  const enc = encodeURIComponent(word.trim());
  return tpl.split('{{word}}').join(enc);
}

export async function playWordTTS(plugin: HiWordsPlugin, word: string) {
  const url = buildTtsUrl(plugin.settings.ttsTemplate, word);
  if (!url) return;

  try {
    if (!__hiw_shared_audio__) __hiw_shared_audio__ = new Audio();
    const audio = __hiw_shared_audio__;
    audio.src = url;
    await audio.play();
  } catch (e) {
    console.warn('HiWords TTS play failed:', e);
  }
}
