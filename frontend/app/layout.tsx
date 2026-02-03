import "./globals.css";
import { Sidebar, RouteItem } from "@/components/layout/Sidebar";

const routes: RouteItem[] = [
  { href: "/agent_nm", label: "笔记收集Agent" },
  { href: "/agent2", label: "内容生成Agent(POC)" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background">
        <div className="flex h-screen">
          <Sidebar routes={routes} />

          <div className="flex-1 flex flex-col">{children}</div>
        </div>
      </body>
    </html>
  );
}