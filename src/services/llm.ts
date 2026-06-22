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

export async function generateResponse(
  question: string,
  contextChunks: { text: string; documentName: string; section?: string }[]
): Promise<string> {
  if (!engine) throw new Error('LLM not initialized');

  const sources = contextChunks
    .map((c, i) => `[Source ${i + 1}: ${c.documentName}${c.section ? ` - ${c.section}` : ''}]\n${c.text}`)
    .join('\n\n');

  const prompt = `You are a technical document assistant. Answer the question using ONLY the provided document excerpts. If the answer cannot be found in the sources, say so. Always reference which source(s) you used.

Sources:
${sources}

Question: ${question}`;

  const response = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a helpful technical document assistant. Only answer based on provided sources.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 1024,
  });

  return response.choices[0].message.content || 'No response generated.';
}

export function isLLMReady(): boolean {
  return engine !== null;
}
