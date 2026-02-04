"use client"

import { ReactNode } from "react";
import { useChat } from "@/hooks/useChat";
import { ChatHeader } from "@/components/features/chat/ChatHeader";
import { ChatMessage } from "@/components/features/chat/ChatMessage";
import { ChatInput } from "@/components/features/chat/ChatInput";

interface AgentPageLayoutProps {
    agentId: string;
    leftHeader?: ReactNode;
    leftBody?: ReactNode;
}

export function AgentPageLayout({ agentId, leftHeader, leftBody }: AgentPageLayoutProps) {
    const { input, setInput, messages, handleSend } = useChat({ agentId });

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
            
            {/* 右侧聊天面板 */}
            <div className="w-100 flex flex-col">
                <ChatHeader />
                <div className="flex-1 flex flex-col">
                    <div className="flex-1 flex flex-col border p-4 bg-neutral-50">
                        <ChatMessage messages={messages} />
                    </div>
                    <div className="flex flex-col border p-4 bg-background">
                        <ChatInput value={input} onChange={setInput} onSend={handleSend} />
                    </div>
                </div>
            </div>
        </div>
    );
}

