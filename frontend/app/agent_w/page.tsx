"use client"

import { AgentPageLayout } from "@/components/layout/AgentPageLayout";
import { ChatPage } from "@/components/features/chat/ChatPage";
import { HistoryHeader } from "@/components/features/history/HistoryHeader";
import { HistoryPanel } from "@/components/features/history/HistoryPanel";

export default function AgentWPage() {
	return (
		<AgentPageLayout
			leftHeader={<HistoryHeader />}
			leftBody={<HistoryPanel />}			
			rightBody={<ChatPage agentId="w" />}
		/>
	);
}

