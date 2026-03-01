from typing import List, Dict, Any, Optional, Callable, Awaitable
from fastapi import UploadFile
from pathlib import Path
import uuid
from datetime import datetime

from app.core.config import get_agent_base_dir


class FileInfo:
    def __init__(
        self, 
        filename: str, 
        content_type: str, 
        size: int, 
        cached_path: Path,
        parsed_path: Optional[str] = None,
        record_id: Optional[str] = None,
        date_added: Optional[str] = None
    ):
        self.filename = filename
        self.content_type = content_type
        self.size = size
        self.cached_path = cached_path
        self.parsed_path = parsed_path
        self.record_id = record_id or self._generate_record_id()
        self.date_added = date_added or datetime.now().strftime("%Y-%m-%d")
    
    def _generate_record_id(self) -> str:
        """生成唯一的记录ID"""
        return f"kb-{uuid.uuid4().hex[:8]}"
    
    def _get_file_extension(self) -> str:
        """从文件名或content_type获取扩展名"""
        # 优先从文件名获取
        if self.filename:
            ext = Path(self.filename).suffix.lstrip('.')
            if ext:
                return ext
        
        # 从 content_type 映射
        content_type_map = {
            "application/pdf": "pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
            "application/msword": "doc",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
            "application/vnd.ms-powerpoint": "ppt",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
            "application/vnd.ms-excel": "xls",
            "text/markdown": "md",
            "text/plain": "txt",
            "image/jpeg": "jpg",
            "image/png": "png",
        }
        return content_type_map.get(self.content_type, "unknown")
    
    def _format_size(self) -> str:
        """将字节数转换为人类可读的格式"""
        size_bytes = self.size
        
        # 转换为合适的单位
        if size_bytes < 1024:
            return f"{size_bytes}B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f}KB"
        elif size_bytes < 1024 * 1024 * 1024:
            return f"{size_bytes / (1024 * 1024):.1f}MB"
        else:
            return f"{size_bytes / (1024 * 1024 * 1024):.1f}GB"
    
    def to_dict(self) -> Dict[str, Any]:
        """返回完整的内部格式"""
        return {
            "filename": self.filename,
            "content_type": self.content_type,
            "size": self.size,
            "cached_path": str(self.cached_path),
            "parsed_path": self.parsed_path,
            "record_id": self.record_id,
            "date_added": self.date_added
        }
    
    def to_kb_format(self) -> Dict[str, str]:
        """返回知识库 JSONL 格式"""
        return {
            "record_id": self.record_id,
            "name": self.filename,
            "type": self._get_file_extension(),
            "size": self._format_size(),
            "date_added": self.date_added,
            "cached_path": str(self.cached_path),
            "parsed_path": self.parsed_path,
            "content_type": self.content_type
        }


async def save_uploaded_file(
    file: UploadFile, 
    agent_id: str
) -> tuple[Path, bytes]:

    # 获取agent的base目录，然后在其下创建cache子目录
    agent_base_dir = get_agent_base_dir(agent_id)
    agent_cache_dir = agent_base_dir / "cache"
    agent_cache_dir.mkdir(parents=True, exist_ok=True)

    file_ext = Path(file.filename).suffix if file.filename else ""
    cached_filename = f"{uuid.uuid4()}{file_ext}"
    cached_path = agent_cache_dir / cached_filename
    
    content = await file.read()
    with open(cached_path, "wb") as f:
        f.write(content)
    
    return cached_path, content


async def process_attachments(
    attachments: List[UploadFile],
    agent_id: str,
    processor: Optional[Callable[[Path, str, str], Awaitable[str]]] = None
) -> List[FileInfo]:

    file_info_list = []
    
    for file in attachments:
        cached_path, content = await save_uploaded_file(file, agent_id)
        
        # 调用处理器（如果提供），返回解析后的文件路径
        parsed_path = None
        if processor:
            parsed_path = await processor(
                cached_path,
                file.filename,
                file.content_type
            )

        file_info = FileInfo(
            filename=file.filename,
            content_type=file.content_type,
            size=len(content),
            cached_path=cached_path,
            parsed_path=parsed_path
        )
        file_info_list.append(file_info)
    
    return file_info_list