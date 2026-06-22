let engine: any = null;
let currentModel = '';

export type LLMProgressCallback = (info: { text: string; progress?: number }) => void;

export async function initLLM(model: string, onProgress?: LLMProgressCallback): Promise<void> {
  if (engine && currentModel === model) return;
  const webllm = await import('@mlc-ai/web-llm');
  engine = await webllm.CreateMLCEngine(model, {
    initProgressCallback: (report: any) => {
      onProgress?.({
        text: report.text,
        progress: report.progress,
      });
    },
  });
  currentModel = model;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export async function generateResponse(
  question: string,
  contextChunks: { text: string; documentName: string; section?: string }[]
): Promise<string> {
  if (!engine) throw new Error('LLM not initialized');

  const systemMsg = 'You are a helpful technical document assistant. Only answer based on provided sources.';
  const promptTemplate = `You are a technical document assistant. Answer the question using ONLY the provided document excerpts. If the answer cannot be found in the sources, say so. Always reference which source(s) you used.\n\nSources:\n`;
  const questionPart = `\n\nQuestion: ${question}`;

  const maxResponseTokens = 512;
  const contextLimit = 3500 - estimateTokens(systemMsg) - estimateTokens(promptTemplate) - estimateTokens(questionPart) - maxResponseTokens;

  const includedSources: string[] = [];
  let usedTokens = 0;
  for (const c of contextChunks) {
    const sourceText = `[Source ${includedSources.length + 1}: ${c.documentName}${c.section ? ` - ${c.section}` : ''}]\n${c.text}`;
    const tokens = estimateTokens(sourceText);
    if (usedTokens + tokens > contextLimit && includedSources.length > 0) break;
    includedSources.push(sourceText);
    usedTokens += tokens;
  }

  const prompt = promptTemplate + includedSources.join('\n\n') + questionPart;

  const response = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: maxResponseTokens,
  });

  return response.choices[0].message.content || 'No response generated.';
}

export function isLLMReady(): boolean {
  return engine !== null;
}
