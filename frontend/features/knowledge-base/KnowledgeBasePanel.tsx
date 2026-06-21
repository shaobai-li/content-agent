"use client";

import { useState } from "react";
import type { AgentId } from "@/entities/agent/model";
import { DataPanel } from "../data/DataPanel";
import { createKnowledgeBasePanelConfig } from "../data/dataPanelConfigRegistry";
import { KnowledgeBaseListPanel } from "./KnowledgeBaseListPanel";
import { RecordViewModal } from "./RecordViewModal";
import { useKnowledgeBaseSelection } from "./useKnowledgeBaseSelection";
import { useKnowledgeBases } from "./useKnowledgeBases";

interface KnowledgeBasePanelProps {
  agentId: AgentId;
}

interface ViewRecord {
  recordId: string;
  fileName: string;
}

export function KnowledgeBasePanel({ agentId }: KnowledgeBasePanelProps) {
  const { databases } = useKnowledgeBases(agentId);
  const { databaseId } = useKnowledgeBaseSelection();
  const selectedDatabase = databases.find((database) => database.id === databaseId) ?? null;
  const [viewRecord, setViewRecord] = useState<ViewRecord | null>(null);

  if (!selectedDatabase) {
    return <KnowledgeBaseListPanel agentId={agentId} />;
  }

  const config = createKnowledgeBasePanelConfig(agentId, selectedDatabase.id);

  return (
    <>
      <DataPanel
        key={selectedDatabase.id}
        {...config}
        onView={(record: any) => {
          const recordId = record?.record_id ?? record?.id;
          const fileName = record?.name ?? "";
          if (recordId) {
            setViewRecord({ recordId, fileName });
          }
        }}
      />
      {viewRecord && (
        <RecordViewModal
          agentId={agentId}
          kbId={selectedDatabase.id}
          recordId={viewRecord.recordId}
          fileName={viewRecord.fileName}
          onClose={() => setViewRecord(null)}
        />
      )}
    </>
  );
}
