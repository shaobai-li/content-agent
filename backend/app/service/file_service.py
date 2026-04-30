from typing import List, Dict, Any, Optional, Callable, Awaitable
import mimetypes
from fastapi import UploadFile
from pathlib import Path
from datetime import datetime

from loguru import logger
from app.core.config import get_agent_attachment_cache_dir
from app.core.ids import new_uuid


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
        return f"kb-{new_uuid()[:8]}"
    
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

    agent_cache_dir = get_agent_attachment_cache_dir(agent_id)

    file_ext = Path(file.filename).suffix if file.filename else ""
    cached_filename = f"{new_uuid()}{file_ext}"
    cached_path = agent_cache_dir / cached_filename

    content = await file.read()
    with open(cached_path, "wb") as f:
        f.write(content)

    logger.debug("upload saved: {} / {} size={}", agent_id, cached_filename, len(content))

    return cached_path, content


def sanitize_attachment_filename(raw: Optional[str]) -> str:
    """仅使用 basename，去掉空名与危险片段，尽量保留用户原始文件名。"""
    if not raw:
        return "unnamed"
    name = Path(raw).name.replace("\x00", "").strip()
    if not name or name in (".", ".."):
        return "unnamed"
    return name


async def save_upload_to_agent_cache_keep_name(file: UploadFile, agent_id: str) -> Path:
    """写入 ``local_data/cache/``，文件名与上传名一致（经 sanitize）。"""
    agent_cache_dir = get_agent_attachment_cache_dir(agent_id)
    safe_name = sanitize_attachment_filename(file.filename)
    dest = agent_cache_dir / safe_name
    content = await file.read()
    dest.write_bytes(content)
    logger.debug("cache saved: {} / {} size={}", agent_id, safe_name, len(content))
    return dest


def resolve_validated_cache_paths(agent_id: str, path_strings: List[Any]) -> List[Path]:
    """仅接受位于该 Agent 附件缓存目录下的已存在文件路径（绝对或相对 cache 根）。"""
    cache_root = get_agent_attachment_cache_dir(agent_id).resolve()
    validated: List[Path] = []
    for item in path_strings:
        if not isinstance(item, str):
            logger.warning("invalid path type: {} for agent {}", type(item).__name__, agent_id)
            continue
        s = item.strip()
        if not s:
            continue
        try:
            raw = Path(s)
            p = raw.resolve() if raw.is_absolute() else (cache_root / raw).resolve()
        except OSError:
            logger.warning("path resolve error: {} for agent {}", s, agent_id)
            continue
        if not p.is_file():
            logger.warning("path not file: {} for agent {}", s, agent_id)
            continue
        try:
            p.relative_to(cache_root)
        except ValueError:
            logger.warning("path outside cache: {} for agent {}", s, agent_id)
            continue
        validated.append(p)
    logger.debug("validated {} cache paths for agent {}", len(validated), agent_id)
    return validated


async def process_pre_cached_attachments(
    paths: List[Path],
    agent_id: str,
    processor: Optional[Callable[[Path, str, str], Awaitable[Optional[str]]]] = None,
) -> List[FileInfo]:
    """对已落在 cache 目录内的文件做解析等处理，等价于 process_attachments 的结果结构。"""
    logger.debug("process {} pre-cached attachments for agent {}", len(paths), agent_id)
    file_info_list: List[FileInfo] = []
    for path in paths:
        filename = path.name
        guessed, _ = mimetypes.guess_type(filename)
        content_type = guessed or "application/octet-stream"
        size = path.stat().st_size
        parsed_path: Optional[str] = None
        if processor:
            parsed_path = await processor(path, filename, content_type)
        file_info_list.append(
            FileInfo(
                filename=filename,
                content_type=content_type,
                size=size,
                cached_path=path,
                parsed_path=parsed_path,
            )
        )
    return file_info_list


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