"use client"

import { AgentPageLayout } from "@/components/layout/AgentPageLayout";
import { ChatPage } from "@/components/features/chat/ChatPage";
import { KbDataPanel } from "./components/KbDataPanel";
import { DataHeader } from "@/components/features/data/DataHeader";

export default function AgentKbPage() {
    return (
        <AgentPageLayout 
            leftHeader={<DataHeader />}
            leftBody={<KbDataPanel />}
            rightBody={<ChatPage agentId="kb" />}
        />
    );    
}

