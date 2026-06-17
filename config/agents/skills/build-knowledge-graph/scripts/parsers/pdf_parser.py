from __future__ import annotations

from collections import Counter
from pathlib import Path

import fitz

# PyMuPDF span flag bit: bold (2**4). See span["flags"].
_FLAG_BOLD = 2**4

# A heading line is expected to be short and single-line.
_MAX_HEADING_CHARS = 64

# Treat sizes within this delta as the same logical size.
_SIZE_EPS = 0.6


class PdfParser:
    def parse(self, src_path: Path, output_dir: Path) -> dict[str, str]:
        output_dir.mkdir(parents=True, exist_ok=True)
        with fitz.open(src_path) as doc:
            lines = self._collect_lines(doc)
            body_size = self._body_size(lines)
            size_to_level = self._build_size_levels(lines, body_size)
            parts = self._render(lines, body_size, size_to_level)
        markdown_path = output_dir / "parsed.md"
        markdown_path.write_text("\n\n".join(parts).strip() + "\n", encoding="utf-8")
        return {"markdown_path": str(markdown_path)}

    # --- extraction -------------------------------------------------------

    def _collect_lines(self, doc: "fitz.Document") -> list[dict]:
        """Flatten the doc into line records, merging horizontally adjacent
        blocks (e.g. a section number "3" and its title "Model Architecture")."""
        lines: list[dict] = []
        for page in doc:
            page_width = page.rect.width
            raw: list[dict] = []
            for block in page.get_text("dict")["blocks"]:
                if block.get("type") != 0:  # 0 = text block
                    continue
                for line in block["lines"]:
                    rec = self._line_record(line, page_width)
                    if rec is not None:
                        raw.append(rec)
            lines.extend(self._merge_same_row(raw))
        return lines

    def _line_record(self, line: dict, page_width: float) -> dict | None:
        # Preserve spaces: PyMuPDF emits whitespace as its own spans, so build
        # the text from all spans and keep non-blank ones only for font stats.
        text = "".join(s["text"] for s in line["spans"]).strip()
        if not text:
            return None
        spans = [s for s in line["spans"] if s["text"].strip()]
        if not spans:
            return None
        # Dominant span = the one carrying the most characters.
        dominant = max(spans, key=lambda s: len(s["text"]))
        total_chars = sum(len(s["text"]) for s in spans)
        bold_chars = sum(len(s["text"]) for s in spans if s["flags"] & _FLAG_BOLD)
        x0, y0, x1, y1 = line["bbox"]
        return {
            "text": text,
            "size": round(dominant["size"], 1),
            "bold_ratio": bold_chars / total_chars if total_chars else 0.0,
            "x0": x0,
            "y0": y0,
            "x1": x1,
            "y1": y1,
            "dir": tuple(line.get("dir", (1.0, 0.0))),
            "page_width": page_width,
        }

    def _merge_same_row(self, recs: list[dict]) -> list[dict]:
        """Join records sharing a baseline (same y0, similar size) so a split
        "1" + "Introduction" becomes one heading candidate."""
        recs = sorted(recs, key=lambda r: (round(r["y0"], 0), r["x0"]))
        merged: list[dict] = []
        for rec in recs:
            prev = merged[-1] if merged else None
            if (
                prev is not None
                and abs(prev["y0"] - rec["y0"]) < 3.0
                and abs(prev["size"] - rec["size"]) < _SIZE_EPS
                and prev["dir"] == rec["dir"]
                and rec["x0"] - prev["x1"] < 40.0
            ):
                prev["text"] = f"{prev['text']} {rec['text']}".strip()
                prev["x1"] = rec["x1"]
                prev["bold_ratio"] = max(prev["bold_ratio"], rec["bold_ratio"])
            else:
                merged.append(rec)
        return merged

    # --- size analysis ----------------------------------------------------

    def _body_size(self, lines: list[dict]) -> float:
        """Most common font size by character count = body text baseline."""
        hist: Counter[float] = Counter()
        for rec in lines:
            hist[rec["size"]] += len(rec["text"])
        if not hist:
            return 0.0
        return hist.most_common(1)[0][0]

    def _build_size_levels(self, lines: list[dict], body_size: float) -> dict[float, int]:
        """Map each distinct above-body size to a heading level (largest = #).
        Marginal lines (watermarks) are excluded so they don't steal a level."""
        sizes = {
            rec["size"]
            for rec in lines
            if rec["size"] > body_size + _SIZE_EPS
            and not self._is_marginal(rec)
            and self._is_heading_text(rec)
        }
        ordered = sorted(sizes, reverse=True)
        return {size: idx + 1 for idx, size in enumerate(ordered)}

    # --- classification ---------------------------------------------------

    def _is_marginal(self, rec: dict) -> bool:
        """Drop rotated / page-edge stamps (e.g. arXiv vertical watermark)."""
        if abs(rec["dir"][0]) < 0.99:  # not horizontal text
            return True
        if rec["x0"] < 15.0 and rec["x1"] < 60.0:  # hugging the left margin
            return True
        return False

    def _is_heading_text(self, rec: dict) -> bool:
        text = rec["text"]
        if not (0 < len(text) <= _MAX_HEADING_CHARS):
            return False
        # Reject multi-sentence prose (e.g. license notices share a heading size).
        if text.rstrip().endswith((".", ",", ";", ":")):
            return False
        if text.count(". ") >= 1:
            return False
        # Reject digit-dominated lines (table cells/numeric rows).
        letters = sum(c.isalpha() for c in text)
        digits = sum(c.isdigit() for c in text)
        if letters == 0 or digits > letters:
            return False
        return True

    def _heading_level(
        self, rec: dict, body_size: float, size_to_level: dict[float, int]
    ) -> int | None:
        if not self._is_heading_text(rec):
            return None
        # Larger-than-body font -> ranked heading level.
        if rec["size"] in size_to_level:
            return size_to_level[rec["size"]]
        # Body-size but bold -> deepest+1 subsection (e.g. "3.1 ...").
        if rec["bold_ratio"] >= 0.8 and abs(rec["size"] - body_size) <= _SIZE_EPS:
            return (max(size_to_level.values()) if size_to_level else 1) + 1
        return None

    # --- rendering --------------------------------------------------------

    def _render(
        self, lines: list[dict], body_size: float, size_to_level: dict[float, int]
    ) -> list[str]:
        parts: list[str] = []
        for rec in lines:
            if self._is_marginal(rec):
                continue
            level = self._heading_level(rec, body_size, size_to_level)
            if level:
                parts.append("#" * min(level, 6) + " " + rec["text"])
            else:
                text = rec["text"]
                if text.lstrip().startswith("#"):  # escape literal leading '#'
                    text = "\\" + text.lstrip()
                parts.append(text)
        return parts
