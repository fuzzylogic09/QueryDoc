import { useState, useRef, useEffect } from 'react';
import { answerQuestion, type SearchStep } from '../services/search';
import { initLLM, isLLMReady } from '../services/llm';
import { getPerformanceStats, LiveMonitor, type PerfStats, type LiveMetrics } from '../services/performance';
import type { ChatMessage, AppSettings } from '../types';
import './ChatView.css';

export function ChatView({ settings }: { settings: AppSettings }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [llmStatus, setLlmStatus] = useState<string>('');
  const [llmReady, setLlmReady] = useState(isLLMReady());
  const [thinkingSteps, setThinkingSteps] = useState<SearchStep[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [perfStats, setPerfStats] = useState<PerfStats | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const monitorRef = useRef<LiveMonitor | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinkingSteps, streamingText]);

  useEffect(() => {
    getPerformanceStats().then(setPerfStats);
    const interval = setInterval(() => {
      getPerformanceStats().then(setPerfStats);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  async function handleLoadLLM() {
    setLlmStatus('Loading LLM model...');
    try {
      await initLLM(settings.llmModel, (info) => {
        setLlmStatus(info.text);
      });
      setLlmReady(true);
      setLlmStatus('LLM ready');
      getPerformanceStats().then(setPerfStats);
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
    setThinkingSteps([]);
    setStreamingText('');

    const monitor = new LiveMonitor((m) => setLiveMetrics({ ...m }));
    monitorRef.current = monitor;
    monitor.start();

    try {
      const { answer, sources, durationMs } = await answerQuestion(input, settings, {
        onStep: (step) => {
          if (step.step === 'streaming') {
            setStreamingText(step.partial);
          } else if (step.step === 'generating') {
            monitor.setGpuActive(true);
            setThinkingSteps((prev) => [...prev, step]);
          } else {
            setThinkingSteps((prev) => [...prev, step]);
          }
        },
        onToken: () => {
          monitor.recordToken();
        },
      });
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: answer,
        sources,
        timestamp: new Date(),
        durationMs,
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

    monitor.stop();
    monitorRef.current = null;
    setLiveMetrics(null);
    setThinkingSteps([]);
    setStreamingText('');
    setLoading(false);
    getPerformanceStats().then(setPerfStats);
  }

  const stepIcons: Record<string, string> = {
    embedding: '🔢',
    searching: '🔍',
    found: '📄',
    generating: '🤖',
    done: '✅',
  };

  return (
    <div className="chat-view">
      {perfStats && (
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-label">RAM</span>
            <span className="stat-value">
              {liveMetrics
                ? `${liveMetrics.ramUsedMB} MB (+${liveMetrics.ramDeltaMB})`
                : perfStats.ramUsedMB > 0
                  ? `${perfStats.ramUsedMB} / ${perfStats.ramTotalMB} MB`
                  : 'N/A'}
            </span>
            {perfStats.ramUsedMB > 0 && (
              <div className="stat-bar">
                <div
                  className={`stat-bar-fill ${perfStats.ramPercent > 80 ? 'danger' : perfStats.ramPercent > 60 ? 'warning' : ''}`}
                  style={{ width: `${liveMetrics ? Math.min(100, (liveMetrics.ramUsedMB / perfStats.ramTotalMB) * 100) : perfStats.ramPercent}%` }}
                />
              </div>
            )}
          </div>
          <div className="stat-item">
            <span className="stat-label">CPU</span>
            {liveMetrics ? (
              <>
                <span className={`stat-value ${liveMetrics.cpuLoad > 80 ? 'stat-danger' : liveMetrics.cpuLoad > 50 ? 'stat-warn' : 'stat-ok'}`}>
                  {liveMetrics.cpuLoad}%
                </span>
                <div className="stat-bar">
                  <div
                    className={`stat-bar-fill ${liveMetrics.cpuLoad > 80 ? 'danger' : liveMetrics.cpuLoad > 50 ? 'warning' : ''}`}
                    style={{ width: `${liveMetrics.cpuLoad}%` }}
                  />
                </div>
              </>
            ) : (
              <span className="stat-value">{perfStats.cpuCores} cores</span>
            )}
          </div>
          <div className="stat-item">
            <span className="stat-label">GPU</span>
            {liveMetrics ? (
              <span className={`stat-value ${liveMetrics.gpuActive ? 'stat-active' : ''}`}>
                {liveMetrics.gpuActive ? 'Active' : 'Idle'}
                {liveMetrics.tokensPerSec > 0 && ` · ${liveMetrics.tokensPerSec} tok/s`}
              </span>
            ) : (
              <span className={`stat-value ${perfStats.gpuAvailable ? 'stat-ok' : 'stat-warn'}`}>
                {perfStats.gpuAvailable ? perfStats.gpuRenderer : 'Not available'}
              </span>
            )}
          </div>
          {liveMetrics ? (
            <div className="stat-item">
              <span className="stat-label">Tokens</span>
              <span className="stat-value">{liveMetrics.totalTokens} · {liveMetrics.elapsedSec}s</span>
            </div>
          ) : (
            <div className="stat-item">
              <span className="stat-label">Storage</span>
              <span className="stat-value">{perfStats.indexedDBSizeMB} MB</span>
            </div>
          )}
        </div>
      )}

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
            {msg.durationMs && (
              <div className="message-meta">answered in {(msg.durationMs / 1000).toFixed(1)}s</div>
            )}
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
          <div className="message assistant thinking-message">
            <div className="thinking-steps">
              {thinkingSteps.map((step, i) => (
                <div key={i} className={`thinking-step ${i === thinkingSteps.length - 1 && !streamingText ? 'active' : 'done'}`}>
                  <span className="step-icon">{stepIcons[step.step] || '...'}</span>
                  <span className="step-text">{step.message}</span>
                  {(i < thinkingSteps.length - 1 || streamingText) && <span className="step-check">done</span>}
                </div>
              ))}
              {thinkingSteps.length === 0 && (
                <div className="thinking-step active">
                  <span className="step-icon">...</span>
                  <span className="step-text">Starting...</span>
                </div>
              )}
              {!streamingText && <div className="thinking-dots"><span /><span /><span /></div>}
            </div>
            {streamingText && (
              <div className="streaming-text">{streamingText}<span className="cursor" /></div>
            )}
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
