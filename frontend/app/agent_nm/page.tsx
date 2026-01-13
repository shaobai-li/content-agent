"use client"

import { useChat } from "@/hooks/useChat"
import { ChatMessage } from "@/components/features/chat/ChatMessage"
import { ChatInput } from "@/components/features/chat/ChatInput"
import { DataPanel } from "@/components/layout/DataPanel"

export default function AgentPage() {
	const { input, setInput, messages, handleSend } = useChat({ agentId: "note_manager" })
	return (
		<div className="h-full flex flex-grow flex-row">
			<div className="flex-1 flex flex-col p-4 border">
            	<DataPanel />
          	</div>
			<div className="w-120 flex-none flex flex-col p-4 border">
				<ChatMessage messages={messages} />
				<ChatInput value={input} onChange={setInput} onSend={handleSend} />
			</div>
		</div>
	)
}