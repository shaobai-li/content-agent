"use client"

import { ReactNode, useEffect, useRef } from "react";
import { DocumentCollapseProvider, useDocumentCollapse } from "./DocumentCollapseContext";

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
        <DocumentCollapseProvider agentId={agentId} defaultCollapsed={!autoExpand}>
            <AgentPageLayoutInner leftHeader={leftHeader} leftBody={leftBody} rightBody={rightBody} autoExpand={autoExpand} leftParam={leftParam} />
        </DocumentCollapseProvider>
    );
}

function AgentPageLayoutInner({ leftHeader, leftBody, rightBody, autoExpand, leftParam }: LayoutInnerProps) {
    const { isCollapsed, setCollapsed } = useDocumentCollapse();
    const prevLeftParam = useRef(leftParam);

    // 三点菜单切换模块（leftParam 值变化）时，若面板折叠则自动展开
    useEffect(() => {
        if (autoExpand && leftParam !== prevLeftParam.current && isCollapsed) {
            setCollapsed(false);
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
                <div className="flex h-16 px-8 border bg-card shrink-0">
                    {leftHeader}
                </div>
                <div className="flex min-h-0 flex-1 flex-col p-6 border bg-neutral-50">
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

