"use client";
import { createContext, useContext } from "react";

export interface SidebarContextValue {
  /** 侧边栏是否展开（桌面端收起 / 移动端 overlay 共用同一状态） */
  sidebarOpen: boolean;
  /** 切换侧边栏展开/收起 */
  toggleSidebar: () => void;
  /** 收起侧边栏 */
  closeSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  sidebarOpen: false,
  toggleSidebar: () => {},
  closeSidebar: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

/** 兼容旧调用方，仅取 toggle 函数（Commit 2 切到 useSidebar 后移除） */
export function useSidebarToggle() {
  return useContext(SidebarContext).toggleSidebar;
}

export { SidebarContext };
