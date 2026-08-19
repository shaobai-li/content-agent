import type { MenuItem, RouteItem } from "@/app-shell/Sidebar";
import { agentRegistry } from "@/entities/agent/agent.registry";
import type { UIModule } from "@/entities/agent/model";

// 左侧面板模块 → 翻译 key 映射
// 三点菜单只渲染 layout.left 中声明且在此映射内的模块（未知 key / chat / management 静默跳过）
type SidebarLeftModule = "history" | "knowledgebase" | "canvas" | "settings" | "filemanager";

const LEFT_MODULE_LABEL_MAP: Record<SidebarLeftModule, string> = {
  history: "history",
  knowledgebase: "knowledgeBase",
  canvas: "canvas",
  settings: "settings",
  filemanager: "fileManager",
};

function isSidebarLeftModule(m: UIModule): m is SidebarLeftModule {
  return m in LEFT_MODULE_LABEL_MAP;
}

export function getSidebarRoutes(): RouteItem[] {
  return Object.values(agentRegistry).map((agent) => {
    const menuItems: MenuItem[] = agent.layout.left
      .filter(isSidebarLeftModule)
      .map((module) => ({
        labelKey: `sidebar.nav.${LEFT_MODULE_LABEL_MAP[module]}`,
        href: `/agent/${agent.name}?left=${module}`,
        icon: module,
      }));

    // admin 管理页豁免：不由 SYSTEM.md 控制，仅 admin 可见
    if (agent.name === "admin") {
      menuItems.push({
        labelKey: "sidebar.nav.management",
        icon: "management",
        href: `/agent/${agent.name}?left=management`,
      });
    }

    return {
      href: `/agent/${agent.name}`,
      label: agent.title,
      agentId: agent.name,
      menuItems,
    };
  });
}
