"use client";

import { Sidebar } from "@/app-shell/Sidebar";
import { getSidebarRoutes } from "@/app-shell/navigation";
import { loadAgents, agentRegistry } from "@/entities/agent/agent.registry";
import { AuthProvider, AuthGate } from "@/entities/auth/store";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/shared/lib/cn";
import { SidebarToggleContext } from "@/app-shell/SidebarContext";
import type { RouteItem } from "@/app-shell/Sidebar";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginPage = location.pathname === "/login";
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  useEffect(() => {
    loadAgents()
      .then(() => {
        setRoutes(getSidebarRoutes());
        setReady(true);
      })
      .catch(() => {
        setReady(true);
      });
  }, []);

  // 监听自定义智能体创建/删除事件，刷新侧边栏
  useEffect(() => {
    const handler = () => {
      setRoutes(getSidebarRoutes());
    };
    window.addEventListener("agent-registry-refresh", handler);
    return () => window.removeEventListener("agent-registry-refresh", handler);
  }, []);

  // agent 加载完成后，若当前处于根路由则自动导航到 admin agent
  useEffect(() => {
    if (!ready) return;

    const isRoot = location.pathname === "/" || location.pathname === "";
    if (!isRoot) return;

    const adminExists = Object.values(agentRegistry).some((a) => a.name === "admin");
    if (adminExists) {
      navigate("/agent/admin", { replace: true });
    } else {
      // 回退：导航到第一个可用的 agent
      const firstAgent = Object.values(agentRegistry)[0];
      if (firstAgent) {
        navigate(`/agent/${firstAgent.name}`, { replace: true });
      }
    }
  }, [ready, location.pathname, navigate]);

  // 路由切换时自动关闭移动端侧边栏
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (!ready) {
    return (
      <div className="flex h-screen">
        <div className="hidden lg:block w-70 shrink-0 bg-white" />
        <div className="flex-1 flex flex-col" />
      </div>
    );
  }

  return (
    <AuthProvider>
      <AuthGate>
        {isLoginPage ? (
          children
        ) : (
          <div className="flex h-screen">
            {/* 桌面端 inline 侧边栏 / 移动端 overlay 侧边栏 */}
            <div
              className={cn(
                "w-70 transition-transform duration-300 ease-in-out",
                "fixed inset-y-0 left-0 z-40",
                sidebarOpen ? "translate-x-0" : "-translate-x-full",
                "lg:static lg:z-auto lg:translate-x-0 lg:transition-none lg:shrink-0",
              )}
            >
              <Sidebar routes={routes} />
            </div>

            {/* 移动端 overlay 遮罩 */}
            {sidebarOpen && (
              <div
                className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            {/* 内容区 */}
            <div className="flex min-h-0 flex-1 flex-col">
              <SidebarToggleContext.Provider value={toggleSidebar}>
                {children}
              </SidebarToggleContext.Provider>
            </div>
          </div>
        )}
      </AuthGate>
    </AuthProvider>
  );
}
