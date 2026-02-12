from typing import List, Dict, Any, Optional, Callable, Awaitable
from fastapi import UploadFile
from pathlib import Path
import uuid

from app.core.config import CACHE_DIR


class FileInfo:
    def __init__(
        self, 
        filename: str, 
        content_type: str, 
        size: int, 
        cached_path: Path,
        process_result: Optional[str] = None
    ):
        self.filename = filename
        self.content_type = content_type
        self.size = size
        self.cached_path = cached_path
        self.process_result = process_result
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "filename": self.filename,
            "content_type": self.content_type,
            "size": self.size,
            "cached_path": str(self.cached_path),
            "process_result": self.process_result
        }


async def save_uploaded_file(
    file: UploadFile, 
    agent_id: str,
    cache_base_dir: Path = CACHE_DIR
) -> tuple[Path, bytes]:
    agent_cache_dir = cache_base_dir / agent_id
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
        
        # 调用处理器（如果提供）
        process_result = None
        if processor:
            process_result = await processor(
                cached_path,
                file.filename,
                file.content_type
            )

        file_info = FileInfo(
            filename=file.filename,
            content_type=file.content_type,
            size=len(content),
            cached_path=cached_path,
            process_result=process_result
        )
        file_info_list.append(file_info)
    
    return file_info_list