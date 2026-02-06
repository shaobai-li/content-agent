# 路由结构说明

## 新路由架构

项目已重构为动态路由结构，使用以下模式：

```
/agent/[agentId]/[section]
```

### 路由参数

- **agentId**: Agent 标识符（如 `kb`, `w`, `c`, `nm`）
- **section**: 左侧面板类型（如 `history`, `knowledge`, `document`）

### 可用路由

#### 知识库 Agent (kb)
- `/agent/kb/history` - 历史聊天记录
- `/agent/kb/knowledge` - 知识库数据面板

#### 内容生成 Agent (w)
- `/agent/w/history` - 历史聊天记录
- `/agent/w/document` - 文档视图

#### 内容检测 Agent (c)
- `/agent/c/history` - 历史聊天记录
- `/agent/c/document` - 文档视图

#### 笔记管理 Agent (nm)
- `/agent/nm/history` - 历史聊天记录
- `/agent/nm/knowledge` - 笔记库数据面板

## 页面结构

每个路由页面都遵循相同的布局结构：

```tsx
<AgentPageLayout
  leftHeader={/* 根据 section 变化 */}
  leftBody={/* 根据 section 变化 */}
  rightBody={<ChatPage agentId={agentId} />} {/* agentId 保持一致 */}
/>
```

### 组件映射

| Section | Left Header | Left Body |
|---------|-------------|-----------|
| history | HistoryHeader | HistoryPanel |
| knowledge | DataHeader | KbDataPanel / NmDataPanel |
| document | DocumentHeader | DocumentPanel |

## 关键特性

1. **统一的 ChatPage**: 右侧聊天界面始终存在，只是 `agentId` 不同
2. **动态左侧面板**: 根据 URL 中的 `section` 参数切换左侧面板内容
3. **默认重定向**: 访问 `/agent/[agentId]` 会自动重定向到 `/agent/[agentId]/history`
4. **Sidebar 高亮**: 自动识别当前路由并高亮对应的 Agent

## 文件结构

```
frontend/app/
├── agent/
│   └── [agentId]/
│       ├── page.tsx              # 默认重定向到 history
│       └── [section]/
│           └── page.tsx          # 动态路由主页面
├── agent_kb/                     # 旧版路由（可以删除）
├── agent_w/                      # 旧版路由（可以删除）
├── agent_c/                      # 旧版路由（可以删除）
└── agent_nm/                     # 旧版路由（可以删除）
```

## 添加新 Agent

要添加新的 Agent，只需在 `layout.tsx` 中添加路由配置：

```tsx
{
  href: "/agent/new_agent",
  label: "新 Agent 名称",
  menuItems: [
    { label: "Chat History", href: "/agent/new_agent/history" },
    { label: "Knowledge Base", href: "/agent/new_agent/knowledge" },
  ],
}
```

## 添加新 Section

要为特定 Agent 添加新的 section，需要：

1. 在 `/app/agent/[agentId]/[section]/page.tsx` 中添加新的 case
2. 创建对应的 Header 和 Panel 组件
3. 在 `layout.tsx` 的 menuItems 中添加新的导航链接

示例：

```tsx
case "new_section":
  leftHeader = <NewSectionHeader />;
  leftBody = <NewSectionPanel agentId={agentId} />;
  break;
```

## 迁移注意事项

### 旧版页面文件

以下目录包含旧版的静态路由页面，可以考虑删除：

- `app/agent_kb/`
- `app/agent_w/`
- `app/agent_c/`
- `app/agent_nm/`

但请保留各 Agent 的特定组件（如 `KbDataPanel.tsx`, `NmDataPanel.tsx`），因为新的动态路由仍在使用它们。

### 保留的组件

保留在 `agent_kb/components/` 和 `agent_nm/components/` 中的组件：
- `KbDataPanel.tsx`
- `NmDataPanel.tsx`
- `columns.tsx`

这些组件被新的动态路由引用。

