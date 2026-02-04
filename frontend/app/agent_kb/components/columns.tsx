import { DataTableColumn } from "@/components/features/data/DataTable";

export interface KnowledgeBaseRecord {
  id: string;
  title: string;
  category: string;
  created_at: string;
}

export const AGENT_KB_COLUMNS: DataTableColumn<KnowledgeBaseRecord>[] = [
  {
    key: "title",
    label: "标题",
    width: "200px",
    render: (item) => (
      <span className="font-medium">{item.title}</span>
    )
  },
  {
    key: "category",
    label: "分类",
    width: "120px",
    render: (item) => (
      <span className="text-sm text-gray-600">{item.category}</span>
    )
  },
  {
    key: "created_at",
    label: "创建时间",
    width: "150px",
    render: (item) => (
      <span className="text-sm text-gray-500">
        {new Date(item.created_at).toLocaleDateString('zh-CN')}
      </span>
    )
  }
];

