"use client";

import { AgentPageLayout } from "@/app-shell/AgentPageLayout";
import { ChatPage } from "@/features/chat/ChatPage";
import { useParams, useSearchParams } from "next/navigation";
import { agentRegistry } from "@/entities/agent/agent.registry";
import { AgentId, UIModule } from "@/entities/agent/model";
import { uiModuleRegistry } from "@/features/modules/registry";

export default function AgentPage() {
  const params = useParams();
  const searchParams = useSearchParams();
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

  // URL ?left= 优先，否则用 defaultLeft
  const leftParam = searchParams.get("left") as UIModule | null;
  const leftModule =
    leftParam && agent.layout.left.includes(leftParam) ? leftParam : agent.layout.defaultLeft;

  const renderModule = uiModuleRegistry[leftModule];

  const { header: leftHeader, body: leftBody } = renderModule(agentId);

  return (
    <AgentPageLayout
      leftHeader={leftHeader}
      leftBody={leftBody}
      rightBody={<ChatPage agentId={agentId} />}
    />
  );
}