import type { MenuItem, RouteItem } from "@/app-shell/Sidebar";
import { agentRegistry } from "@/entities/agent/agent.registry";
import type { UIModule } from "@/entities/agent/model";

const LEFT_MODULE_LABEL_MAP: Record<Exclude<UIModule, "chat" | "settings">, string> = {
  history: "Chat History",
  knowledgebase: "Knowledge Base",
  document: "Document View",
};

export function getSidebarRoutes(): RouteItem[] {
  return Object.values(agentRegistry).map((agent) => {
    const menuItems: MenuItem[] = agent.layout.left
      .filter(
        (m): m is Exclude<UIModule, "chat" | "settings"> =>
          m !== "chat" && m !== "settings",
      )
      .map((module) => ({
        label: LEFT_MODULE_LABEL_MAP[module],
        href: `/agent/${agent.id}?left=${module}`,
        icon: module,
      }));

    menuItems.push({
      label: "Settings",
      icon: "settings",
      href: `/agent/${agent.id}?left=settings`,
    });

    return {
      href: `/agent/${agent.id}`,
      label: agent.name,
      menuItems,
    };
  });
}
