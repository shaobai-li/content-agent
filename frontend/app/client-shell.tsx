"use client";

import { Sidebar } from "@/app-shell/Sidebar";
import { getSidebarRoutes } from "@/app-shell/navigation";
import { loadAgents } from "@/entities/agent/agent.registry";
import { useEffect, useState } from "react";
import type { RouteItem } from "@/app-shell/Sidebar";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadAgents()
      .then(() => {
        setRoutes(getSidebarRoutes());
        setReady(true);
      })
      .catch(() => {
        // 后端不可达时，静默降级（空 sidebar + 仅内容区）
        setReady(true);
      });
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen">
        <div className="flex-1 flex flex-col" />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar routes={routes} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
