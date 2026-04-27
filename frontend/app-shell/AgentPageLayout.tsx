"use client"

import { ReactNode } from "react";
import { DocumentCollapseProvider, useDocumentCollapse } from "./DocumentCollapseContext";

interface AgentPageLayoutProps {
    leftHeader?: ReactNode;
    leftBody?: ReactNode;
    rightBody: ReactNode;
}

export function AgentPageLayout(props: AgentPageLayoutProps) {
    return (
        <DocumentCollapseProvider>
            <AgentPageLayoutInner {...props} />
        </DocumentCollapseProvider>
    );
}

function AgentPageLayoutInner({ leftHeader, leftBody, rightBody }: AgentPageLayoutProps) {
    const { isCollapsed } = useDocumentCollapse();

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
                <div className="flex-1 flex flex-col p-6 border bg-neutral-50">
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

