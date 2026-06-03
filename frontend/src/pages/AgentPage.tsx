"use client";

import { AgentPageLayout } from "@/app-shell/AgentPageLayout";
import { ChatPage } from "@/features/chat/ChatPage";
import { useParams, useSearchParams } from "react-router-dom";
import { agentRegistry } from "@/entities/agent/agent.registry";
import { AgentId, UIModule } from "@/entities/agent/model";
import { uiModuleRegistry } from "@/features/modules/registry";
import { useEffect, useRef, useState } from "react";

/**
 * 模块级缓存：在不同 agentId 间切换时组件实例被复用，
 * useState 不会被重置，用此 Map 按 agent 隔离左侧面板的选择状态。
 */
const leftModuleCache = new Map<string, UIModule>();

export default function AgentPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
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

  // URL ?left= 优先，否则用 defaultLeft（首次渲染与 SSR 一致，避免 hydration 不匹配）
  const leftParam = searchParams.get("left") as UIModule | null;
  const leftAllowed =
    leftParam === "settings" ||
    (leftParam === "management" && agentId === "admin") ||
    (!!leftParam && agent.layout.left.includes(leftParam));

  const [leftModule, setLeftModule] = useState<UIModule>(() => {
    if (leftAllowed && leftParam) return leftParam;
    return leftModuleCache.get(agentId) ?? agent.layout.defaultLeft;
  });

  // 检测 agentId 切换：保存上一个 agent 的状态，恢复当前 agent 的状态
  const prevAgentRef = useRef(agentId);
  useEffect(() => {
    const prev = prevAgentRef.current;
    if (prev !== agentId) {
      // leftModule 在当前 render 闭包中仍是上一个 agent 的值
      leftModuleCache.set(prev, leftModule);
      if (!leftParam) {
        setLeftModule(leftModuleCache.get(agentId) ?? agent.layout.defaultLeft);
      }
    }
    prevAgentRef.current = agentId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  // URL ?left= 变化时同步（用户通过侧边栏下拉菜单切换模块）
  useEffect(() => {
    if (leftAllowed && leftParam) {
      setLeftModule(leftParam);
    }
  }, [leftParam, leftAllowed]);

  // 持久化当前模块选择
  useEffect(() => {
    leftModuleCache.set(agentId, leftModule);
  }, [agentId, leftModule]);

  const renderModule = uiModuleRegistry[leftModule];

  const { header: leftHeader, body: leftBody } = renderModule(agentId);

  // 三点菜单触发的导航（URL 带 ?left=）时自动展开左侧面板
  const autoExpand = leftAllowed && !!leftParam;

  return (
    <AgentPageLayout
      agentId={agentId}
      autoExpand={autoExpand}
      leftParam={leftParam}
      leftHeader={leftHeader}
      leftBody={leftBody}
      rightBody={<ChatPage agentId={agentId} />}
    />
  );
}
