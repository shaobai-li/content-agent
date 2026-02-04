"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Settings } from "lucide-react"
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import { User } from "lucide-react";

export interface RouteItem {
  href: string;
  label: string;
}

interface SidebarProps {
  routes: RouteItem[];
}

export function Sidebar({ routes }: SidebarProps) {
  const currentPath = usePathname();

  return (
    <Card className="w-80 flex flex-col gap-0 p-0 rounded-none shadow-none bg-white">
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
      <CardContent className="flex-grow flex flex-col p-4">
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

