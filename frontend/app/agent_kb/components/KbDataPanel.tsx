"use client";

import { Eye, Trash2 } from "lucide-react";
import { DataPanel } from "@/components/features/data/DataPanel";
import { RowActions } from "@/components/features/data/RowActions";
import { AGENT_KB_COLUMNS, KnowledgeBaseRecord } from "./columns";

export function KbDataPanel() {
  const columnsWithActions = [
    ...AGENT_KB_COLUMNS,
    {
      key: "actions",
      label: "",
      render: (record: KnowledgeBaseRecord) => (
        <div className="px-2 py-5 w-[50px] flex justify-end">
          <RowActions
            actions={[
              { label: "View", icon: <Eye className="size-4" /> },
              {
                label: "Remove",
                icon: <Trash2 className="size-4 text-red-600" />,
                destructive: true,
              },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <DataPanel<KnowledgeBaseRecord>
      columns={columnsWithActions}
      apiEndpoint="http://localhost:8000/api/kb/records"
      getRowKey={(item) => item.record_id}
      dataKey="records"
      emptyMessage="No knowledge base data available"
      refreshEvent="kb-data-refresh"
    />
  );
}