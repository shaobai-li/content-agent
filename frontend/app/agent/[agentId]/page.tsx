"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AgentDefaultPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;

  useEffect(() => {
    // 默认重定向到 history 页面
    router.replace(`/agent/${agentId}/history`);
  }, [agentId, router]);

  return null;
}

