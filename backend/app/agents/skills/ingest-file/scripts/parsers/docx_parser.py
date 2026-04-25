from __future__ import annotations

from pathlib import Path

import mammoth


class DocxParser:
    def parse(self, src_path: Path, output_dir: Path) -> dict[str, str]:
        output_dir.mkdir(parents=True, exist_ok=True)
        result = mammoth.convert_to_markdown(str(src_path))
        markdown_path = output_dir / "parsed.md"
        markdown_path.write_text(result.value, encoding="utf-8")
        return {"markdown_path": str(markdown_path)}
