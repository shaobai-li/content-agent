"use client";

import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import Image from "next/image";
import { Settings, Ellipsis, Monitor, History, BookOpen, FileText, EyeOff } from "lucide-react";
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

const STORAGE_KEY = "agent-order";

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
      <div className="p-4 flex justify-between items-center border-t">
        <Avatar className="size-6">
          <AvatarImage src="https://github.com/shadcn.png" />
          <AvatarFallback>CNZ</AvatarFallback>
        </Avatar>
        <div className="flex-1 flex flex-col px-2">
          <span className="text-sm font-medium">User Name</span>
          <span className="text-xs text-muted-foreground">
            Level 1 Pilot
          </span>
        </div>
        <Button variant="ghost" size="icon">
          <Settings className="size-6" />
        </Button>
      </div>
    </Card>
  );
}

