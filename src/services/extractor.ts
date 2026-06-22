import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface ExtractedContent {
  text: string;
  pages?: { page: number; text: string }[];
}

function cleanText(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractText(data: ArrayBuffer | string, mimeType: string): Promise<ExtractedContent> {
  if (typeof data === 'string') {
    return { text: cleanText(data) };
  }

  switch (mimeType) {
    case 'application/pdf':
      return extractPdf(data);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractDocx(data);
    default:
      return { text: cleanText(new TextDecoder().decode(data)) };
  }
}

async function extractPdf(data: ArrayBuffer): Promise<ExtractedContent> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: { page: number; text: string }[] = [];
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    const cleaned = cleanText(pageText);
    pages.push({ page: i, text: cleaned });
    fullText += cleaned + '\n\n';
  }

  return { text: cleanText(fullText), pages };
}

async function extractDocx(data: ArrayBuffer): Promise<ExtractedContent> {
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return { text: cleanText(result.value) };
}
