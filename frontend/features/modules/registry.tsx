import { HistoryHeader } from "../history/HistoryHeader";
import { HistoryPanel } from "../history/HistoryPanel";

import { DocumentHeader } from "../document/DocumentHeader";
import { DocumentPanel } from "../document/DocumentPanel";

import { KnowledgeBaseHeader } from "../knowledge-base/KnowledgeBaseHeader";
import { KnowledgeBasePanel } from "../knowledge-base/KnowledgeBasePanel";

import { AgentId } from "@/entities/agent/model";

export type ModuleRenderResult = {
  header: React.ReactNode;
  body: React.ReactNode;
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
    header: <KnowledgeBaseHeader agentId={agentId} />,
    body: <KnowledgeBasePanel agentId={agentId} />,
  }),

  chat: () => ({
    header: null,
    body: <div className="p-4 text-muted-foreground">请开始对话</div>,
  }),
};
