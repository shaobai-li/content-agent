import { HistoryHeader } from "../history/HistoryHeader";
import { HistoryPanel } from "../history/HistoryPanel";

import { CanvasHeader } from "../canvas/CanvasHeader";
import { CanvasPanel } from "../canvas/CanvasPanel";

import { KnowledgeBaseHeader } from "../knowledge-base/KnowledgeBaseHeader";
import { KnowledgeBasePanel } from "../knowledge-base/KnowledgeBasePanel";

import { SettingsHeader } from "../settings/SettingsHeader";
import { SettingsPanel } from "../settings/SettingsPanel";

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
    header: <CanvasHeader />,
    body: <CanvasPanel agentId={agentId} />,
  }),

  knowledgebase: (agentId) => ({
    header: <KnowledgeBaseHeader agentId={agentId} />,
    body: <KnowledgeBasePanel agentId={agentId} />,
  }),

  settings: (agentId) => ({
    header: <SettingsHeader />,
    body: <SettingsPanel agentId={agentId} />,
  }),

  chat: () => ({
    header: null,
    body: <div className="p-4 text-muted-foreground">请开始对话</div>,
  }),
};
