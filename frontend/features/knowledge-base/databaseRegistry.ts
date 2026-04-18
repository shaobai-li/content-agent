import type { AgentId } from "@/entities/agent/model";

export interface KnowledgeBaseDatabase {
  id: string;
  name: string;
  description: string;
}

const knowledgeBaseDatabaseRegistry: Partial<Record<AgentId, KnowledgeBaseDatabase[]>> = {
  kb: [
    {
      id: "kb-default",
      name: "知识库数据库",
      description: "点击进入当前知识库数据页",
    },
  ],
  std: [
    {
      id: "std-default",
      name: "标准数据库",
      description: "点击进入当前知识库数据页",
    },
  ],
};

export function getKnowledgeBaseDatabases(agentId: AgentId): KnowledgeBaseDatabase[] {
  return knowledgeBaseDatabaseRegistry[agentId] ?? [];
}

export function getKnowledgeBaseDatabase(agentId: AgentId, databaseId: string) {
  return getKnowledgeBaseDatabases(agentId).find((database) => database.id === databaseId) ?? null;
}
