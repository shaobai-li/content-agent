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
  type: "markdown" | "html";
  title: string;
}

interface CanvasPanelProps {
  agentId: string;
}

const STORAGE_KEY_PREFIX = "canvas-cards-";
const CANVAS_CENTER_X = 80;
const CANVAS_CENTER_Y = 60;
const CARD_GAP_Y = 20;
const TITLE_MAX_LENGTH = 60;

function loadCards(agentId: string): CanvasCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${agentId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [];
    }
    return parsed.map((c: Record<string, unknown>): CanvasCard => ({
      id: c.id as string,
      stepNumber: c.stepNumber as number,
      content: c.content as string,
      timestamp: new Date(c.timestamp as string),
      position: c.position as { x: number; y: number },
      type: (c.type as "markdown" | "html") || "markdown",
      title: (c.title as string) || "",
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

function extractTitle(content: string): string {
  // 优先匹配第一个 # 标题
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim().slice(0, TITLE_MAX_LENGTH);
  // 回退到第一行非空文字
  const firstLine = content.split('\n').find(line => line.trim().length > 0);
  return firstLine?.trim().slice(0, TITLE_MAX_LENGTH) || '';
}

export function CanvasPanel({ agentId }: CanvasPanelProps) {
  const [cards, setCards] = useState<CanvasCard[]>(() => loadCards(agentId));
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const cardCountRef = useRef(cards.length);
  const cardsRef = useRef(cards);
  const draggingCard = useRef<string | null>(null);
  const dragStart = useRef({ x: 0, y: 0, cardX: 0, cardY: 0 });

  // Keep refs in sync
  useEffect(() => {
    cardCountRef.current = cards.length;
    cardsRef.current = cards;
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
        position: { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y + yOffset },
        type: "markdown",
        title: extractTitle(article),
      };
      setCards((prev) => [...prev, newCard]);
    };

    window.addEventListener("article-update", handleArticleUpdate);
    return () => window.removeEventListener("article-update", handleArticleUpdate);
  }, [agentId]);

  // 监听 canvas-card 事件（来自 generate_html 工具）
  useEffect(() => {
    const handleCanvasCard = (event: Event) => {
      const { agentId: eventAgentId, content, cardType, title } = (event as CustomEvent).detail;
      if (eventAgentId !== agentId) return;
      if (!content) return;

      const stepNumber = cardCountRef.current + 1;
      const yOffset = (stepNumber - 1) * CARD_GAP_Y;
      const newCard: CanvasCard = {
        id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        stepNumber,
        content,
        timestamp: new Date(),
        position: { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y + yOffset },
        type: cardType || "html",
        title: title || "HTML",
      };
      setCards((prev) => [...prev, newCard]);
    };

    window.addEventListener("canvas-card", handleCanvasCard);
    return () => window.removeEventListener("canvas-card", handleCanvasCard);
  }, [agentId]);

  // Pan + Card drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Check if clicking on a card header (for dragging)
    const cardHeader = (e.target as HTMLElement).closest(".canvas-card-header");
    if (cardHeader) {
      const cardEl = cardHeader.closest(".canvas-card") as HTMLElement;
      const cardId = cardEl?.dataset?.cardId;
      if (cardId) {
        const card = cardsRef.current.find((c) => c.id === cardId);
        if (card) {
          draggingCard.current = cardId;
          dragStart.current = { x: e.clientX, y: e.clientY, cardX: card.position.x, cardY: card.position.y };
          cardEl.style.cursor = "grabbing";
          return;
        }
      }
    }

    // Only pan when clicking the surface background, not cards
    if ((e.target as HTMLElement).closest(".canvas-card")) return;

    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOrigin.current = { ...pan };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Handle card dragging
    if (draggingCard.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setCards((prev) =>
        prev.map((c) =>
          c.id === draggingCard.current
            ? { ...c, position: { x: dragStart.current.cardX + dx, y: dragStart.current.cardY + dy } }
            : c,
        ),
      );
      return;
    }

    // Handle canvas panning
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan({
      x: panOrigin.current.x + dx,
      y: panOrigin.current.y + dy,
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (draggingCard.current) {
      const cardEl = containerRef.current?.querySelector(`[data-card-id="${draggingCard.current}"]`) as HTMLElement | null;
      if (cardEl) cardEl.style.cursor = "";
      draggingCard.current = null;
    }
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

  // 删除卡片
  const handleDeleteCard = useCallback((cardId: string) => {
    setCards((prev) => {
      const filtered = prev.filter((c) => c.id !== cardId);
      // 重新编号：按原 stepNumber 排序后从 1 开始
      return filtered
        .sort((a, b) => a.stepNumber - b.stepNumber)
        .map((card, idx) => ({ ...card, stepNumber: idx + 1 }));
    });
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
            data-card-id={card.id}
            style={{
              left: card.position.x,
              top: card.position.y,
            }}
          >
            <div className="canvas-card-header">
              <span className="canvas-card-header-left">
                <span>{`Step ${card.stepNumber}`}</span>
                {card.title && <span className="canvas-card-title">· {card.title}</span>}
              </span>
              <span className="canvas-card-header-right">
                <span>{card.timestamp.toLocaleTimeString()}</span>
                <button
                  className="canvas-card-close-btn"
                  onClick={(e) => { e.stopPropagation(); handleDeleteCard(card.id); }}
                  title="删除此卡片"
                >
                  ✕
                </button>
              </span>
            </div>
            <div className="canvas-card-content">
              {card.type === "html" ? (
                <div className="canvas-card-html">
                  <div
                    className="canvas-card-thumbnail"
                    onClick={() => setExpandedCardId(expandedCardId === card.id ? null : card.id)}
                  >
                    <iframe
                      srcDoc={card.content}
                      sandbox=""
                      className="canvas-card-iframe"
                      title={card.title}
                    />
                    <div className="canvas-card-overlay">
                      <span>🔍 点击展开</span>
                    </div>
                  </div>
                </div>
              ) : (
                <ReactMarkdown
                  rehypePlugins={[rehypeHighlight]}
                  remarkPlugins={[remarkGfm]}
                >
                  {card.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}

      </div>

      {/* 展开模态 */}
      {expandedCardId && (
        <div
          className="canvas-expanded-overlay"
          onClick={() => setExpandedCardId(null)}
        >
          <div
            className="canvas-expanded-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="canvas-expanded-header">
              <span>
                {cards.find(c => c.id === expandedCardId)?.title || "HTML 预览"}
              </span>
              <button
                className="canvas-expanded-close"
                onClick={() => setExpandedCardId(null)}
              >
                ✕
              </button>
            </div>
            <iframe
              srcDoc={cards.find(c => c.id === expandedCardId)?.content || ""}
              sandbox=""
              className="canvas-expanded-iframe"
            />
          </div>
        </div>
      )}
    </div>
  );
}
