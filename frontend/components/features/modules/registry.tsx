import { HistoryHeader } from "../history/HistoryHeader";
import { HistoryPanel } from "../history/HistoryPanel";

import { DocumentHeader } from "../document/DocumentHeader";
import { DocumentPanel } from "../document/DocumentPanel";

import { DataHeader } from "../data/DataHeader";
import { KbDataPanel } from "@/app/agent_kb/components/KbDataPanel";
import { NmDataPanel } from "@/app/agent_nm/components/NmDataPanel";

import { AgentId } from "@/entities/agent/model";

export type ModuleRenderResult = {
  header: React.ReactNode;
  body: React.ReactNode;
};

// 根据 agentId 获取对应的知识库面板
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

export const uiModuleRegistry: Record<
  string,
  (agentId: AgentId) => ModuleRenderResult
> = {
  history: () => ({
    header: <HistoryHeader />,
    body: <HistoryPanel />,
  }),

  document: (agentId) => ({
    header: <DocumentHeader />,
    body: <DocumentPanel agentId={agentId} />,
  }),

  knowledgebase: (agentId) => ({
    header: <DataHeader />,
    body: getKnowledgePanel(agentId),
  }),

  chat: () => ({
    header: null,
    body: <div className="p-4 text-muted-foreground">请开始对话</div>,
  }),
};
