import { HistoryHeader } from "../history/HistoryHeader";
import { HistoryPanel } from "../history/HistoryPanel";

import { DocumentHeader } from "../document/DocumentHeader";
import { DocumentPanel } from "../document/DocumentPanel";

import { DataHeader } from "../data/DataHeader";
import { DataPanel } from "../data/DataPanel";

import { AgentId } from "@/entities/agent/model";
import { agentRegistry } from "@/entities/agent/agent.registry";

export type ModuleRenderResult = {
  header: React.ReactNode;
  body: React.ReactNode;
};

const getKnowledgePanel = (agentId: AgentId) => {
  const agent = agentRegistry[agentId];
  
  if (!agent?.dataPanelConfig) {
    return <div className="p-4 text-muted-foreground">暂无数据面板</div>;
  }

  return <DataPanel {...agent.dataPanelConfig} />;
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
