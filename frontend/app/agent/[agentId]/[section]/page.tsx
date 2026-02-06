"use client";

import { AgentPageLayout } from "@/components/layout/AgentPageLayout";
import { ChatPage } from "@/components/features/chat/ChatPage";
import { HistoryPanel } from "@/components/features/history/HistoryPanel";
import { HistoryHeader } from "@/components/features/history/HistoryHeader";
import { DataHeader } from "@/components/features/data/DataHeader";
import { DocumentHeader } from "@/components/features/document/DocumentHeader";
import { DocumentPanel } from "@/components/features/document/DocumentPanel";
import { KbDataPanel } from "@/app/agent_kb/components/KbDataPanel";
import { NmDataPanel } from "@/app/agent_nm/components/NmDataPanel";
import { useParams } from "next/navigation";

// 根据 agentId 获取知识库面板
const getKnowledgePanel = (agentId: string) => {
  switch (agentId) {
    case "kb":
      return <KbDataPanel />;
    case "nm":
      return <NmDataPanel />;
    default:
      return <div className="p-4 text-muted-foreground">暂无数据面板</div>;
  }
};

export default function AgentSectionPage() {
  const params = useParams();
  const agentId = params.agentId as string;
  const section = params.section as string;

  // 根据 section 获取左侧面板组件
  let leftHeader: React.ReactNode = null;
  let leftBody: React.ReactNode = null;

  switch (section) {
    case "history":
      leftHeader = <HistoryHeader />;
      leftBody = <HistoryPanel />;
      break;
    case "knowledge":
      leftHeader = <DataHeader />;
      leftBody = getKnowledgePanel(agentId);
      break;
    case "document":
      leftHeader = <DocumentHeader />;
      leftBody = <DocumentPanel agentId={agentId} />;
      break;
    default:
      // 默认显示历史记录
      leftHeader = <HistoryHeader />;
      leftBody = <HistoryPanel />;
  }

  return (
    <AgentPageLayout
      leftHeader={leftHeader}
      leftBody={leftBody}
      rightBody={<ChatPage agentId={agentId} />}
    />
  );
}

