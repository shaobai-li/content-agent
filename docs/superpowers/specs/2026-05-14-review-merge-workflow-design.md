# Review & Merge 工作流设计

## 概述

在现有的 `add_commit` → `new_pr` 流程之后，增加 review 和 merge 两个独立步骤。
通过 verdict 文件进行步骤间的状态传递，实现自动化 review → merge 流水线。

## 整体架构

```
add_commit  ──▶  new_pr  ──▶  review-pr  ──▶  merge-pr
（已有的）      （已有的）      （新）           （新）
                               │
                    写入 verdict 文件
                    tasks/reviews/<pr-number>.md
                               │
                               ▼
                          merge-pr 读取 verdict
                          decision == approved?
                          ├─ yes → 执行 merge 流程
                          └─ no  → 拒绝并展示原因
```

## 设计原则

- **职责分离**：review 只做质量判断，merge 只做集成执行
- **显式状态传递**：verdict 文件是两个步骤之间的契约接口
- **可审计**：每个 PR 的审查记录持久化在 `tasks/reviews/` 下
- **无 subagent**：review 审查在当前 session 内完成

## 一、Verdict 文件格式

**路径：** `tasks/reviews/<pr-number>.md`

**格式：**

```markdown
# Review Verdict

**PR:** #<number>
**Title:** <PR title>
**Author:** @<author>
**Branch:** <headRefName>
**Base:** <baseRefName>
**Reviewed at:** <YYYY-MM-DD HH:mm>

## Verdict

**decision:** approved | needs-fixes | blocked

## Summary

一句话总结审查结论。

## Issues

### Critical

不修复不能合并的问题。格式：[文件:行号] 问题描述

### Important

应该修复但不阻塞合并的问题。

### Minor

可选的改进建议。

## Fix Suggestions

decision 为 needs-fixes 时，在此给出具体的修复指引。
```

**decision 三态说明：**

| 状态 | 含义 | merge-pr 行为 |
|------|------|---------------|
| `approved` | 审查通过 | 执行 merge 流程 |
| `needs-fixes` | 有小问题需要修 | AI 在 session 内修复后重新 review（覆盖 verdict 文件） |
| `blocked` | 需要人类决策 | 拒绝 merge，展示原因等待人类介入 |

## 二、review-pr 命令

### 触发方式

斜杠命令：`/review-pr <pr-number>`

### 流程

```
1. 获取 PR 信息
   gh pr view <pr-number> --json title,author,headRefName,baseRefName,body

2. 获取 PR diff
   gh pr diff <pr-number>

3. AI 在当前 session 审查 diff
   审查范围见下方 checklist

4. 写入 verdict 文件
   tasks/reviews/<pr-number>.md

5. 报告结果
   "Review 完成：[approved|needs-fixes|blocked]"
   附 Issues 摘要
```

### 审查 Checklist

```
需求对齐：
  - 实现是否满足 PR body 中描述的需求？
  - 是否有未实现的承诺功能？

代码质量：
  - 逻辑正确性（边界条件、错误路径）
  - 类型安全（TypeScript strict / Rust 类型）
  - 异常处理是否恰当
  - 有无明显 bug 或反模式
  - 命名是否清晰、职责是否单一

测试覆盖：
  - 新增代码是否有对应测试？
  - 现有测试是否仍然通过？

安全：
  - API key / token / 敏感信息是否泄露？
  - 用户输入是否有校验？
  - XSS / SQL 注入等常见风险是否处理？

架构一致性：
  - 是否遵循项目现有的架构模式？
  - 是否引入了不必要的依赖？
```

### 输出示例

```markdown
# Review Verdict

**PR:** #128
**Title:** feat(sidebar): 实现侧边栏拖拽排序
**Author:** @shaobai-li
**Branch:** feat/sidebar-drag-reorder
**Base:** main
**Reviewed at:** 2026-05-14 15:30

## Verdict

**decision:** approved

## Summary

实现完整，核心逻辑有测试覆盖，无安全隐患。

## Issues

### Important

无。

### Minor

1. [frontend/src/components/Sidebar.tsx:42] `handleDragEnd` 函数较长，可拆分为独立函数提升可读性。
```

## 三、merge-pr 命令

### 触发方式

斜杠命令：`/merge-pr <pr-number>`

### 流程

```
1. 读取 verdict 文件
   tasks/reviews/<pr-number>.md

2. 解析 decision 字段

3. 分支判断：
   ┌─ approved ──▶ 执行 merge 流程（基于 merge.md）
   │
   ├─ needs-fixes ──▶ 拒绝合并，提供修复指引
   │                  提示：修复后重新 /review-pr
   │
   └─ blocked ──▶ 拒绝合并，展示 blocked 原因
                  提示：需人类决策后再决定下一步
```

### merge 流程（decision == approved 时）

复用 `tasks/merge.md` 中定义的流程：

```
1. 确认 PR 状态（OPEN, MERGEABLE）
2. 查看变更概要
3. 选择合并策略（默认 --squash）
4. 执行 gh pr merge
5. 验证 state = MERGED
6. 清理本地和远程分支
7. 同步本地 main
```

## 四、与现有命令的关系

```
add_commit → new_pr → review-pr → merge-pr
（已存在）   （已存在）   （新）      （新）

独立使用场景：
  review-pr 可独立运行，只审查不合并
  merge-pr 可独立运行，只合并不审查（但会检查 verdict 文件）
```

## 五、错误处理

| 场景 | 行为 |
|------|------|
| `review-pr <number>` 时 PR 不存在 | 报错并退出 |
| `review-pr <number>` 时 PR 已合并 | 提示已合并，不重复审查 |
| `merge-pr <number>` 时 verdict 文件不存在 | 提示"请先执行 review-pr" |
| `merge-pr <number>` 时 verdict 为 needs-fixes | 展示 issue 列表，建议修复后重新 review |
| `merge-pr <number>` 时 verdict 为 blocked | 展示 blocked 原因 |
| `merge-pr` 时 PR 状态不是 MERGEABLE | 等待/刷新，或报错 |
