"""DOCX to Markdown parser."""
import mammoth
from markdownify import markdownify
from pathlib import Path


class DocxParser:
    """DOCX文档解析器"""
    
    def __init__(self, custom_style_map: str | None = None):
        """
        初始化DOCX解析器
        
        Args:
            custom_style_map: 自定义mammoth样式映射
        """
        self.style_map = custom_style_map or """
            p[style-name='Heading 1'] => h1:fresh
            p[style-name='Heading 2'] => h2:fresh
            p[style-name='Heading 3'] => h3:fresh
            p[style-name='Quote'] => blockquote > p
            r[style-name='Strong'] => strong
        """
        self._image_counter = 0
        self._media_dir = None
    
    def _image_handler(self, image):
        """
        处理DOCX中的图片提取
        
        Args:
            image: Mammoth图片对象
            
        Returns:
            包含图片源路径的字典
        """
        with image.open() as image_bytes:
            content = image_bytes.read()
        
        extension = image.content_type.split("/")[-1]
        image_filename = f"img_{self._image_counter:03d}.{extension}"
        self._image_counter += 1
        
        image_path = self._media_dir / image_filename
        image_path.write_bytes(content)
        
        return {
            "src": f"media/{image_filename}"
        }
    
    async def parse(self, file_path: Path, output_dir: Path) -> Path:
        """
        解析DOCX文档为Markdown
        
        Args:
            file_path: DOCX文件路径
            output_dir: Markdown输出目录
            
        Returns:
            生成的Markdown文件路径
        """
        if not file_path.exists():
            raise FileNotFoundError(f"Input file not found: {file_path}")
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        self._media_dir = output_dir / "media"
        self._media_dir.mkdir(parents=True, exist_ok=True)
        self._image_counter = 0
        
        with open(file_path, "rb") as f:
            result = mammoth.convert_to_html(
                f,
                style_map=self.style_map,
                convert_image=mammoth.images.img_element(self._image_handler)
            )
        
        html_content = result.value
        
        markdown_content = markdownify(
            html_content,
            heading_style="ATX",
            bullets="-",
            convert=[
                'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'ul', 'ol', 'li', 'b', 'i', 'strong', 'em',
                'a', 'img', 'table', 'tr', 'th', 'td'
            ]
        )
        
        md_filename = file_path.stem + ".md"
        md_path = output_dir / md_filename
        md_path.write_text(markdown_content.strip(), encoding="utf-8")
        
        return md_path

