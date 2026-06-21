"use client"

import { ReactNode, useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import { DocumentCollapseProvider, useDocumentCollapse } from "./DocumentCollapseContext";
import { useSidebarToggle } from "./SidebarContext";

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
            className="h-full min-w-0 flex-grow grid transition-[grid-template-columns] duration-300 ease-in-out"
            style={{
                // minmax(0, 1fr) 避免「内容最小宽度」把轨道撑出视口，导致右侧聊天气泡被裁切
                gridTemplateColumns: isCollapsed
                    ? "0fr minmax(0, 1fr)"
                    : "minmax(0, 1fr) minmax(0, 25rem)",
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

            {/* 右侧面板：grid 子项需可收缩，否则长内容会撑开列宽 */}
            <div className="min-h-0 min-w-0 flex flex-col overflow-hidden">
                {rightBody}
            </div>
        </div>
    );
}

