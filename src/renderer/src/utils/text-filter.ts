/**
 * Remove LLM control tags from display text.
 * Strips [emotion], [look_*], [focus:x,y] and any other [bracketed] tags
 * so they don't appear in subtitles or chat history.
 */
export function stripLLMTags(text: string): string {
  return text.replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
}
