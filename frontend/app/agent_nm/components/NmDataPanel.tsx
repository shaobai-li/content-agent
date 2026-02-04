"use client";

import { DataPanel } from "@/components/features/data/DataPanel";
import { AGENT_NM_COLUMNS, DataRecord } from "./columns";

export function NmDataPanel() {
  return (
    <DataPanel<DataRecord>
      columns={AGENT_NM_COLUMNS}
      apiEndpoint="http://localhost:8000/api/nm/records"
      getRowKey={(item) => item.record_id}
      dataKey="records"
      emptyMessage="暂无笔记数据"
    />
  );
}

