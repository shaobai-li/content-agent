import json
from typing import Optional, List
from pathlib import Path


def wrap_article_as_message(article_path: str, role: str = "user") -> Optional[dict]:
    """
    将给定的文章路径包装成message格式
    
    Args:
        article_path: 文章文件路径
        role: message角色，默认为"user"
    
    Returns:
        包含文章内容的message字典，如果文件不存在或读取失败则返回None
    """
    path = Path(article_path)
    if not path.exists():
        return None
    
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        
        return {
            "role": role,
            "content": content
        }
    except Exception:
        return None


def parse_mentions(mentions_str: Optional[str]) -> List[dict]:
    """
    解析mentions JSON字符串为字典列表
    
    Args:
        mentions_str: JSON格式的mentions字符串
    
    Returns:
        解析后的字典列表，如果为None或解析失败则返回空列表
    """
    if not mentions_str:
        return []
    
    try:
        mentions = json.loads(mentions_str)
        return mentions if isinstance(mentions, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def append_attachments_to_user_text(user_text: str, absolute_paths: List[str]) -> str:
    """
    将已持久化附件的绝对路径追加到用户可见文本末尾，供模型与会话存档使用。

    格式示例::

        [Attached files — server cache]
        - D:/.../workspace/local_data/cache/doc.pdf
    """
    if not absolute_paths:
        return user_text
    lines = "\n".join(f"- {p}" for p in absolute_paths)
    block = f"[Attached files — server cache]\n{lines}"
    if not user_text.strip():
        return block
    return f"{user_text.rstrip()}\n\n{block}"


def build_user_message_with_mentions(text: str, mentions: List[dict]) -> str:
    """
    构建包含@mention名称的用户消息
    
    Args:
        text: 用户输入的文本
        mentions: mention字典列表
    
    Returns:
        格式化后的消息，格式为 "@article1, @article2\n\nuser text"
        如果没有mentions则直接返回text
    """
    if not mentions:
        return text
    
    mention_names = [f"@{mention.get('name', '')}" for mention in mentions if mention.get('name')]
    if not mention_names:
        return text
    
    mentions_line = ", ".join(mention_names)
    return f"{mentions_line}\n\n{text}"


def get_article_context_messages(mentions: List[dict]) -> List[dict]:
    """
    从mentions中提取文章内容并转换为消息列表
    
    Args:
        mentions: mention字典列表，每个字典包含parsed_path和name字段
    
    Returns:
        消息字典列表，每条消息包含文章名称作为标题和文章内容
    """
    context_messages = []
    
    for mention in mentions:
        parsed_path = mention.get("parsed_path")
        name = mention.get("name", "未命名文章")
        
        if not parsed_path:
            continue
        
        message = wrap_article_as_message(parsed_path)
        if message:
            # 添加文章名称作为标题
            header = f"# 参考文章: {name}\n\n"
            message["content"] = header + message["content"]
            context_messages.append(message)
    
    return context_messages
