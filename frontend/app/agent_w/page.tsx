"use client"

import { useChat } from "@/hooks/useChat";
import { ChatHeader } from "@/components/features/chat/ChatHeader";
import { ChatMessage } from "@/components/features/chat/ChatMessage";
import { ChatInput } from "@/components/features/chat/ChatInput";
import { DataPanel } from "@/components/features/data/DataPanel";
import { DataHeader } from "@/components/features/data/DataHeader";

export default function AgentWPage() {
	const { input, setInput, messages, handleSend } = useChat({ agentId: "write_agent" })
	return (
		<div className="h-full flex flex-grow flex-row">
			<div className="flex-1 flex flex-col">
				<div className="flex h-16 px-4 border bg-card">
                    <DataHeader />
				</div>
				<div className="flex-1 flex flex-col p-4 border bg-neutral-50">					
                    <DataPanel />
				</div>
			</div>
			<div className="w-100 flex flex-col flex-none">
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

