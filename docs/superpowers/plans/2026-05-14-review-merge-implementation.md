# Review & Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 review-pr 和 merge-pr 两个 Claude Code 命令，实现 review → verdict → merge 的自动化工作流。

**Architecture:** 两个独立的 command markdown 文件放在 `.claude/commands/`，通过 verdict 文件 `tasks/reviews/<pr-number>.md` 进行状态传递。review 在当前 session 内完成（不使用 subagent）。

**Tech Stack:** Claude Code custom commands, gh CLI, git

**Context:** 项目已有 `add_commit` 和 `new_pr` 两个命令作为参考格式。设计规范详见 `docs/superpowers/specs/2026-05-14-review-merge-workflow-design.md`。

---

### Task 1: 创建 review-pr 命令

**Files:**
- Create: `.claude/commands/review-pr.md`

- [ ] **Step 1: 确认 tasks/reviews/ 目录存在**

```bash
mkdir -p tasks/reviews
```

- [ ] **Step 2: 创建 review-pr.md**

```markdown
# Review PR 流程

```bash
# 用法: /review-pr <pr-number>
# 示例: /review-pr 128
```

---

## 流程

### 1. 获取 PR 信息

```bash
gh pr view <pr-number> --json title,author,headRefName,baseRefName,body
gh pr diff <pr-number>
```

### 2. AI 审查 PR

审查范围：

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

### 3. 撰写 verdict 文件

写入 `tasks/reviews/<pr-number>.md`，格式如下：

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
不修复不能合并的问题。

### Important
应该修复但不阻塞合并的问题。

### Minor
可选的改进建议。

## Fix Suggestions

decision 为 needs-fixes 时，在此给出具体的修复指引。
```

decision 三态说明：

| 状态 | 含义 | 后续操作 |
|------|------|----------|
| `approved` | 审查通过 | 可执行 `/merge-pr <pr-number>` |
| `needs-fixes` | 有小问题需要修 | AI 在当前 session 修复后，重新执行 `/review-pr <pr-number>` |
| `blocked` | 需要人类决策 | 等待人类介入，不可 merge |

### 4. 报告结果

展示 verdict 摘要：

```
Review 完成：[approved | needs-fixes | blocked]

Issues:
   Critical: N
   Important: N
   Minor: N

详细内容见 tasks/reviews/<pr-number>.md
```

---

## 检查清单

- [ ] PR 信息已获取（title, author, branch, base）
- [ ] PR diff 已审查
- [ ] Verdict 文件已写入 tasks/reviews/<pr-number>.md
- [ ] 审查结果已展示
```

- [ ] **Step 3: 提交 review-pr.md**

```bash
git add .claude/commands/review-pr.md tasks/reviews/
git commit -m "feat(commands): 添加 review-pr 命令"
```

---

### Task 2: 创建 merge-pr 命令

**Files:**
- Create: `.claude/commands/merge-pr.md`

- [ ] **Step 1: 创建 merge-pr.md**

```markdown
# Merge PR 流程

```bash
# 用法: /merge-pr <pr-number>
# 示例: /merge-pr 128
```

---

## 前置条件

- [ ] Verdict 文件存在：`tasks/reviews/<pr-number>.md`
- [ ] Verdict decision 为 `approved`

---

## 流程

### 1. 读取 Verdict

读取 `tasks/reviews/<pr-number>.md`，解析 `decision` 字段。

### 2. 判断决策

**decision == approved → 执行合并**

进入下方合并流程。

**decision == needs-fixes → 拒绝合并**

展示 Issues 列表，提示：

```
审查结果为 needs-fixes，存在需要修复的问题：

<列出 Critical 和 Important issues>

请先修复问题，然后重新执行 /review-pr <pr-number>
```

**decision == blocked → 拒绝合并**

展示 blocked 原因，提示：

```
审查结果为 blocked，需要人类决策：

<列出 blocked 原因>

等待决策后再决定下一步操作。
```

**verdict 文件不存在 → 报错**

```
未找到审查结果文件 tasks/reviews/<pr-number>.md
请先执行 /review-pr <pr-number>
```

---

### 合并流程（decision == approved 时执行）

### 3. 确认 PR 状态

```bash
gh pr view <pr-number> --json state,headRefName,baseRefName,title,mergeable
```

确认：
- `state` = `OPEN`
- `mergeable` = `MERGEABLE`（如为 `UNKNOWN`，等待 GitHub 刷新）
- `baseRefName` = `main`

### 4. 查看变更概要

```bash
git fetch origin <headRefName>
git branch -f <headRefName> origin/<headRefName>
git log --oneline main..<headRefName>
git diff --stat main..<headRefName>
```

### 5. 选择合并策略

```bash
gh pr merge <pr-number> --squash --subject "<title>"
```

默认使用 squash，如需要保留完整历史可改用 `--merge` 或 `--rebase`。

### 6. 验证合并结果

```bash
gh pr view <pr-number> --json state,mergedAt,mergedBy
```

确认 `state` = `MERGED`。

### 7. 清理分支

```bash
git branch -d <headRefName>
git push origin --delete <headRefName>
```

### 8. 同步本地 main

```bash
git switch main
git pull --ff-only origin main
```

---

## 检查清单

- [ ] Verdict 文件存在且 decision == approved
- [ ] PR 状态确认（OPEN, MERGEABLE）
- [ ] 变更范围确认
- [ ] 合并策略选定并执行
- [ ] 验证 state = MERGED
- [ ] 清理本地和远程分支
- [ ] 本地 main 同步完成
```

- [ ] **Step 2: 提交 merge-pr.md**

```bash
git add .claude/commands/merge-pr.md
git commit -m "feat(commands): 添加 merge-pr 命令"
```
