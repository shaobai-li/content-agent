"use client"

import { AgentPageLayout } from "@/components/layout/AgentPageLayout"
import { ChatPage } from "@/components/features/chat/ChatPage"
import { NmDataPanel } from "./components/NmDataPanel"
import { DataHeader } from "@/components/features/data/DataHeader"

export default function AgentNmPage() {
	return (
		<AgentPageLayout 
			leftHeader={<DataHeader />}
			leftBody={<NmDataPanel />}
			rightBody={<ChatPage agentId="nm" />}
		/>
	)
}