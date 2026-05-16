"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface DocumentCollapseContextValue {
  isCollapsed: boolean;
  toggle: () => void;
}

const DocumentCollapseContext = createContext<DocumentCollapseContextValue>({
  isCollapsed: true,
  toggle: () => {},
});

export function DocumentCollapseProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  return (
    <DocumentCollapseContext.Provider
      value={{ isCollapsed, toggle: () => setIsCollapsed((v) => !v) }}
    >
      {children}
    </DocumentCollapseContext.Provider>
  );
}

export function useDocumentCollapse() {
  return useContext(DocumentCollapseContext);
}
