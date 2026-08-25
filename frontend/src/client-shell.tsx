"use client";

import { Sidebar } from "@/app-shell/Sidebar";
import { getSidebarRoutes } from "@/app-shell/navigation";
import { loadAgents, agentRegistry } from "@/entities/agent/agent.registry";
import { AuthProvider, AuthGate } from "@/entities/auth/store";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/shared/lib/cn";
import { SidebarContext } from "@/app-shell/SidebarContext";
import type { RouteItem } from "@/app-shell/Sidebar";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginPage = location.pathname === "/login";
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [ready, setReady] = useState(false);
  // 桌面端首屏展开、移动端首屏收起（与当前两端首屏行为一致）
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

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

  // 路由切换时仅移动端自动收起 overlay 侧边栏（桌面端收起状态不受路由影响）
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  if (!ready) {
    return (
      <div className="flex h-screen">
        {/* 桌面端为 fixed 侧边栏让出 280px 位（与运行时展开态一致） */}
        <div className="flex-1 flex flex-col lg:ml-70" />
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
            <SidebarContext.Provider value={{ sidebarOpen, toggleSidebar, closeSidebar }}>
              {/* 侧边栏：全尺寸统一 fixed + translate-x 滑动收起 */}
              <div
                className={cn(
                  "w-70 transition-transform duration-300 ease-in-out",
                  "fixed inset-y-0 left-0 z-40",
                  sidebarOpen ? "translate-x-0" : "-translate-x-full",
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

              {/* 内容区：移动端满宽；桌面端展开让出 280px 边距、收起占满 */}
              <div
                className={cn(
                  "flex min-h-0 flex-1 flex-col",
                  "transition-[margin] duration-300 ease-in-out",
                  sidebarOpen ? "lg:ml-70" : "lg:ml-0",
                )}
              >
                {children}
              </div>
            </SidebarContext.Provider>
          </div>
        )}
      </AuthGate>
    </AuthProvider>
  );
}
