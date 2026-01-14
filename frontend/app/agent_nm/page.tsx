"use client"

import { useChat } from "@/hooks/useChat"
import { ChatMessage } from "@/components/features/chat/ChatMessage"
import { ChatInput } from "@/components/features/chat/ChatInput"
import { DataPanel } from "@/components/features/data/DataPanel"
import { DataHeader } from "@/components/features/data/DataHeader"
import { ChatHeader } from "@/components/features/chat/ChatHeader"

export default function AgentPage() {
	const { input, setInput, messages, handleSend } = useChat({ agentId: "note_manager" })
	return (
		<div className="h-full flex flex-grow flex-row">
			<div className="flex-1 flex flex-col">
				<DataHeader />
				<div className="flex-1 flex flex-col p-4 border bg-neutral-50">
					<DataPanel />
				</div>
			</div>
			<div className="w-100 flex-none flex flex-col">
				<ChatHeader />
				<div className="flex-1 flex flex-col p-4 border bg-neutral-50">
					<ChatMessage messages={messages} />
					<ChatInput value={input} onChange={setInput} onSend={handleSend} />
				</div>
			</div>
		</div>
	)
}