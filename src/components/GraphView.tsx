import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { buildDocGraph, findSimilarChunksBetween, getDocumentChunks, type DocGraph, type DocNode, type SimilarChunkPair } from '../services/doc-graph';
import './GraphView.css';

const CLUSTER_COLORS = [
  '#6c63ff', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
  '#84cc16', '#e11d48', '#0ea5e9', '#a855f7', '#10b981',
];

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  mimeType: string;
  chunkCount: number;
  cluster: number;
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  weight: number;
}

interface Neighbor {
  id: string;
  name: string;
  score: number;
}

interface DetailPanel {
  node: DocNode;
  neighbors: Neighbor[];
  chunks: { id: string; text: string; index: number }[];
  similarChunks: Map<string, SimilarChunkPair[]>;
  loadingChunks: Set<string>;
}

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graph, setGraph] = useState<DocGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [threshold, setThreshold] = useState(0.5);
  const [topK, setTopK] = useState(5);
  const [progress, setProgress] = useState('');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: DocNode; neighbors: Neighbor[] } | null>(null);
  const [detail, setDetail] = useState<DetailPanel | null>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimEdge> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);

  const buildGraphCb = useCallback(async () => {
    setLoading(true);
    setError('');
    setGraph(null);
    setTooltip(null);
    setDetail(null);
    try {
      const result = await buildDocGraph(threshold, topK, (cur, total) => {
        setProgress(`Computing similarities: ${cur}/${total}`);
      });
      if (result.nodes.length === 0) {
        setError('No indexed documents found. Sync some documents first.');
      } else {
        setGraph(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
    setProgress('');
  }, [threshold, topK]);

  useEffect(() => {
    buildGraphCb();
  }, []);

  function getNeighbors(nodeId: string): Neighbor[] {
    const edges = edgesRef.current;
    const nodes = nodesRef.current;
    return edges
      .filter(e => {
        const s = typeof e.source === 'object' ? (e.source as SimNode).id : e.source;
        const t = typeof e.target === 'object' ? (e.target as SimNode).id : e.target;
        return s === nodeId || t === nodeId;
      })
      .map(e => {
        const s = typeof e.source === 'object' ? (e.source as SimNode) : nodes.find(n => n.id === e.source)!;
        const t = typeof e.target === 'object' ? (e.target as SimNode) : nodes.find(n => n.id === e.target)!;
        const other = s.id === nodeId ? t : s;
        return { id: other.id, name: other.name, score: e.weight };
      })
      .sort((a, b) => b.score - a.score);
  }

  async function handleNodeClick(d: DocNode) {
    const neighbors = getNeighbors(d.id);
    const chunks = await getDocumentChunks(d.id);
    setDetail({
      node: d,
      neighbors,
      chunks,
      similarChunks: new Map(),
      loadingChunks: new Set(),
    });
  }

  async function loadSimilarChunks(neighborId: string) {
    if (!detail) return;
    if (detail.similarChunks.has(neighborId) || detail.loadingChunks.has(neighborId)) return;

    setDetail(prev => {
      if (!prev) return prev;
      const loading = new Set(prev.loadingChunks);
      loading.add(neighborId);
      return { ...prev, loadingChunks: loading };
    });

    const pairs = await findSimilarChunksBetween(detail.node.id, neighborId, 3);

    setDetail(prev => {
      if (!prev) return prev;
      const map = new Map(prev.similarChunks);
      map.set(neighborId, pairs);
      const loading = new Set(prev.loadingChunks);
      loading.delete(neighborId);
      return { ...prev, similarChunks: map, loadingChunks: loading };
    });
  }

  useEffect(() => {
    if (!graph || !svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = 500;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 5])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    const nodes: SimNode[] = graph.nodes.map(n => ({ ...n }));
    const edges: SimEdge[] = graph.edges.map(e => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));

    nodesRef.current = nodes;
    edgesRef.current = edges;

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<SimNode, SimEdge>(edges).id(d => d.id).distance(d => 150 * (1 - d.weight)))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => nodeRadius(d as SimNode) + 4));
    simulationRef.current = simulation;

    const link = g.append('g')
      .selectAll<SVGLineElement, SimEdge>('line')
      .data(edges)
      .join('line')
      .attr('stroke', 'var(--border)')
      .attr('stroke-opacity', d => 0.3 + d.weight * 0.7)
      .attr('stroke-width', d => 1 + d.weight * 3);

    const node = g.append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => nodeRadius(d))
      .attr('fill', d => CLUSTER_COLORS[d.cluster % CLUSTER_COLORS.length])
      .attr('stroke', 'var(--bg)')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .call(d3.drag<SVGCircleElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    const label = g.append('g')
      .selectAll<SVGTextElement, SimNode>('text')
      .data(nodes)
      .join('text')
      .text(d => truncate(d.name, 20))
      .attr('font-size', 10)
      .attr('fill', 'var(--text-dim)')
      .attr('text-anchor', 'middle')
      .attr('dy', d => nodeRadius(d) + 14)
      .style('pointer-events', 'none');

    node.on('mouseover', function (event, d) {
      d3.select(this).attr('stroke', 'var(--primary)').attr('stroke-width', 3);
      const neighbors = getNeighbors(d.id);

      const containerRect = container.getBoundingClientRect();
      const mouseX = event.clientX - containerRect.left;
      const mouseY = event.clientY - containerRect.top;

      const tooltipW = 260;
      const tooltipH = 150;
      let tx = mouseX + 16;
      let ty = mouseY - 10;

      if (tx + tooltipW > containerRect.width) tx = mouseX - tooltipW - 16;
      if (ty + tooltipH > containerRect.height) ty = containerRect.height - tooltipH - 8;
      if (tx < 0) tx = 8;
      if (ty < 0) ty = 8;

      setTooltip({ x: tx, y: ty, node: d, neighbors });
    });

    node.on('mouseout', function () {
      d3.select(this).attr('stroke', 'var(--bg)').attr('stroke-width', 1.5);
      setTooltip(null);
    });

    node.on('click', function (_event, d) {
      handleNodeClick(d);
    });

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x!)
        .attr('y1', d => (d.source as SimNode).y!)
        .attr('x2', d => (d.target as SimNode).x!)
        .attr('y2', d => (d.target as SimNode).y!);
      node.attr('cx', d => d.x!).attr('cy', d => d.y!);
      label.attr('x', d => d.x!).attr('y', d => d.y!);
    });

    return () => { simulation.stop(); };
  }, [graph]);

  const clusterCount = graph ? new Set(graph.nodes.map(n => n.cluster)).size : 0;
  const clusters = graph ? [...new Set(graph.nodes.map(n => n.cluster))].sort((a, b) => a - b) : [];

  const mimeLabels: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.google-apps.document': 'Google Doc',
    'text/plain': 'TXT',
  };

  return (
    <div>
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Document Similarity Graph</h3>
        <div className="graph-controls">
          <div className="field">
            <label>Similarity threshold</label>
            <input type="range" min="0.1" max="0.95" step="0.05" value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))} />
            <span>{threshold.toFixed(2)}</span>
          </div>
          <div className="field">
            <label>Max neighbors</label>
            <input type="range" min="1" max="15" step="1" value={topK}
              onChange={e => setTopK(parseInt(e.target.value))} />
            <span>{topK}</span>
          </div>
          <button className="btn btn-primary" onClick={buildGraphCb} disabled={loading}>
            {loading ? 'Building...' : 'Rebuild Graph'}
          </button>
        </div>

        {progress && <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>{progress}</p>}
        {error && <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 8 }}>{error}</p>}

        {graph && (
          <>
            <div className="graph-stats">
              <div>
                <div className="graph-stat-value">{graph.nodes.length}</div>
                <div className="graph-stat-label">Documents</div>
              </div>
              <div>
                <div className="graph-stat-value">{graph.edges.length}</div>
                <div className="graph-stat-label">Connections</div>
              </div>
              <div>
                <div className="graph-stat-value">{clusterCount}</div>
                <div className="graph-stat-label">Clusters</div>
              </div>
            </div>

            <div className="graph-layout">
              <div className="graph-container" ref={containerRef}>
                <svg ref={svgRef} className="graph-svg" />
                {tooltip && (
                  <div className="graph-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
                    <h4>{tooltip.node.name}</h4>
                    <p className="meta">{tooltip.node.chunkCount} chunks &middot; Cluster {tooltip.node.cluster + 1}</p>
                    {tooltip.neighbors.length > 0 && (
                      <>
                        <p style={{ marginTop: 6, fontWeight: 500, fontSize: 11 }}>Similar documents:</p>
                        {tooltip.neighbors.slice(0, 5).map((n, i) => (
                          <p key={i} className="meta">{(n.score * 100).toFixed(0)}% &mdash; {truncate(n.name, 35)}</p>
                        ))}
                      </>
                    )}
                    <p style={{ marginTop: 6, fontSize: 10, color: 'var(--text-dim)' }}>Click to inspect</p>
                  </div>
                )}
                <div className="graph-legend">
                  {clusters.map(c => (
                    <div key={c} className="graph-legend-item">
                      <div className="graph-legend-dot" style={{ background: CLUSTER_COLORS[c % CLUSTER_COLORS.length] }} />
                      <span>Cluster {c + 1} ({graph.nodes.filter(n => n.cluster === c).length})</span>
                    </div>
                  ))}
                </div>
              </div>

              {detail && (
                <div className="graph-detail-panel">
                  <div className="detail-header">
                    <h4>{detail.node.name}</h4>
                    <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setDetail(null)}>Close</button>
                  </div>
                  <div className="detail-meta">
                    <span>{mimeLabels[detail.node.mimeType] || detail.node.mimeType}</span>
                    <span>&middot;</span>
                    <span>{detail.node.chunkCount} chunks</span>
                    <span>&middot;</span>
                    <span style={{ color: CLUSTER_COLORS[detail.node.cluster % CLUSTER_COLORS.length] }}>
                      Cluster {detail.node.cluster + 1}
                    </span>
                  </div>

                  {detail.neighbors.length > 0 && (
                    <div className="detail-section">
                      <h5>Similar Documents ({detail.neighbors.length})</h5>
                      {detail.neighbors.map(n => (
                        <div key={n.id} className="detail-neighbor">
                          <div className="detail-neighbor-header" onClick={() => loadSimilarChunks(n.id)}>
                            <span className="detail-neighbor-score">{(n.score * 100).toFixed(0)}%</span>
                            <span className="detail-neighbor-name">{n.name}</span>
                            <span className="detail-expand">{detail.similarChunks.has(n.id) ? '▾' : '▸'}</span>
                          </div>
                          {detail.loadingChunks.has(n.id) && (
                            <p className="detail-loading">Loading similar chunks...</p>
                          )}
                          {detail.similarChunks.has(n.id) && (
                            <div className="detail-chunk-pairs">
                              {detail.similarChunks.get(n.id)!.map((pair, i) => (
                                <div key={i} className="chunk-pair">
                                  <div className="chunk-pair-score">{(pair.score * 100).toFixed(0)}% match</div>
                                  <div className="chunk-pair-content">
                                    <div className="chunk-side">
                                      <span className="chunk-label">Chunk #{pair.chunkA.index + 1}</span>
                                      <p>{truncate(pair.chunkA.text, 150)}</p>
                                    </div>
                                    <div className="chunk-side">
                                      <span className="chunk-label">Chunk #{pair.chunkB.index + 1}</span>
                                      <p>{truncate(pair.chunkB.text, 150)}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {detail.similarChunks.get(n.id)!.length === 0 && (
                                <p className="detail-loading">No similar chunks found</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="detail-section">
                    <h5>Document Chunks ({detail.chunks.length})</h5>
                    <div className="detail-chunks-list">
                      {detail.chunks.slice(0, 10).map(c => (
                        <div key={c.id} className="detail-chunk">
                          <span className="chunk-label">#{c.index + 1}</span>
                          <p>{truncate(c.text, 200)}</p>
                        </div>
                      ))}
                      {detail.chunks.length > 10 && (
                        <p className="detail-loading">...and {detail.chunks.length - 10} more chunks</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function nodeRadius(d: { chunkCount: number }): number {
  return Math.max(6, Math.min(20, 4 + Math.sqrt(d.chunkCount) * 2));
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
