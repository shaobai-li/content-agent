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
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const cached = collapseCache.get(agentId);
    if (cached !== undefined) return cached;
    return defaultCollapsed;
  });

  // 检测 agentId 切换：保存上一个 agent 的状态，恢复当前 agent 的状态
  const prevAgentRef = useRef(agentId);
  useEffect(() => {
    const prev = prevAgentRef.current;
    if (prev !== agentId) {
      collapseCache.set(prev, isCollapsed);
      setIsCollapsed(collapseCache.get(agentId) ?? defaultCollapsed);
    }
    prevAgentRef.current = agentId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

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
