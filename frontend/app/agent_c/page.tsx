"use client"

import { ChatHeader } from "@/components/features/chat/ChatHeader";
import { ChatMessage } from "@/components/features/chat/ChatMessage";
import { ChatInput } from "@/components/features/chat/ChatInput";
import { useChat } from "@/hooks/useChat";

export default function AgentCPage() {
	const { input, setInput, messages, handleSend } = useChat({ agentId: "text_content_detection" })
	return (
		<div className="h-full flex flex-grow flex-row">
			<div className="flex-1 flex flex-col">
				<div className="flex items-center h-16 px-4 border bg-card">
				</div>
				<div className="flex-1 flex flex-col p-4 border bg-neutral-50">					
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

