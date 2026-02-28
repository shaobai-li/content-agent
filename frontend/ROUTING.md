# 路由结构说明

## 新路由架构

项目使用简化的动态路由结构：

```
/agent/[agentId]
```

### 路由参数

- **agentId**: Agent 标识符（如 `kb`, `w`, `c`, `nm`）

### 可用路由

#### 知识库 Agent (kb)
- `/agent/kb` - 知识库数据面板 + 聊天界面

#### 内容生成 Agent (w)
- `/agent/w` - 文档视图 + 聊天界面

#### 内容检测 Agent (c)
- `/agent/c` - 文档视图 + 聊天界面

#### 笔记管理 Agent (nm)
- `/agent/nm` - 笔记库数据面板 + 聊天界面

## 页面结构

每个路由页面都遵循相同的布局结构：

```tsx
<AgentPageLayout
  leftHeader={/* 根据 agentId 固定 */}
  leftBody={/* 根据 agentId 固定 */}
  rightBody={<ChatPage agentId={agentId} />}
/>
```

### 组件映射

| AgentId | Left Header | Left Body |
|---------|-------------|-----------|
| kb | DataHeader | KbDataPanel |
| nm | DataHeader | NmDataPanel |
| w | DocumentHeader | DocumentPanel |
| c | DocumentHeader | DocumentPanel |

## 关键特性

1. **统一的 ChatPage**: 右侧聊天界面始终存在，只是 `agentId` 不同
2. **固定左侧面板**: 每个 Agent 有其固定的左侧面板内容
3. **Sidebar 高亮**: 自动识别当前路由并高亮对应的 Agent

## 文件结构

```
frontend/app/
├── agent/
│   └── [agentId]/
│       └── page.tsx              # 动态路由主页面
├── agent_kb/                     # 旧版路由（可以删除）
├── agent_w/                      # 旧版路由（可以删除）
├── agent_c/                      # 旧版路由（可以删除）
└── agent_nm/                     # 旧版路由（可以删除）
```

## 添加新 Agent

要添加新的 Agent，需要：

1. 在 `layout.tsx` 中添加路由配置：

```tsx
{
  href: "/agent/new_agent",
  label: "新 Agent 名称",
}
```

2. 在 `/app/agent/[agentId]/page.tsx` 中添加新的 case：

```tsx
case "new_agent":
  leftHeader = <NewAgentHeader />;
  leftBody = <NewAgentPanel agentId={agentId} />;
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

