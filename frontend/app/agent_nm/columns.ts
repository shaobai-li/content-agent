export interface DataTableColumn {
    key: string;
    label: string;
    width?: string;
    className?: string;
  }
  
  export const AGENT_NM_COLUMNS: DataTableColumn[] = [
    { key: "platform", label: "平台", width: "120px" },
    { key: "author", label: "作者", width: "100px" },
    { key: "images", label: "图片" },
    { key: "videos", label: "视频" },
  ];