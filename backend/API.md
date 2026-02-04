# Content Agent System - API 文档

## 架构设计

每个 Agent 都有独立的路由模块，遵循统一的 URL 模式：

```
/api/{agentId}/{endpoint}
```

## Agent 列表

| Agent ID | 名称 | 说明 |
|----------|------|------|
| `nm` | Note Manager | 笔记管理 Agent |
| `kb` | Knowledge Base | 知识库 Agent |
| `c` | Content Detection | 内容检测 Agent |
| `w` | Write Agent | 写作助手 Agent |

## API 端点

### 1. Note Manager (nm)

#### POST /api/nm/chat
笔记管理 Agent 聊天接口

**请求体:**
```json
{
  "content": "帮我下载这个 B站视频",
  "agent_id": "nm"
}
```

**响应:**
```json
{
  "reply": "好的，我来帮你下载..."
}
```

#### GET /api/nm/records
获取笔记管理记录

**响应:**
```json
{
  "records": [
    {
      "record_id": "xxx",
      "source_platform": "bilibili",
      "author_name": "作者名",
      "images": [],
      "videos": []
    }
  ]
}
```

### 2. Knowledge Base (kb)

#### POST /api/kb/chat
知识库 Agent 聊天接口

**请求体:**
```json
{
  "content": "搜索关于 Python 的笔记",
  "agent_id": "kb"
}
```

#### GET /api/kb/records
获取知识库记录

**响应:**
```json
{
  "records": [
    {
      "id": "xxx",
      "title": "标题",
      "category": "分类",
      "created_at": "2024-01-01"
    }
  ]
}
```

### 3. Content Detection (c)

#### POST /api/c/chat
内容检测 Agent 聊天接口

**请求体:**
```json
{
  "content": "检测这段文本的主题",
  "agent_id": "c"
}
```

### 4. Write Agent (w)

#### POST /api/w/chat
写作助手 Agent 聊天接口

**请求体:**
```json
{
  "content": "帮我写一篇关于 AI 的文章",
  "agent_id": "w"
}
```

## 健康检查

### GET /
系统健康检查端点

**响应:**
```json
{
  "status": "running",
  "version": "2.0.0",
  "agents": ["nm", "kb", "c", "w"]
}
```

## 文件结构

```
backend/
├── main.py                          # 主入口，注册所有路由
└── app/
    └── agents/
        ├── note_manager/
        │   ├── routes.py           # nm 路由
        │   └── agent_note_manager.py
        ├── knowledge_base/
        │   ├── routes.py           # kb 路由
        │   └── __init__.py
        ├── content_detection/
        │   ├── routes.py           # c 路由
        │   └── __init__.py
        └── write_agent/
            ├── routes.py           # w 路由
            └── __init__.py
```

## 开发指南

### 添加新的 Agent

1. 在 `backend/app/agents/` 下创建新目录
2. 创建 `routes.py` 文件定义路由
3. 在 `main.py` 中导入并注册路由：

```python
from app.agents.new_agent.routes import router as new_router
app.include_router(new_router, prefix="/api/new", tags=["New Agent"])
```

### 运行服务

```bash
cd backend
python main.py
```

服务将在 `http://localhost:8000` 启动

访问 `http://localhost:8000/docs` 查看自动生成的 API 文档

