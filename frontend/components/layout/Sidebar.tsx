"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const currentPath = usePathname();
  
  const routes = [
    { href: "/agent_nm", label: "笔记收集Agent" },
  ];

  return (
    <Card className="w-80 rounded-none border-r shadow-none bg-white">
      <CardContent className="p-4 flex flex-col">
        {routes.map((route) => {
          const isActive = currentPath === route.href;
          return (
              <Button asChild variant="ghost"
                key={route.href}
                className={cn(
                  "w-full justify-start text-sm hover:bg-sidebar-accent text-sidebar-foreground",
                  isActive && "bg-sidebar-accent"
                )}
              >
                <Link href={route.href}>{route.label}</Link>
              </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}

