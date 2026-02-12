from typing import Protocol
from pathlib import Path

class DocumentParser(Protocol):
    async def parse(self, 
                   file_path: Path, 
                   output_dir: Path) -> Path:
        pass