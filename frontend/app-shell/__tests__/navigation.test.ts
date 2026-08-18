import { beforeEach, describe, expect, it } from "vitest";
import { getSidebarRoutes } from "@/app-shell/navigation";
import { agentRegistry } from "@/entities/agent/agent.registry";
import type { Agent, UIModule } from "@/entities/agent/model";

function makeAgent(name: string, left: UIModule[]): Agent {
  return {
    name,
    title: name,
    visible: true,
    locked: false,
    layout: {
      left,
      defaultLeft: (left[0] ?? "history") as Agent["layout"]["defaultLeft"],
      right: ["chat"],
      defaultRight: "chat",
    },
  };
}

describe("getSidebarRoutes", () => {
  beforeEach(() => {
    // 清空注册表，避免用例间污染（agentRegistry 是可变对象）
    for (const key of Object.keys(agentRegistry)) {
      delete agentRegistry[key];
    }
  });

  it("菜单项来自 layout.left 且按声明顺序，非 admin 不含管理页", () => {
    agentRegistry["std"] = makeAgent("std", [
      "history",
      "settings",
      "knowledgebase",
      "canvas",
    ]);
    const routes = getSidebarRoutes();
    const menu = routes[0].menuItems ?? [];
    expect(menu.map((m) => m.icon)).toEqual([
      "history",
      "settings",
      "knowledgebase",
      "canvas",
    ]);
    expect(menu.some((m) => m.icon === "management")).toBe(false);
  });

  it("admin 追加管理页菜单项", () => {
    agentRegistry["admin"] = makeAgent("admin", ["history", "settings"]);
    const routes = getSidebarRoutes();
    const menu = routes[0].menuItems ?? [];
    expect(menu.map((m) => m.icon)).toEqual([
      "history",
      "settings",
      "management",
    ]);
  });

  it("layout.left 中未声明的模块（chat/management）不生成菜单项", () => {
    agentRegistry["a1"] = makeAgent("a1", ["history", "management", "chat"]);
    const routes = getSidebarRoutes();
    const menu = routes[0].menuItems ?? [];
    expect(menu.map((m) => m.icon)).toEqual(["history"]);
  });

  it("未声明 settings 的 agent 无设置菜单项", () => {
    agentRegistry["a2"] = makeAgent("a2", ["history", "knowledgebase"]);
    const routes = getSidebarRoutes();
    const menu = routes[0].menuItems ?? [];
    expect(menu.some((m) => m.icon === "settings")).toBe(false);
  });

  it("旧数据 layout 中的 document 被静默跳过（改名后的健壮性）", () => {
    agentRegistry["legacy"] = makeAgent("legacy", [
      "history",
      "knowledgebase",
      "document" as unknown as UIModule,
    ]);
    const routes = getSidebarRoutes();
    const menu = routes[0].menuItems ?? [];
    expect(menu.map((m) => m.icon)).toEqual(["history", "knowledgebase"]);
  });
});
