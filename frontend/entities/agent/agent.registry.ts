import { Agent } from "./model";
import { http } from "@/shared/api/http";

const DEFAULT_LAYOUT = {
  left: ["history", "knowledgebase", "document"] as Agent["layout"]["left"],
  defaultLeft: "document" as Agent["layout"]["defaultLeft"],
  right: ["chat"] as Agent["layout"]["right"],
  defaultRight: "chat" as Agent["layout"]["defaultRight"],
};

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
      agentRegistry[item.id] = {
        id: item.id,
        name: item.name ?? item.id,
        visible: item.visible ?? true,
        layout: item.layout ?? DEFAULT_LAYOUT,
      };
    }
  } catch (err) {
    console.warn("[agent.registry] fetch failed:", err);
    throw err;
  }
}
