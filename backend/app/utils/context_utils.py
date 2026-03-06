from typing import Optional
from pathlib import Path


def wrap_article_as_message(article_path: str, role: str = "system") -> Optional[dict]:
    """
    将给定的文章路径包装成message格式
    
    Args:
        article_path: 文章文件路径
        role: message角色，默认为"system"
    
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
