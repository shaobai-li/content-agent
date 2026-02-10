"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

// 为每个agent定义默认页面
const getDefaultSection = (agentId: string): string => {
  switch (agentId) {
    case "w":
      return "document"; // 内容生成Agent默认显示文档视图
    case "c":
      return "document"; // 内容检测Agent默认显示文档视图
    default:
      return "knowledge"; // 默认显示知识库
  }
};

export default function AgentDefaultPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;

  useEffect(() => {
    const defaultSection = getDefaultSection(agentId);
    router.replace(`/agent/${agentId}/${defaultSection}`);
  }, [agentId, router]);

  return null;
}

