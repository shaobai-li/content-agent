import Image from "next/image";
import { DataTableColumn } from "@/components/features/data/DataTable";
import { FileTypeIconMap } from "@/components/ui/icons";

export interface KnowledgeBaseRecord {
  record_id: string;
  name: string;
  type: string;
  size: string;
  date_added: string;
}

export const AGENT_KB_COLUMNS: DataTableColumn<KnowledgeBaseRecord>[] = [
  {
    key: "name",
    label: "文件名",
    render: (record) => {
      const icon = FileTypeIconMap[record.type as keyof typeof FileTypeIconMap];
      return (
        <div className="flex items-center gap-3 px-6 py-5">
          {icon && (
            <Image
              src={icon}
              alt={record.type}
              width={20}
              height={20}
              className="w-5 h-5 object-contain flex-shrink-0"
            />
          )}
          <span className="text-sm font-medium text-foreground truncate max-w-[300px] block" title={record.name}>
            {record.name}
          </span>
        </div>
      );
    },
  },
  {
    key: "type",
    label: "类型",
    render: (record) => (
      <div className="px-6 py-5 w-[100px]">
        <span className="text-xs text-muted-foreground">{record.type.toUpperCase()}</span>
      </div>
    ),
  },
  {
    key: "size",
    label: "大小",
    render: (record) => (
      <div className="px-6 py-5 w-[120px] text-xs text-muted-foreground">
        {record.size}
      </div>
    ),
  },
  {
    key: "date_added",
    label: "添加日期",
    render: (record) => (
      <div className="px-6 py-5 w-[140px] text-xs text-muted-foreground">
        {record.date_added}
      </div>
    ),
  },
];
