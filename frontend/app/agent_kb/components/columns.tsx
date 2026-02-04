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
    key: "type",
    label: "类型",
    width: "80px",
    render: (record) => {
      const icon = FileTypeIconMap[record.type as keyof typeof FileTypeIconMap];
      return (
        <div className="flex items-center gap-2">
          {icon && (
            <Image
              src={icon}
              alt={record.type}
              width={20}
              height={20}
              className="w-5 h-5 object-contain"
            />
          )}
          <span className="text-xs text-gray-600">{record.type.toUpperCase()}</span>
        </div>
      );
    },
  },
  {
    key: "name",
    label: "文件名",
    render: (record) => (
      <span className="font-medium truncate max-w-[300px] block" title={record.name}>
        {record.name}
      </span>
    ),
  },
  {
    key: "size",
    label: "大小",
    width: "100px",
    className: "text-sm text-gray-600",
    render: (record) => record.size,
  },
  {
    key: "date_added",
    label: "添加日期",
    width: "120px",
    className: "text-sm text-gray-600",
    render: (record) => record.date_added,
  },
];
