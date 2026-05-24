"use client";

import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import Image from "next/image";
import { Settings, Ellipsis, Monitor, History, BookOpen, FileText, EyeOff, LogOut, SlidersHorizontal, User, Info } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { hideAgent, getHiddenAgentIds, isAgentVisible } from "@/entities/agent/visibility";
import { agentRegistry } from "@/entities/agent/agent.registry";
import { useAuth } from "@/entities/auth/store";

const STORAGE_KEY = "agent-order";

const SETTINGS_NAV = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "account", label: "Account", icon: User },
  { id: "about", label: "About", icon: Info },
] as const;

type SettingId = (typeof SETTINGS_NAV)[number]["id"];

function loadOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOrder(order: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}

// 菜单项接口
export interface MenuItem {
  label: string;
  href?: string;
  icon?: "history" | "knowledgebase" | "document" | "settings";
  onClick?: () => void;
}

// 路由项接口
export interface RouteItem {
  href: string;
  label: string;
  agentId?: string;
  menuItems?: MenuItem[];  // 可选的下拉菜单项
}

interface SidebarProps {
  routes: RouteItem[];
}

function SortableRoute({ route, isActive, children }: { route: RouteItem; isActive: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: route.href,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative flex items-center w-full rounded-md text-sm hover:bg-sidebar-accent text-sidebar-foreground cursor-grab active:cursor-grabbing",
        isActive && "bg-sidebar-accent",
      )}
    >
      {children}
    </div>
  );
}

export function Sidebar({ routes }: SidebarProps) {
  const currentPath = usePathname();
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => getHiddenAgentIds());
  const { user, logout, enabled: authEnabled } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedSetting, setSelectedSetting] = useState<SettingId>("general");

  const handleHide = useCallback((agentId: string) => {
    hideAgent(agentId);
    setHiddenIds(getHiddenAgentIds());
  }, []);

  // 过滤隐藏的 agent
  const visibleRoutes = routes.filter((route) => {
    if (!route.agentId) return true;
    const agent = agentRegistry[route.agentId];
    return isAgentVisible(route.agentId, agent?.visible ?? true);
  });

  // 拖拽传感器：拖拽距离 >= 5px 才触发，避免误触点击
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // 从 localStorage 读取已保存的顺序
  const [order, setOrder] = useState<string[]>(() => loadOrder());

  // 根据 localStorage order 排序可见 routes
  const sortedRoutes = useMemo(() => {
    if (order.length === 0) return visibleRoutes;
    const orderMap = new Map(order.map((id, i) => [id, i]));
    const sorted = [...visibleRoutes].sort(
      (a, b) => (orderMap.get(a.href) ?? Infinity) - (orderMap.get(b.href) ?? Infinity),
    );
    return sorted;
  }, [visibleRoutes, order]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeRoute = useMemo(
    () => visibleRoutes.find((r) => r.href === activeId),
    [visibleRoutes, activeId],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = sortedRoutes.findIndex((r) => r.href === active.id);
      const newIndex = sortedRoutes.findIndex((r) => r.href === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const newSorted = arrayMove(sortedRoutes, oldIndex, newIndex);
      const newOrder = newSorted.map((r) => r.href);
      setOrder(newOrder);
      saveOrder(newOrder);
    },
    [sortedRoutes],
  );

  return (
    <>
      <Card className="w-70 shrink-0 flex flex-col gap-0 p-0 rounded-none shadow-none bg-white">
      <div className="flex items-center px-3">
        <Image
          className="mb-[-20px]"
          src="/OmniAge_Logo_4K.svg"
          alt="OmniAge Logo"
          width={190}
          height={80}
          priority
        />
      </div>
      <CardContent className="flex-grow flex flex-col p-4 gap-0">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedRoutes.map((r) => r.href)}
            strategy={verticalListSortingStrategy}
          >
            {sortedRoutes.map((route) => {
              const isActive = currentPath === route.href || currentPath.startsWith(`${route.href}/`);
              const hasMenu = route.menuItems && route.menuItems.length > 0;

              return (
                <SortableRoute key={route.href} route={route} isActive={isActive}>
                  <Link href={route.href} className="flex-1 px-2 py-2 flex items-center gap-3">
                    <Monitor className="size-4 shrink-0" />
                    <span className="truncate max-w-[130px]">{route.label}</span>
                  </Link>

                  {hasMenu && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-sidebar-accent/50 rounded"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Ellipsis className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {route.menuItems!.map((item, index) => {
                          const IconMap = {
                            history: History,
                            knowledgebase: BookOpen,
                            document: FileText,
                            settings: Settings,
                          };
                          const Icon = item.icon ? IconMap[item.icon] : null;
                          return (
                            <DropdownMenuItem key={index} asChild={!!item.href}>
                              {item.href ? (
                                <Link href={item.href} className="flex items-center gap-2">
                                  {Icon && <Icon className="size-4" />}
                                  {item.label}
                                </Link>
                              ) : (
                                <span className="flex items-center gap-2 cursor-pointer">
                                  {Icon && <Icon className="size-4" />}
                                  {item.label}
                                </span>
                              )}
                            </DropdownMenuItem>
                          );
                        })}
                        {route.agentId && (
                          <>
                            <div className="h-px bg-border mx-1 my-1" />
                            <DropdownMenuItem onClick={() => handleHide(route.agentId!)}>
                              <span className="flex items-center gap-2 cursor-pointer">
                                <EyeOff className="size-4" />
                                隐藏
                              </span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </SortableRoute>
              );
            })}
          </SortableContext>

          <DragOverlay>
            {activeRoute ? (
              <div className="flex items-center px-4 py-2 rounded-md bg-white shadow-lg border text-sm">
                <Monitor className="size-4 shrink-0 mr-3" />
                <span className="truncate max-w-[130px]">{activeRoute.label}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </CardContent>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="p-4 flex justify-between items-center border-t cursor-pointer hover:bg-sidebar-accent transition-colors">
            <Avatar className="size-8">
              {authEnabled && user ? (
                <AvatarFallback className="bg-neutral-600 text-white text-[10px]">{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
              ) : (
                <>
                  <AvatarImage src="https://github.com/shadcn.png" />
                  <AvatarFallback className="bg-neutral-600 text-white text-[10px]">CNZ</AvatarFallback>
                </>
              )}
            </Avatar>
            <div className="flex-1 flex flex-col px-3">
              <span className="text-sm font-medium text-left">
                {authEnabled && user ? user.username : "User Name"}
              </span>
              {!authEnabled && (
                <span className="text-xs text-muted-foreground">Level 1 Pilot</span>
              )}
            </div>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-48">
          <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
            <span className="flex items-center gap-2 cursor-pointer">
              <Settings className="size-4" />
              设置
            </span>
          </DropdownMenuItem>
          {authEnabled && (
            <>
              <div className="h-px bg-border mx-1 my-1" />
              <DropdownMenuItem onClick={logout}>
                <span className="flex items-center gap-2 cursor-pointer">
                  <LogOut className="size-4" />
                  退出登录
                </span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </Card>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="!max-w-none w-[660px] max-h-[85vh] p-0 flex flex-row gap-0 overflow-hidden">
          <div className="w-1/3 shrink-0 flex flex-col border-r border-border p-6 overflow-y-auto">
            <DialogTitle className="text-sm font-semibold text-muted-foreground mb-4">Settings</DialogTitle>
            <nav className="flex flex-col gap-1">
              {SETTINGS_NAV.map((item) => {
                const Icon = item.icon;
                const isActive = selectedSetting === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedSetting(item.id)}
                    className={cn(
                      "flex items-center w-full gap-3 px-2 py-2 rounded-md text-sm text-sidebar-foreground transition-colors",
                      "hover:bg-sidebar-accent",
                      isActive && "bg-sidebar-accent",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="flex-1 bg-muted p-6 overflow-y-auto">
            <h3 className="text-sm font-semibold text-foreground border-b border-foreground/20 pb-2 mb-4">
              {SETTINGS_NAV.find((i) => i.id === selectedSetting)?.label}
            </h3>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

