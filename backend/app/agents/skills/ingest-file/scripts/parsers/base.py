from __future__ import annotations

from pathlib import Path
from typing import Protocol


class DocumentParser(Protocol):
    def parse(self, src_path: Path, output_dir: Path) -> dict[str, str]:
        """Parse source document and write markdown under output_dir."""
