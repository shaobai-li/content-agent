const KNOWLEDGE_BASE_DRAG_MIME = "application/x-content-agent-knowledge-base";

type BaseKnowledgeBaseDragData = {
  id: string;
  name: string;
  kbId: string;
};

export type DatabaseDragData = BaseKnowledgeBaseDragData & {
  kind: "database";
};

export type FolderDragData = BaseKnowledgeBaseDragData & {
  kind: "folder";
  nodeId: string;
};

export type RecordDragData = BaseKnowledgeBaseDragData & {
  kind: "record";
  nodeId: string;
  recordId: string;
  parsed_path?: string;
};

export type KnowledgeBaseDragData =
  | DatabaseDragData
  | FolderDragData
  | RecordDragData;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isDatabaseDragData(value: unknown): value is DatabaseDragData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Partial<DatabaseDragData>;
  return (
    data.kind === "database" &&
    isNonEmptyString(data.id) &&
    isNonEmptyString(data.name) &&
    isNonEmptyString(data.kbId)
  );
}

function isFolderDragData(value: unknown): value is FolderDragData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Partial<FolderDragData>;
  return (
    data.kind === "folder" &&
    isNonEmptyString(data.id) &&
    isNonEmptyString(data.name) &&
    isNonEmptyString(data.kbId) &&
    isNonEmptyString(data.nodeId)
  );
}

function isRecordDragData(value: unknown): value is RecordDragData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Partial<RecordDragData>;
  return (
    data.kind === "record" &&
    isNonEmptyString(data.id) &&
    isNonEmptyString(data.name) &&
    isNonEmptyString(data.kbId) &&
    isNonEmptyString(data.nodeId) &&
    isNonEmptyString(data.recordId) &&
    (data.parsed_path === undefined || typeof data.parsed_path === "string")
  );
}

export function isKnowledgeBaseDragData(value: unknown): value is KnowledgeBaseDragData {
  return isDatabaseDragData(value) || isFolderDragData(value) || isRecordDragData(value);
}

export function writeKnowledgeBaseDragData(
  dataTransfer: DataTransfer,
  payload: KnowledgeBaseDragData,
) {
  dataTransfer.setData(KNOWLEDGE_BASE_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.setData("text/plain", payload.name);
}

export function readKnowledgeBaseDragData(
  dataTransfer: DataTransfer,
): KnowledgeBaseDragData | null {
  const raw = dataTransfer.getData(KNOWLEDGE_BASE_DRAG_MIME);
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isKnowledgeBaseDragData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function hasKnowledgeBaseDragData(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(KNOWLEDGE_BASE_DRAG_MIME);
}
