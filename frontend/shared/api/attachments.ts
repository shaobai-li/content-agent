import { http } from "@/shared/api/http";

/**
 * 将文件写入后端该 Agent 的 workspace/local_data/cache/，保留原始文件名。
 * @returns 服务器返回的绝对路径 cached_path
 */
export async function uploadAgentAttachmentCache(agentId: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  try {
    const data = await http.uploadForm<{ cached_path?: string }>(
      `/api/agents/${agentId}/attachments/cache`,
      formData,
    );
    if (!data.cached_path) {
      throw new Error("附件上传响应缺少 cached_path");
    }
    return data.cached_path;
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "附件上传失败",
    );
  }
}
