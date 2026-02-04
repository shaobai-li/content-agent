"use client"

import { AgentPageLayout } from "@/components/layout/AgentPageLayout"
import { NmDataPanel } from "./components/NmDataPanel"
import { DataHeader } from "@/components/features/data/DataHeader"

export default function AgentNmPage() {
	return (
		<AgentPageLayout 
			agentId="note_manager"
			leftHeader={<DataHeader />}
			leftBody={<NmDataPanel />}
		/>
	)
}