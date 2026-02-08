"use client";

import { DataPanel } from "@/components/features/data/DataPanel";
import { AGENT_KB_COLUMNS, KnowledgeBaseRecord } from "./columns";

export function KbDataPanel() {
  return (
    <DataPanel<KnowledgeBaseRecord>
      columns={AGENT_KB_COLUMNS}
      apiEndpoint="http://localhost:8000/api/kb/records"
      getRowKey={(item) => item.record_id}
      dataKey="records"
      emptyMessage="No knowledge base data available"
    />
  );
}