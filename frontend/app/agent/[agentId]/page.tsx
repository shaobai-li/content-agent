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
      <div className="flex h-full items-center justify-center text-gray-400">
        Agent not found
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