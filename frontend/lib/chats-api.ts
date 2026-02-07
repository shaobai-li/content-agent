import { getChatsEndpoint } from "@/lib/api-config";
import type { ChatListItem } from "@/types/chat";

export async function getChats(): Promise<ChatListItem[]> {
  const res = await fetch(getChatsEndpoint());
  if (!res.ok) throw new Error("Failed to fetch chats");
  return res.json();
}
