"use client"

import { AgentPageLayout } from "@/components/layout/AgentPageLayout"
import { DataPanel } from "@/components/features/data/DataPanel"
import { DataHeader } from "@/components/features/data/DataHeader"

export default function AgentNmPage() {
	return (
		<AgentPageLayout 
			agentId="note_manager"
			leftHeader={<DataHeader />}
			leftBody={<DataPanel />}
		/>
	)
}