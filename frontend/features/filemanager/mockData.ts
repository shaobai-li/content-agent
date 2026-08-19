import type { FileNode } from "./types";

/** mock 文件树（未接后端，Plan 2 用于纯前端演示） */
export const MOCK_TREE: FileNode = {
  id: "root",
  name: "工作区",
  type: "folder",
  children: [
    {
      id: "docs",
      name: "项目文档",
      type: "folder",
      children: [
        {
          id: "docs-req",
          name: "需求说明.md",
          type: "file",
          size: 2431,
          modifiedAt: "2026-08-12T09:30:00",
          content: "# 需求说明\n\n## 目标\n- 支持多 Agent 协作\n- 配置驱动，无需改代码即可新增 Agent\n\n## 非目标\n- 不包含计费功能",
        },
        {
          id: "docs-plan",
          name: "技术方案.md",
          type: "file",
          size: 5820,
          modifiedAt: "2026-08-13T14:00:00",
          content: "# 技术方案\n\n## 架构\n- Python / Rust 双后端并行\n- 前端 SPA + Tauri 桌面壳\n\n## 数据流\n- SSE 流式聊天协议",
        },
        {
          id: "docs-minutes",
          name: "会议纪要.txt",
          type: "file",
          size: 976,
          modifiedAt: "2026-08-15T10:20:00",
          content: "会议纪要\n\n时间：2026-08-15\n议题：文件管理模块设计\n结论：先做前端 mock，再接后端。",
        },
      ],
    },
    {
      id: "code",
      name: "代码",
      type: "folder",
      children: [
        {
          id: "code-main",
          name: "main.py",
          type: "file",
          size: 1530,
          modifiedAt: "2026-08-16T11:00:00",
          content: "def main():\n    print(\"hello omniage\")\n\nif __name__ == \"__main__\":\n    main()",
        },
        {
          id: "code-agent",
          name: "agent.py",
          type: "file",
          size: 4210,
          modifiedAt: "2026-08-16T16:30:00",
          content: "class StandardAgent:\n    def handle_chat_stream(self, ctx):\n        ...",
        },
        {
          id: "code-config",
          name: "config.json",
          type: "file",
          size: 320,
          modifiedAt: "2026-08-17T09:00:00",
          content: '{\n  "name": "OmniAge",\n  "port": 8000\n}',
        },
      ],
    },
    {
      id: "assets",
      name: "素材",
      type: "folder",
      children: [
        {
          id: "assets-logo",
          name: "logo.png",
          type: "file",
          size: 153600,
          modifiedAt: "2026-08-10T08:00:00",
        },
        {
          id: "assets-banner",
          name: "banner.jpg",
          type: "file",
          size: 819200,
          modifiedAt: "2026-08-11T12:00:00",
        },
      ],
    },
    {
      id: "data",
      name: "数据",
      type: "folder",
      children: [
        {
          id: "data-users",
          name: "users.csv",
          type: "file",
          size: 2048,
          modifiedAt: "2026-08-14T15:00:00",
          content: "id,name,role\n1,Alice,admin\n2,Bob,user",
        },
        {
          id: "data-export",
          name: "export.json",
          type: "file",
          size: 7680,
          modifiedAt: "2026-08-18T10:00:00",
          content: '{\n  "total": 42,\n  "exportedAt": "2026-08-18T10:00:00Z"\n}',
        },
      ],
    },
    {
      id: "readme",
      name: "README.md",
      type: "file",
      size: 1204,
      modifiedAt: "2026-08-01T09:00:00",
      content: "# OmniAge\n\n配置驱动的多智能体 AI 平台。\n\n## 快速开始\n1. 安装依赖\n2. 启动后端\n3. 启动前端",
    },
  ],
};
