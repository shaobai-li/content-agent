"use client";

import { DataPanel } from "@/components/features/data/DataPanel";
import { AGENT_KB_COLUMNS, KnowledgeBaseRecord } from "./columns";

export function KbDataPanel() {
  return (
    <DataPanel<KnowledgeBaseRecord>
      columns={AGENT_KB_COLUMNS}
      apiEndpoint="http://localhost:8000/api/knowledge_base"
      getRowKey={(item) => item.record_id}
      dataKey="records"
      emptyMessage="暂无知识库数据"
    />
  );
}

