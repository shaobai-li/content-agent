"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "./Canvas.css";

interface CanvasCard {
  id: string;
  stepNumber: number;
  content: string;
  timestamp: Date;
  position: { x: number; y: number };
}

interface CanvasPanelProps {
  agentId: string;
}

const STORAGE_KEY_PREFIX = "canvas-cards-";
const CANVAS_CENTER_X = 80;
const CANVAS_CENTER_Y = 40;
const CARD_GAP_Y = 20;

function loadCards(agentId: string): CanvasCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${agentId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((c: Record<string, unknown>) => ({
      ...c,
      timestamp: new Date(c.timestamp as string),
    }));
  } catch {
    return [];
  }
}

function saveCards(agentId: string, cards: CanvasCard[]) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${agentId}`, JSON.stringify(cards));
  } catch {
    // storage full or unavailable
  }
}

export function CanvasPanel({ agentId }: CanvasPanelProps) {
  const [cards, setCards] = useState<CanvasCard[]>(() => loadCards(agentId));
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const cardCountRef = useRef(cards.length);

  // Keep ref in sync
  useEffect(() => {
    cardCountRef.current = cards.length;
  }, [cards]);

  // Persist cards to localStorage
  useEffect(() => {
    saveCards(agentId, cards);
  }, [agentId, cards]);

  // Listen for article-update events from ChatPage
  useEffect(() => {
    const handleArticleUpdate = (event: Event) => {
      const { agentId: eventAgentId, article } = (event as CustomEvent).detail;
      if (eventAgentId !== agentId) return;
      if (!article) return;

      const stepNumber = cardCountRef.current + 1;
      const yOffset = (stepNumber - 1) * CARD_GAP_Y;

      const newCard: CanvasCard = {
        id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        stepNumber,
        content: article,
        timestamp: new Date(),
        position: {
          x: CANVAS_CENTER_X,
          y: CANVAS_CENTER_Y + yOffset,
        },
      };

      setCards((prev) => [...prev, newCard]);
    };

    window.addEventListener("article-update", handleArticleUpdate);
    return () => window.removeEventListener("article-update", handleArticleUpdate);
  }, [agentId]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan when clicking the surface background, not cards
    if ((e.target as HTMLElement).closest(".canvas-card")) return;

    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOrigin.current = { ...pan };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan({
      x: panOrigin.current.x + dx,
      y: panOrigin.current.y + dy,
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -10 : 10;
      setZoom((prev) => Math.max(25, Math.min(400, prev + delta)));
    } else {
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  }, []);

  const zoomIn = () => setZoom((prev) => Math.min(400, prev + 10));
  const zoomOut = () => setZoom((prev) => Math.max(25, prev - 10));
  const zoomToFit = () => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Toolbar */}
      <div className="canvas-toolbar">
        <button className="canvas-toolbar-btn" onClick={zoomOut} title="Zoom Out">−</button>
        <span className="canvas-zoom-level">{zoom}%</span>
        <button className="canvas-toolbar-btn" onClick={zoomIn} title="Zoom In">+</button>
        <div className="canvas-toolbar-divider" />
        <button className="canvas-toolbar-btn" onClick={zoomToFit} title="Fit to Screen">⟲</button>
      </div>

      {/* Surface */}
      <div
        className="canvas-surface"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.id}
            className="canvas-card"
            style={{
              left: card.position.x,
              top: card.position.y,
            }}
          >
            <div className="canvas-card-header">
              <span>Step {card.stepNumber}</span>
              <span>{card.timestamp.toLocaleTimeString()}</span>
            </div>
            <div className="canvas-card-content">
              <ReactMarkdown
                rehypePlugins={[rehypeHighlight]}
                remarkPlugins={[remarkGfm]}
              >
                {card.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {cards.length === 0 && (
          <div className="canvas-empty">
            <h3>No content yet</h3>
            <p>Start a chat — LLM responses will appear here as cards</p>
          </div>
        )}
      </div>
    </div>
  );
}
