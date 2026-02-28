"use client";

import { AgentPageLayout } from "@/components/layout/AgentPageLayout";
import { ChatPage } from "@/components/features/chat/ChatPage";
import { DataHeader } from "@/components/features/data/DataHeader";
import { DocumentHeader } from "@/components/features/document/DocumentHeader";
import { DocumentPanel } from "@/components/features/document/DocumentPanel";
import { HistoryHeader } from "@/components/features/history/HistoryHeader";
import { HistoryPanel } from "@/components/features/history/HistoryPanel";
import { KbDataPanel } from "@/app/agent_kb/components/KbDataPanel";
import { NmDataPanel } from "@/app/agent_nm/components/NmDataPanel";
import { useParams } from "next/navigation";
import { agentRegistry } from "@/entities/agent/agent.registry";
import { AgentId, UIModule } from "@/entities/agent/model";

// 根据 agentId 获取知识库面板
const getKnowledgePanel = (agentId: AgentId) => {
  switch (agentId) {
    case "kb":
      return <KbDataPanel />;
    case "nm":
      return <NmDataPanel />;
    default:
      return <div className="p-4 text-muted-foreground">暂无数据面板</div>;
  }
};

// 根据 UIModule 类型获取对应的 Header 和 Panel
const getUIComponents = (uiModule: UIModule, agentId: AgentId) => {
  switch (uiModule) {
    case "history":
      return {
        header: <HistoryHeader />,
        body: <HistoryPanel />,
      };
    case "knowledgebase":
      return {
        header: <DataHeader />,
        body: getKnowledgePanel(agentId),
      };
    case "document":
      return {
        header: <DocumentHeader />,
        body: <DocumentPanel agentId={agentId} />,
      };
    case "chat":
      // chat 模块在右侧，左侧可以显示提示信息
      return {
        header: null,
        body: <div className="p-4 text-muted-foreground">请开始对话</div>,
      };
    default:
      return {
        header: null,
        body: <div className="p-4 text-muted-foreground">未知模块</div>,
      };
  }
};

export default function AgentPage() {
  const params = useParams();
  const agentId = params.agentId as AgentId;

  // 从注册表获取 agent 配置
  const agent = agentRegistry[agentId];

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Agent 不存在</h1>
          <p className="text-muted-foreground">找不到 ID 为 &quot;{agentId}&quot; 的 Agent</p>
        </div>
      </div>
    );
  }

  // 根据 agent 的 layout 配置获取对应的组件
  const { header: leftHeader, body: leftBody } = getUIComponents(
    agent.layout.defaultLeft,
    agentId
  );

  return (
    <AgentPageLayout
      leftHeader={leftHeader}
      leftBody={leftBody}
      rightBody={<ChatPage agentId={agentId} />}
    />
  );
}