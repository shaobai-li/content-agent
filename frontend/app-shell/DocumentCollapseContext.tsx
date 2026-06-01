"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

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

export function DocumentCollapseProvider({
  children,
  defaultCollapsed = true,
}: {
  children: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(() => defaultCollapsed);

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
