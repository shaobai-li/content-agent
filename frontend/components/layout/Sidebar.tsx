"use client";

import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Settings, Ellipsis, Monitor, History, BookOpen, FileText } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

// 菜单项接口
export interface MenuItem {
  label: string;
  href?: string;  // 可选的跳转链接
}

// 路由项接口
export interface RouteItem {
  href: string;
  label: string;
  menuItems?: MenuItem[];  // 可选的下拉菜单项
}

interface SidebarProps {
  routes: RouteItem[];
}

export function Sidebar({ routes }: SidebarProps) {
  const currentPath = usePathname();

  return (
    <Card className="w-70 shrink-0 flex flex-col gap-0 p-0 rounded-none shadow-none bg-white">
      <div className="flex items-center px-3">
        <Image 
          className="mb-[-20px]"
          src="/OmniAge_Logo_4K.svg"
          // src="/OmniAge_Logo_black_2.svg"
          alt="OmniAge Logo" 
          width={190}
          height={80}
          priority
        />
      </div>
      <CardContent className="flex-grow flex flex-col p-4 gap-1">
        {routes.map((route) => {
          // 检查当前路径是否匹配该路由或其子路由
          const isActive = currentPath === route.href || currentPath.startsWith(`${route.href}/`);
          const hasMenu = route.menuItems && route.menuItems.length > 0;

          return (
            <div
              key={route.href}
              className={cn(
                "group relative flex items-center w-full rounded-md text-sm hover:bg-sidebar-accent text-sidebar-foreground",
                isActive && "bg-sidebar-accent"
              )}
            >
              <Link href={route.href} className="flex-1 px-4 py-2 flex items-center gap-3">
                <Monitor className="size-4 shrink-0" />
                <span className="truncate max-w-[150px]">{route.label}</span>
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
                    {route.menuItems!.map((item, index) => (
                      <DropdownMenuItem key={index} asChild={!!item.href}>
                        {item.href ? (
                          <Link href={item.href}>
                            {item.label === "Chat History" && <History className="size-4" />}
                            {item.label === "Knowledge Base" && <BookOpen className="size-4" />}
                            {item.label === "Document View" && <FileText className="size-4" />}
                            {item.label}
                          </Link>
                        ) : (
                          <span>
                            {item.label === "Chat History" && <History className="size-4" />}
                            {item.label === "Knowledge Base" && <BookOpen className="size-4" />}
                            {item.label === "Document View" && <FileText className="size-4" />}
                            {item.label}
                          </span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
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

