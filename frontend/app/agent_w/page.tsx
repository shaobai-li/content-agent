"use client"

import { AgentPageLayout } from "@/components/layout/AgentPageLayout";
import { DataPanel } from "@/components/features/data/DataPanel";
import { DataHeader } from "@/components/features/data/DataHeader";

export default function AgentWPage() {
	return (
		<AgentPageLayout 
			agentId="write_agent"
			leftHeader={<DataHeader />}
			leftBody={<DataPanel />}
		/>
	);
}

