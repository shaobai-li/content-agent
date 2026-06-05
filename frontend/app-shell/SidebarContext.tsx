"use client";
import { createContext, useContext } from "react";

const SidebarToggleContext = createContext<() => void>(() => {});

export function useSidebarToggle() {
  return useContext(SidebarToggleContext);
}

export { SidebarToggleContext };
