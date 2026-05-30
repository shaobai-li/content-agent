// entities/agent/visibility.ts
// 用户手动覆盖层：在 localStorage 中记录用户主动隐藏的 agent

const STORAGE_KEY = "agent-visibility-overrides";

interface VisibilityOverrides {
  hidden: string[]; // 用户主动隐藏的 agent id
}

function loadOverrides(): VisibilityOverrides {
  if (typeof window === "undefined") return { hidden: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { hidden: [] };
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.hidden) ? parsed : { hidden: [] };
  } catch {
    return { hidden: [] };
  }
}

function saveOverrides(overrides: VisibilityOverrides): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

/** 判断 agent 是否应该对当前用户可见 */
export function isAgentVisible(
  agentId: string,
  serverVisible: boolean,
  pinned?: boolean,
): boolean {
  // pinned agent 永远可见，不可被用户隐藏
  if (pinned) return true;

  const overrides = loadOverrides();
  // 用户手动隐藏优先
  if (overrides.hidden.includes(agentId)) return false;
  // 否则遵循服务端默认
  return serverVisible;
}

/** 隐藏 agent（只存差异） */
export function hideAgent(agentId: string): void {
  const overrides = loadOverrides();
  if (!overrides.hidden.includes(agentId)) {
    overrides.hidden.push(agentId);
    saveOverrides(overrides);
  }
}

/** 显示 agent（取消隐藏） */
export function showAgent(agentId: string): void {
  const overrides = loadOverrides();
  overrides.hidden = overrides.hidden.filter((id) => id !== agentId);
  saveOverrides(overrides);
}

/** 获取所有被用户隐藏的 agent id */
export function getHiddenAgentIds(): string[] {
  return loadOverrides().hidden;
}
