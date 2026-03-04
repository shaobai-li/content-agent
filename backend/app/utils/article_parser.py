import re
from typing import Optional


def extract_article_content(text: str) -> Optional[str]:
    """从文本中提取 <article> 标签内的内容
    
    Args:
        text: 包含 article 标签的文本
        
    Returns:
        article 标签内的内容，如果没有找到则返回 None
    """
    pattern = r'<article>(.*?)</article>'
    match = re.search(pattern, text, re.DOTALL)
    
    if match:
        return match.group(1).strip()
    
    return None
