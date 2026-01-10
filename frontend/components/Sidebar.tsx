"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const currentPath = usePathname();
  
  const routes = [
    { href: "/agent1", label: "机器人1" },
    { href: "/agent2", label: "机器人2" },
    { href: "/agent3", label: "机器人3" },
  ];

  return (
    <Card className="w-60 rounded-none border-0 shadow-none bg-sidebar">
      <CardContent className="p-4 flex flex-col">
        {routes.map((route) => {
          const isActive = currentPath === route.href;
          return (
              <Button asChild variant="ghost"
                className={cn(
                  "w-full justify-start text-sm hover:bg-sidebar-accent",
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

