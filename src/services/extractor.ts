import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface DocumentMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modDate?: string;
  pageCount?: number;
}

export interface ExtractedContent {
  text: string;
  pages?: { page: number; text: string }[];
  metadata?: DocumentMetadata;
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

function parsePdfDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  // PDF dates: D:YYYYMMDDHHmmSS or similar
  const m = dateStr.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}${m[4] ? ` ${m[4]}:${m[5] || '00'}:${m[6] || '00'}` : ''}`;
  }
  return dateStr;
}

async function extractPdf(data: ArrayBuffer): Promise<ExtractedContent> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: { page: number; text: string }[] = [];

  // Extract metadata
  const info = await pdf.getMetadata().catch(() => null);
  let metadata: DocumentMetadata | undefined;
  if (info?.info) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const i = info.info as Record<string, any>;
    metadata = {
      title: i.Title || undefined,
      author: i.Author || undefined,
      subject: i.Subject || undefined,
      keywords: i.Keywords || undefined,
      creator: i.Creator || undefined,
      producer: i.Producer || undefined,
      creationDate: parsePdfDate(i.CreationDate),
      modDate: parsePdfDate(i.ModDate),
      pageCount: pdf.numPages,
    };
  }

  // Build metadata header to prepend to the document text
  const metaParts: string[] = [];
  if (metadata) {
    if (metadata.title) metaParts.push(`Title: ${metadata.title}`);
    if (metadata.author) metaParts.push(`Author: ${metadata.author}`);
    if (metadata.subject) metaParts.push(`Subject: ${metadata.subject}`);
    if (metadata.keywords) metaParts.push(`Keywords: ${metadata.keywords}`);
    if (metadata.creationDate) metaParts.push(`Created: ${metadata.creationDate}`);
    if (metadata.modDate) metaParts.push(`Modified: ${metadata.modDate}`);
    if (metadata.pageCount) metaParts.push(`Pages: ${metadata.pageCount}`);
  }

  let fullText = '';
  if (metaParts.length > 0) {
    fullText = '[Document Metadata]\n' + metaParts.join('\n') + '\n\n';
  }

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Reconstruct text with spatial awareness for tables/columns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: { str: string; transform: number[]; width: number }[] = (content.items as any[]).filter((item) => 'str' in item && item.str.length > 0);

    if (items.length === 0) {
      pages.push({ page: i, text: '' });
      continue;
    }

    // Sort by Y (descending = top to bottom) then X (left to right)
    items.sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 3) return yDiff;
      return a.transform[4] - b.transform[4];
    });

    // Group items into lines by Y proximity
    const lines: { y: number; items: typeof items }[] = [];
    for (const item of items) {
      const y = item.transform[5];
      const lastLine = lines[lines.length - 1];
      if (lastLine && Math.abs(lastLine.y - y) < 3) {
        lastLine.items.push(item);
      } else {
        lines.push({ y, items: [item] });
      }
    }

    // Detect table-like structures: lines with multiple columns separated by large gaps
    const pageLines: string[] = [];
    for (const line of lines) {
      line.items.sort((a, b) => a.transform[4] - b.transform[4]);

      // Check for large gaps between items (table columns)
      let hasTableGaps = false;
      if (line.items.length > 1) {
        for (let j = 1; j < line.items.length; j++) {
          const gap = line.items[j].transform[4] - (line.items[j - 1].transform[4] + line.items[j - 1].width);
          if (gap > 30) { hasTableGaps = true; break; }
        }
      }

      if (hasTableGaps) {
        // Format as tab-separated for table rows
        const cells = line.items.map(item => item.str.trim()).filter(Boolean);
        pageLines.push(cells.join(' | '));
      } else {
        const text = line.items.map(item => item.str).join(' ');
        pageLines.push(text);
      }
    }

    // Detect figure/image references in text
    let pageText = pageLines.join('\n');

    // Annotate figure references
    pageText = pageText.replace(
      /\b(Fig(?:ure)?\.?\s*\d+[a-z]?(?:\.\d+)?)/gi,
      '[Figure Reference: $1]'
    );
    // Annotate table references
    pageText = pageText.replace(
      /\b(Table\s*\d+(?:\.\d+)?)/gi,
      '[Table Reference: $1]'
    );

    const cleaned = cleanText(pageText);
    pages.push({ page: i, text: cleaned });
    fullText += `[Page ${i}]\n${cleaned}\n\n`;
  }

  return { text: cleanText(fullText), pages, metadata };
}

async function extractDocx(data: ArrayBuffer): Promise<ExtractedContent> {
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return { text: cleanText(result.value) };
}
