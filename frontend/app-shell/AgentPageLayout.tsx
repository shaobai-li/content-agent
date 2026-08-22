"use client"

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { DocumentCollapseProvider, useDocumentCollapse } from "./DocumentCollapseContext";
import { useSidebarToggle } from "./SidebarContext";
import { Splitter } from "@/shared/ui/splitter";
import { cn } from "@/shared/lib/cn";

/** Chat 宽度持久化 key（全局，跨 agent 共用） */
const CHAT_WIDTH_KEY = "omniage.chatWidth";
/** 默认 Chat 宽度：与旧固定值 25rem 一致 */
const DEFAULT_CHAT_WIDTH = 400;

function loadChatWidth(): number {
  try {
    const v = Number(localStorage.getItem(CHAT_WIDTH_KEY));
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_CHAT_WIDTH;
  } catch {
    return DEFAULT_CHAT_WIDTH;
  }
}

interface AgentPageLayoutProps {
    agentId: string;
    leftHeader?: ReactNode;
    leftBody?: ReactNode;
    rightBody: ReactNode;
    autoExpand?: boolean;
    leftParam?: string | null;
}

interface LayoutInnerProps {
    leftHeader?: ReactNode;
    leftBody?: ReactNode;
    rightBody: ReactNode;
    autoExpand?: boolean;
    leftParam?: string | null;
}

export function AgentPageLayout({ agentId, leftHeader, leftBody, rightBody, autoExpand, leftParam }: AgentPageLayoutProps) {
    return (
        <DocumentCollapseProvider key={agentId} defaultCollapsed={!autoExpand}>
            <AgentPageLayoutInner leftHeader={leftHeader} leftBody={leftBody} rightBody={rightBody} autoExpand={autoExpand} leftParam={leftParam} />
        </DocumentCollapseProvider>
    );
}

function AgentPageLayoutInner({ leftHeader, leftBody, rightBody, autoExpand, leftParam }: LayoutInnerProps) {
    const { isCollapsed, setCollapsed } = useDocumentCollapse();
    const toggleSidebar = useSidebarToggle();
    const prevLeftParam = useRef(leftParam);
    const [chatWidth, setChatWidth] = useState(loadChatWidth);
    // 拖动中临时关闭 grid 过渡动画，避免拖拽被 300ms transition 拖慢
    const [resizing, setResizing] = useState(false);

    const handleChatResize = useCallback((width: number) => {
        setChatWidth(width);
        try {
            localStorage.setItem(CHAT_WIDTH_KEY, String(width));
        } catch {
            // 忽略存储失败（隐私模式等）
        }
    }, []);

    // leftParam 变化时，根据 autoExpand 展开或收起左侧面板
    // 三点菜单导航 → ?left=X  → 展开三视图；取消选择 → 收起为双视图
    useEffect(() => {
        if (leftParam === prevLeftParam.current) return;

        if (autoExpand && isCollapsed) {
            setCollapsed(false);
        } else if (!autoExpand && !isCollapsed) {
            setCollapsed(true);
        }

        prevLeftParam.current = leftParam;
    }, [autoExpand, leftParam, isCollapsed, setCollapsed]);

    return (
        <div
            className={cn(
                "h-full min-w-0 flex-grow grid",
                // 拖动中不应用过渡，否则 grid-template-columns 变化会被 300ms 动画拖慢
                !resizing && "transition-[grid-template-columns] duration-300 ease-in-out",
            )}
            style={{
                // minmax(0, 1fr) 避免「内容最小宽度」把轨道撑出视口，导致右侧聊天气泡被裁切
                gridTemplateColumns: isCollapsed
                    ? "0fr minmax(0, 1fr)"
                    : `minmax(0, 1fr) 0 minmax(0, ${chatWidth}px)`,
            }}
        >
            {/* 左侧面板 */}
            <div className="overflow-hidden flex flex-col min-w-0">
                <div className="flex h-16 px-8 border bg-card shrink-0 items-center gap-2">
                    <button
                        onClick={toggleSidebar}
                        className="lg:hidden p-1.5 -ml-1.5 rounded-md hover:bg-muted transition-colors"
                        aria-label="打开侧边栏"
                    >
                        <Menu className="size-5" />
                    </button>
                    {leftHeader}
                </div>
                <div className="flex min-h-0 flex-1 flex-col p-6 border bg-neutral-50 min-w-0">
                    {leftBody}
                </div>
            </div>

            {/* 可拖拽分隔条：收起时不渲染（网格退回两列） */}
            {!isCollapsed && (
                <Splitter
                    value={chatWidth}
                    onChange={handleChatResize}
                    onDraggingChange={setResizing}
                />
            )}

            {/* 右侧面板：grid 子项需可收缩，否则长内容会撑开列宽 */}
            <div className="min-h-0 min-w-0 flex flex-col overflow-hidden">
                {rightBody}
            </div>
        </div>
    );
}

