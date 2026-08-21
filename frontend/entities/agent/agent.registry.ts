import { Agent } from "./model";
import { http } from "@/shared/api/http";

const DEFAULT_LAYOUT = {
  left: ["history", "settings"] as Agent["layout"]["left"],
  defaultLeft: "history" as Agent["layout"]["defaultLeft"],
  right: ["chat"] as Agent["layout"]["right"],
  defaultRight: "chat" as Agent["layout"]["defaultRight"],
};

/** title 缺失时的默认显示名（与后端 DEFAULT_AGENT_TITLE 保持一致） */
const DEFAULT_AGENT_TITLE = "未命名智能体";

/** 可变的对象引用，供 getSidebarRoutes / page.tsx 同步读取。 */
export const agentRegistry: Record<string, Agent> = {};

/** 启动时调用：从后端 API 拉取 agent 列表并填入 agentRegistry。 */
export async function loadAgents(): Promise<void> {
  try {
    const data = await http.get<{ agents: any[] }>('/api/agents');
    if (!Array.isArray(data?.agents)) throw new Error("unexpected response");

    // 清空后再填入（保持引用不变）
    for (const key of Object.keys(agentRegistry)) {
      delete agentRegistry[key];
    }
    for (const item of data.agents) {
      agentRegistry[item.name] = {
        name: item.name,
        title: item.title ?? DEFAULT_AGENT_TITLE,
        visible: item.visible ?? true,
        locked: item.locked ?? false,
        layout: item.layout ?? DEFAULT_LAYOUT,
      };
    }
  } catch (err) {
    console.warn("[agent.registry] fetch failed:", err);
    throw err;
  }
}

/** 重新拉取 agent 列表并通知侧边栏刷新（设置页保存 title 等配置后调用）。 */
export async function refreshAgentRegistry(): Promise<void> {
  // best-effort：拉取失败时保留旧注册表（loadAgents 失败不会清空已有数据），不向上抛出
  await loadAgents().catch(() => {});
  window.dispatchEvent(new CustomEvent("agent-registry-refresh"));
}
