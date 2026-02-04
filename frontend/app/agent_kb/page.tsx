"use client"

import { AgentPageLayout } from "@/components/layout/AgentPageLayout";
import { KbDataPanel } from "./components/KbDataPanel";
import { DataHeader } from "@/components/features/data/DataHeader";

export default function AgentKbPage() {
    return (
        <AgentPageLayout 
            agentId="knowledge_base_agent"
            leftHeader={<DataHeader />}
            leftBody={<KbDataPanel />}
        />
    );    
}

