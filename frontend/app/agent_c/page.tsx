"use client"

import { AgentPageLayout } from "@/components/layout/AgentPageLayout";
import { ChatPage } from "@/components/features/chat/ChatPage";

export default function AgentCPage() {
	return (
		<AgentPageLayout 
			leftHeader={null}
			leftBody={null}
			rightBody={<ChatPage agentId="c" />}
		/>
	);
}

