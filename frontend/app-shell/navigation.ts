import type { MenuItem, RouteItem } from "@/app-shell/Sidebar";
import { agentRegistry } from "@/entities/agent/agent.registry";
import type { UIModule } from "@/entities/agent/model";

const LEFT_MODULE_LABEL_MAP: Record<Exclude<UIModule, "chat" | "settings" | "management">, string> = {
  history: "Chat History",
  knowledgebase: "Knowledge Base",
  document: "Canvas",
};

export function getSidebarRoutes(): RouteItem[] {
  return Object.values(agentRegistry).map((agent) => {
    const menuItems: MenuItem[] = agent.layout.left
      .filter(
        (m): m is Exclude<UIModule, "chat" | "settings" | "management"> =>
          m !== "chat" && m !== "settings" && m !== "management",
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

    if (agent.id === "admin") {
      menuItems.push({
        label: "Management",
        icon: "management",
        href: `/agent/${agent.id}?left=management`,
      });
    }

    return {
      href: `/agent/${agent.id}`,
      label: agent.name,
      agentId: agent.id,
      menuItems,
    };
  });
}
