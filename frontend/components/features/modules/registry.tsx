import { HistoryHeader } from "../history/HistoryHeader";
import { HistoryPanel } from "../history/HistoryPanel";

import { DocumentHeader } from "../document/DocumentHeader";
import { DocumentPanel } from "../document/DocumentPanel";

import { DataHeader } from "../data/DataHeader";
import { DataPanel } from "../data/DataPanel";
import { RowActions } from "../data/RowActions";
import { Eye, Trash2 } from "lucide-react";

import { AgentId } from "@/entities/agent/model";
import { agentRegistry } from "@/entities/agent/agent.registry";

export type ModuleRenderResult = {
  header: React.ReactNode;
  body: React.ReactNode;
};

// 根据 agentId 获取对应的知识库面板（配置驱动）
const getKnowledgePanel = (agentId: AgentId) => {
  const agent = agentRegistry[agentId];
  
  if (!agent?.dataPanelConfig) {
    return <div className="p-4 text-muted-foreground">暂无数据面板</div>;
  }

  const { columns, ...panelProps } = agent.dataPanelConfig;

  // 为 KB Agent 添加操作列
  const finalColumns = agentId === "kb" 
    ? [
        ...columns,
        {
          key: "actions",
          label: "",
          render: (record: any) => (
            <div className="px-2 py-5 w-[50px] flex justify-end">
              <RowActions
                actions={[
                  { label: "View", icon: <Eye className="size-4" /> },
                  {
                    label: "Remove",
                    icon: <Trash2 className="size-4 text-red-600" />,
                    destructive: true,
                  },
                ]}
              />
            </div>
          ),
        },
      ]
    : columns;

  return <DataPanel columns={finalColumns} {...panelProps} />;
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
