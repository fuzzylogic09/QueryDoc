import { useState, useRef, useEffect } from 'react';
import { answerQuestion } from '../services/search';
import { initLLM, isLLMReady } from '../services/llm';
import type { ChatMessage, AppSettings } from '../types';
import './ChatView.css';

export function ChatView({ settings }: { settings: AppSettings }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [llmStatus, setLlmStatus] = useState<string>('');
  const [llmReady, setLlmReady] = useState(isLLMReady());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleLoadLLM() {
    setLlmStatus('Loading LLM model...');
    try {
      await initLLM(settings.llmModel, (info) => {
        setLlmStatus(info.text);
      });
      setLlmReady(true);
      setLlmStatus('LLM ready');
    } catch (e) {
      setLlmStatus(`Error: ${e}`);
    }
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { answer, sources } = await answerQuestion(input, settings);
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: answer,
        sources,
        timestamp: new Date(),
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (e) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${e}. Make sure documents are indexed and the LLM is loaded.`,
        timestamp: new Date(),
      };
      setMessages((m) => [...m, errorMsg]);
    }

    setLoading(false);
  }

  return (
    <div className="chat-view">
      {!llmReady && (
        <div className="card llm-init">
          <p>The LLM model needs to be loaded before you can ask questions. This downloads the model to your browser (one-time).</p>
          <button className="btn btn-primary" onClick={handleLoadLLM} disabled={!!llmStatus && !llmStatus.startsWith('Error')}>
            {llmStatus || 'Load LLM Model'}
          </button>
          {llmStatus && <p className="llm-status">{llmStatus}</p>}
        </div>
      )}

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty-chat">
            <p>Ask a question about your indexed documents.</p>
            <p className="hint">e.g. "Where is requirement REQ-213 mentioned?"</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-content">{msg.content}</div>
            {msg.sources && msg.sources.length > 0 && (
              <div className="sources">
                <span className="sources-label">Sources:</span>
                {msg.sources.map((s, i) => (
                  <span key={i} className="source-tag">
                    {s.documentName}
                    {s.chunk.section ? ` - ${s.chunk.section}` : ''}
                    <span className="score">({(s.score * 100).toFixed(0)}%)</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="message-content typing">Thinking...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={llmReady ? 'Ask a question...' : 'Load the LLM first...'}
          disabled={!llmReady || loading}
        />
        <button className="btn btn-primary" onClick={handleSend} disabled={!llmReady || loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
