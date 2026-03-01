"""PDF to Markdown parser."""
import os
import fitz
from pathlib import Path
from typing import List

os.environ["PYMUPDF_MESSAGE"] = "0"


class PDFParser:
    """PDF文档解析器"""
    
    def __init__(
        self,
        min_image_size: int = 40,
        min_image_bpc: int = 8,
        text_merge_threshold: float = 15.0
    ):
        """
        初始化PDF解析器
        
        Args:
            min_image_size: 最小图片宽度/高度（像素）
            min_image_bpc: 图片最小位深度
            text_merge_threshold: 合并相邻文本块的阈值
        """
        self.min_image_size = min_image_size
        self.min_image_bpc = min_image_bpc
        self.text_merge_threshold = text_merge_threshold
        self._saved_images = set()
    
    async def parse(self, file_path: Path, output_dir: Path) -> Path:
        """
        解析PDF文档为Markdown
        
        Args:
            file_path: PDF文件路径
            output_dir: Markdown输出目录
            
        Returns:
            生成的Markdown文件路径
        """
        if not file_path.exists():
            raise FileNotFoundError(f"Input file not found: {file_path}")
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        media_dir = output_dir / "media"
        media_dir.mkdir(parents=True, exist_ok=True)
        
        self._saved_images.clear()
        all_content = []
        
        doc = fitz.open(str(file_path))
        
        for page_num, page in enumerate(doc, 1):
            all_content.append(f"\n\n## Page {page_num}\n\n")
            
            elements = self._extract_page_elements(page, media_dir)
            elements.sort(key=lambda e: (e["y0"], e["x0"]))
            
            merged_elements = self._merge_text_blocks(elements)
            
            for element in merged_elements:
                all_content.append(f"\n{element['content']}\n")
        
        doc.close()
        
        markdown_content = "".join(all_content)
        
        md_filename = file_path.stem + ".md"
        md_path = output_dir / md_filename
        md_path.write_text(markdown_content.strip(), encoding="utf-8")
        
        return md_path
    
    def _extract_page_elements(self, page, media_dir: Path) -> List[dict]:
        """
        从页面提取所有元素（文本、图片、表格）
        
        Args:
            page: PyMuPDF页面对象
            media_dir: 媒体文件目录
            
        Returns:
            元素字典列表
        """
        elements = []
        
        tabs = page.find_tables()
        tab_rects = [fitz.Rect(t.bbox) for t in tabs.tables]
        
        tp = page.get_textpage()
        dict_content = tp.extractDICT()
        
        for block in dict_content["blocks"]:
            if block["type"] == 0:
                bbox = fitz.Rect(block["bbox"])
                
                if any(bbox.intersects(r) for r in tab_rects):
                    continue
                
                lines_content = []
                for line in block["lines"]:
                    span_text = "".join([s["text"] for s in line["spans"]])
                    lines_content.append(span_text.strip())
                
                text = "".join(lines_content)
                
                if text:
                    elements.append({
                        "type": "text",
                        "y0": bbox.y0,
                        "x0": bbox.x0,
                        "content": text
                    })
        
        for img in page.get_images(full=True):
            xref, bpc = img[0], img[4]
            
            if bpc < self.min_image_bpc:
                continue
            
            bbox_list = page.get_image_bbox(img)
            if not bbox_list:
                continue
            
            bbox = bbox_list[0] if isinstance(bbox_list, list) else bbox_list
            
            if bbox.width < self.min_image_size or bbox.height < self.min_image_size:
                continue
            
            if xref not in self._saved_images:
                img_data = page.parent.extract_image(xref)
                filename = f"img_{xref}.{img_data['ext']}"
                (media_dir / filename).write_bytes(img_data["image"])
                self._saved_images.add(xref)
            else:
                ext = page.parent.extract_image(xref)["ext"]
                filename = f"img_{xref}.{ext}"
            
            elements.append({
                "type": "image",
                "y0": bbox.y0,
                "x0": bbox.x0,
                "content": f"\n![image](media/{filename})\n"
            })
        
        for tab in tabs.tables:
            df = tab.extract()
            if not df:
                continue
            
            header = "| " + " | ".join(
                str(x or "").replace("\n", " ") for x in df[0]
            ) + " |"
            separator = "| " + " | ".join(["---"] * len(df[0])) + " |"
            body = [
                "| " + " | ".join(
                    str(x or "").replace("\n", " ") for x in row
                ) + " |"
                for row in df[1:]
            ]
            
            t_bbox = fitz.Rect(tab.bbox)
            elements.append({
                "type": "table",
                "y0": t_bbox.y0,
                "x0": t_bbox.x0,
                "content": "\n" + "\n".join([header, separator] + body) + "\n"
            })
        
        return elements
    
    def _merge_text_blocks(self, elements: List[dict]) -> List[dict]:
        """
        合并相邻的文本块
        
        Args:
            elements: 已排序的元素列表
            
        Returns:
            合并后的元素列表
        """
        if not elements:
            return []
        
        merged = []
        current = elements[0]
        
        for next_elem in elements[1:]:
            if (current["type"] == "text" and 
                next_elem["type"] == "text" and
                abs(next_elem["y0"] - (current["y0"] + 10)) < self.text_merge_threshold):
                current["content"] += next_elem["content"]
            else:
                merged.append(current)
                current = next_elem
        
        merged.append(current)
        return merged

