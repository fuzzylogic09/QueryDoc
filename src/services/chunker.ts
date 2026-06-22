import type { ExtractedContent } from './extractor';

export interface ChunkResult {
  text: string;
  index: number;
  page?: number;
  section?: string;
}

function detectSection(text: string): string | undefined {
  const match = text.match(/^(#{1,3}\s+.+|[A-Z][A-Za-z0-9 \-:]+(?:\n|$))/m);
  return match ? match[1].replace(/^#+\s*/, '').trim() : undefined;
}

export function chunkText(
  content: ExtractedContent,
  chunkSize: number,
  overlap: number
): ChunkResult[] {
  const text = content.text;
  if (!text.trim()) return [];

  const paragraphs = text.split(/\n{2,}/);
  const chunks: ChunkResult[] = [];
  let current = '';
  let chunkIndex = 0;
  let currentPage: number | undefined;

  function wordCount(s: string): number {
    return s.split(/\s+/).filter(Boolean).length;
  }

  function pushChunk(t: string) {
    if (!t.trim()) return;
    chunks.push({
      text: t.trim(),
      index: chunkIndex++,
      page: currentPage,
      section: detectSection(t),
    });
  }

  if (content.pages && content.pages.length > 0) {
    for (const page of content.pages) {
      currentPage = page.page;
      const pageParagraphs = page.text.split(/\n{2,}/);
      for (const para of pageParagraphs) {
        if (wordCount(current + ' ' + para) > chunkSize) {
          pushChunk(current);
          const words = current.split(/\s+/);
          current = words.slice(-overlap).join(' ') + '\n\n' + para;
        } else {
          current = current ? current + '\n\n' + para : para;
        }
      }
    }
  } else {
    for (const para of paragraphs) {
      if (wordCount(current + ' ' + para) > chunkSize) {
        pushChunk(current);
        const words = current.split(/\s+/);
        current = words.slice(-overlap).join(' ') + '\n\n' + para;
      } else {
        current = current ? current + '\n\n' + para : para;
      }
    }
  }

  if (current.trim()) {
    pushChunk(current);
  }

  return chunks;
}
