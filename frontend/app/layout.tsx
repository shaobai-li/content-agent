import "./globals.css";
import { Sidebar, RouteItem } from "@/components/layout/Sidebar";

const routes: RouteItem[] = [
  // {
  //   href: "/agent/nm",
  //   label: "笔记收集Agent",
  //   menuItems: [
  //     { label: "历史聊天", href: "/agent/nm/history" },
  //     { label: "笔记库", href: "/agent/nm/knowledge" },
  //   ],
  // },
  {
    href: "/agent/kb",
    label: "知识库Agent(POC)",
    menuItems: [
      { label: "Chat History", href: "/agent/kb/history" },
      { label: "Knowledge Base", href: "/agent/kb/knowledge" },
    ],
  },
  {
    href: "/agent/w",
    label: "内容生成Agent(POC)",
    menuItems: [
      { label: "Chat History", href: "/agent/w/history" },
      { label: "Document View", href: "/agent/w/document" },
    ],
  },
  {
    href: "/agent/c",
    label: "文字内容检测Agent(POC)",
    menuItems: [
      { label: "Chat History", href: "/agent/c/history" },
      { label: "Document View", href: "/agent/c/document" },
    ],
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased bg-background">
        <div className="flex h-screen">
          <Sidebar routes={routes} />

          <div className="flex-1 flex flex-col">{children}</div>
        </div>
      </body>
    </html>
  );
}