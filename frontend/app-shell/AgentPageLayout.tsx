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
            className="h-full flex-grow grid transition-[grid-template-columns] duration-300 ease-in-out"
            style={{
                gridTemplateColumns: isCollapsed ? "0fr auto" : "1fr auto",
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

            {/* 右侧面板 */}
            {rightBody}
        </div>
    );
}

