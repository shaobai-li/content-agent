"use client"

import { ReactNode } from "react";

interface AgentPageLayoutProps {
    leftHeader?: ReactNode;
    leftBody?: ReactNode;
    rightBody: ReactNode; // 右侧内容（通常是ChatPage）
}

export function AgentPageLayout({ leftHeader, leftBody, rightBody }: AgentPageLayoutProps) {
    return (
        <div className="h-full flex flex-grow flex-row">
            {/* 左侧面板 */}
            <div className="flex-1 flex flex-col">
                <div className="flex h-16 px-4 border bg-card">
                    {leftHeader}
                </div>
                <div className="flex-1 flex flex-col p-4 border bg-neutral-50">
                    {leftBody}
                </div>
            </div>
            
            {/* 右侧面板 */}
            {rightBody}
        </div>
    );
}

