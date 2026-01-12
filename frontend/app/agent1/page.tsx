"use client"

import { useChat } from "@/hooks/useChat"
import { ChatMessage } from "@/components/features/chat/ChatMessage"
import { ChatInput } from "@/components/features/chat/ChatInput"

export default function AgentPage() {
	const { input, setInput, messages, handleSend } = useChat({ agentId: "note_manager" })
	return (
		<div className="h-full flex flex-grow flex-col border">
			<ChatMessage messages={messages} />
			<ChatInput value={input} onChange={setInput} onSend={handleSend} />
		</div>
	)
}