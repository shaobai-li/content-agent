"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface DocumentCollapseContextValue {
  isCollapsed: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

const DocumentCollapseContext = createContext<DocumentCollapseContextValue>({
  isCollapsed: true,
  toggle: () => {},
  setCollapsed: () => {},
});

/** 模块级缓存：组件实例复用时按 agentId 隔离折叠状态 */
const collapseCache = new Map<string, boolean>();

export function DocumentCollapseProvider({
  children,
  agentId,
  defaultCollapsed = true,
}: {
  children: ReactNode;
  agentId: string;
  defaultCollapsed?: boolean;
}) {
  // autoExpand 模式（defaultCollapsed=false）时跳过缓存，确保强制展开
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (!defaultCollapsed) return false;
    const cached = collapseCache.get(agentId);
    if (cached !== undefined) return cached;
    return defaultCollapsed;
  });

  // 检测 agentId 切换：保存上一个 agent 的状态，恢复当前 agent 的状态
  // 若 defaultCollapsed=false（autoExpand），则忽略缓存强制展开
  const prevAgentRef = useRef(agentId);
  useEffect(() => {
    const prev = prevAgentRef.current;
    if (prev !== agentId) {
      collapseCache.set(prev, isCollapsed);
      if (!defaultCollapsed) {
        // autoExpand 模式：强制展开，忽略缓存中此 agent 的历史折叠状态
        // 解决 effect 时序竞态：子组件（AgentPageLayoutInner）的 setCollapsed(false)
        // 会被本 effect 的缓存恢复 setCollapsed(true) 覆盖的问题
        setIsCollapsed(false);
      } else {
        setIsCollapsed(collapseCache.get(agentId) ?? defaultCollapsed);
      }
    }
    prevAgentRef.current = agentId;
  }, [agentId, defaultCollapsed]);

  // 持久化当前折叠状态
  useEffect(() => {
    collapseCache.set(agentId, isCollapsed);
  }, [agentId, isCollapsed]);

  return (
    <DocumentCollapseContext.Provider
      value={{ isCollapsed, toggle: () => setIsCollapsed((v) => !v), setCollapsed: setIsCollapsed }}
    >
      {children}
    </DocumentCollapseContext.Provider>
  );
}

export function useDocumentCollapse() {
  return useContext(DocumentCollapseContext);
}
