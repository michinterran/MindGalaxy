export type ID = string;
export type ISODateTime = string;

export type CaptureSourceKind =
  | "paste"
  | "chatgpt"
  | "claude"
  | "gemini"
  | "web"
  | "file"
  | "manual";

export type ProcessingStatus =
  | "queued"
  | "running"
  | "needs_review"
  | "completed"
  | "failed";

export type NodeKind =
  | "idea"
  | "claim"
  | "entity"
  | "event"
  | "task"
  | "question"
  | "source_summary";

export type EdgeKind =
  | "relates_to"
  | "supports"
  | "contradicts"
  | "causes"
  | "mentions"
  | "contains"
  | "follows"
  | "derived_from";

export type ContextKind =
  | "topic"
  | "time"
  | "place"
  | "person"
  | "organization"
  | "project"
  | "tag";

export type ExportKind = "pdf" | "html" | "pptx";

export type Workspace = {
  id: ID;
  ownerId: ID;
  name: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type Project = {
  id: ID;
  workspaceId: ID;
  name: string;
  description?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type Capture = {
  id: ID;
  workspaceId: ID;
  projectId?: ID;
  title?: string;
  rawText: string;
  sourceKind: CaptureSourceKind;
  createdBy: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type CaptureSource = {
  id: ID;
  captureId: ID;
  label: string;
  url?: string;
  provider?: string;
  author?: string;
  capturedAt?: ISODateTime;
  metadata?: Record<string, unknown>;
};

export type MindNode = {
  id: ID;
  workspaceId: ID;
  projectId?: ID;
  captureId?: ID;
  kind: NodeKind;
  title: string;
  summary?: string;
  evidenceSnippet?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type MindEdge = {
  id: ID;
  workspaceId: ID;
  sourceNodeId: ID;
  targetNodeId: ID;
  kind: EdgeKind;
  label?: string;
  confidence?: number;
  evidenceSnippet?: string;
  createdAt: ISODateTime;
};

export type MindContext = {
  id: ID;
  workspaceId: ID;
  kind: ContextKind;
  label: string;
  normalizedValue?: string;
  metadata?: Record<string, unknown>;
  createdAt: ISODateTime;
};

export type ProcessingJob = {
  id: ID;
  workspaceId: ID;
  captureId: ID;
  status: ProcessingStatus;
  model?: string;
  promptVersion?: string;
  confidence?: number;
  retryCount: number;
  errorMessage?: string;
  startedAt?: ISODateTime;
  completedAt?: ISODateTime;
  createdAt: ISODateTime;
};

export type NodeRevision = {
  id: ID;
  workspaceId: ID;
  nodeId: ID;
  revisionNumber: number;
  title: string;
  summary?: string;
  evidenceSnippet?: string;
  changedBy: ID | "ai";
  changeReason?: string;
  createdAt: ISODateTime;
};

export type ExportRecord = {
  id: ID;
  workspaceId: ID;
  projectId?: ID;
  kind: ExportKind;
  status: ProcessingStatus;
  fileUrl?: string;
  createdBy: ID;
  createdAt: ISODateTime;
};
