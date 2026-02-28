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
        <div className="flex items-center gap-2">
          {icon && (
            <Image
              src={icon}
              alt={record.type}
              width={16}
              height={16}
              className="flex-shrink-0"
            />
          )}
          <span className="truncate" title={record.name}>
            {record.name}
          </span>
        </div>
      );
    },
  },
  {
    key: "type",
    label: "类型",
    width: "100px",
    className: "text-xs text-muted-foreground",
    render: (record) => record.type.toUpperCase(),
  },
  {
    key: "size",
    label: "大小",
    width: "120px",
    className: "text-xs text-muted-foreground",
    render: (record) => record.size,
  },
  {
    key: "date_added",
    label: "添加日期",
    width: "140px",
    className: "text-xs text-muted-foreground",
    render: (record) => record.date_added,
  },
];
