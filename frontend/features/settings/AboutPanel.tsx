"use client";

function getOsName(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  return "Unknown";
}

function formatBuildTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AboutPanel() {
  const buildInfo = __BUILD_INFO__;
  const osName = getOsName();

  return (
    <div className="flex flex-col gap-6">
      {/* ── 应用信息 ── */}
      <div className="flex flex-col items-center gap-2 py-4">
        <h3 className="text-lg font-semibold text-foreground">OmniAge</h3>
        <p className="text-sm text-muted-foreground">v{buildInfo.version}</p>
      </div>

      {/* ── 构建信息 ── */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          构建信息
        </h4>
        <dl className="flex flex-col gap-1.5">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Commit</dt>
            <dd className="font-mono text-foreground">
              <code>{buildInfo.commit}</code>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">构建时间</dt>
            <dd className="text-foreground">
              {formatBuildTime(buildInfo.buildTime)}
            </dd>
          </div>
        </dl>
      </div>

      {/* ── 运行环境 ── */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          运行环境
        </h4>
        <dl className="flex flex-col gap-1.5">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">操作系统</dt>
            <dd className="text-foreground">{osName}</dd>
          </div>
        </dl>
      </div>

      {/* ── Beta Notice ── */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm">
        <p className="font-medium text-foreground">Internal Beta</p>
        <p className="mt-1 text-muted-foreground">
          内部测试版本，仅供受邀用户使用。如遇到问题或需要反馈，请联系开发团队。
        </p>
      </div>

      {/* ── 版权 ── */}
      <p className="text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} OmniAge. All rights reserved.
      </p>
    </div>
  );
}
