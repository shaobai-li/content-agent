import { API_BASE_URL } from "@/shared/api/config";

/**
 * 将文件写入后端该 Agent 的 workspace/local_data/cache/，保留原始文件名。
 * @returns 服务器返回的绝对路径 cached_path
 */
export async function uploadAgentAttachmentCache(agentId: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}/attachments/cache`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`附件上传失败: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { cached_path?: string };
  if (!data.cached_path) {
    throw new Error("附件上传响应缺少 cached_path");
  }
  return data.cached_path;
}
