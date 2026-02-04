import XiaohongshuIcon from './xiaohongshu16px.svg';
import BilibiliIcon from './bilibili16px.svg';

export const PlatformIconMap = {
    "小红书": XiaohongshuIcon,
    "Bilibili": BilibiliIcon,
} as const;

// 文件类型图标
import DocxIcon from './docx.svg';
import PdfIcon from './pdf.svg';
import PptxIcon from './pptx.svg';
import MkIcon from './mk.svg';

export const FileTypeIconMap = {
    "docx": DocxIcon,
    "pdf": PdfIcon,
    "pptx": PptxIcon,
    "md": MkIcon,
} as const;