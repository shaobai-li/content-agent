from abc import ABC, abstractmethod
from typing import Dict, List

class PlatformParser(ABC):
    """所有平台解析器的统一接口"""

    @abstractmethod
    async def parse(self, html: str, url: str) -> Dict:
        """
        返回标准化的数据结构
        {
            "source_platform": str,
            "author_name": str,
            "words": str,
            "images": List[str],   # 原始远程 URL
            "videos": List[str],   # 
        }
        """
        pass