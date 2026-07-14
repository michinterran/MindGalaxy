import type {
  CaptureSourceKind,
  ContextKind,
  EdgeKind,
  ExportKind,
  NodeKind,
  ProcessingStatus,
} from "@/types/domain";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type RowTimestamps = {
  created_at: string;
  updated_at?: string;
};

export type WorkspaceRow = RowTimestamps & {
  id: string;
  owner_id: string;
  name: string;
  updated_at: string;
};

export type WorkspaceMemberRow = {
  workspace_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
};

export type ProjectRow = RowTimestamps & {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  updated_at: string;
};

export type CaptureRow = RowTimestamps & {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string | null;
  raw_text: string;
  source_kind: CaptureSourceKind;
  created_by: string;
  embedding: number[] | null;
  metadata: Json;
  updated_at: string;
};

export type CaptureSourceRow = {
  id: string;
  workspace_id: string;
  capture_id: string;
  label: string;
  url: string | null;
  provider: string | null;
  author: string | null;
  captured_at: string | null;
  metadata: Json;
  created_at: string;
};

export type ProcessingJobRow = RowTimestamps & {
  id: string;
  workspace_id: string;
  capture_id: string;
  status: ProcessingStatus;
  job_type: string;
  model: string | null;
  prompt_version: string | null;
  confidence: number | null;
  retry_count: number;
  error_message: string | null;
  metadata: Json;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type MindNodeRow = RowTimestamps & {
  id: string;
  workspace_id: string;
  project_id: string | null;
  capture_id: string | null;
  kind: NodeKind;
  title: string;
  summary: string | null;
  evidence_snippet: string | null;
  confidence: number | null;
  embedding: number[] | null;
  metadata: Json;
  updated_at: string;
};

export type MindEdgeRow = {
  id: string;
  workspace_id: string;
  source_node_id: string;
  target_node_id: string;
  kind: EdgeKind;
  label: string | null;
  confidence: number | null;
  evidence_snippet: string | null;
  metadata: Json;
  created_at: string;
};

export type MindContextRow = {
  id: string;
  workspace_id: string;
  kind: ContextKind;
  label: string;
  normalized_value: string | null;
  metadata: Json;
  created_at: string;
};

export type NodeContextRow = {
  node_id: string;
  context_id: string;
  workspace_id: string;
  created_at: string;
};

export type NodeRevisionRow = {
  id: string;
  workspace_id: string;
  node_id: string;
  revision_number: number;
  title: string;
  summary: string | null;
  evidence_snippet: string | null;
  changed_by: string | null;
  changed_by_ai: boolean;
  change_reason: string | null;
  created_at: string;
};

export type ExportRow = RowTimestamps & {
  id: string;
  workspace_id: string;
  project_id: string | null;
  kind: ExportKind;
  status: ProcessingStatus;
  file_url: string | null;
  created_by: string;
  metadata: Json;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: WorkspaceRow;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<WorkspaceRow, "id" | "owner_id">>;
        Relationships: [];
      };
      workspace_members: {
        Row: WorkspaceMemberRow;
        Insert: {
          workspace_id: string;
          user_id: string;
          role?: WorkspaceMemberRow["role"];
          created_at?: string;
        };
        Update: Partial<Pick<WorkspaceMemberRow, "role">>;
        Relationships: [];
      };
      projects: {
        Row: ProjectRow;
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ProjectRow, "id" | "workspace_id" | "created_at">>;
        Relationships: [];
      };
      captures: {
        Row: CaptureRow;
        Insert: {
          id?: string;
          workspace_id: string;
          project_id?: string | null;
          title?: string | null;
          raw_text: string;
          source_kind?: CaptureSourceKind;
          created_by: string;
          embedding?: number[] | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Pick<CaptureRow, "project_id" | "title" | "metadata" | "updated_at">
        >;
        Relationships: [];
      };
      capture_sources: {
        Row: CaptureSourceRow;
        Insert: {
          id?: string;
          workspace_id: string;
          capture_id: string;
          label: string;
          url?: string | null;
          provider?: string | null;
          author?: string | null;
          captured_at?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<
          Omit<CaptureSourceRow, "id" | "workspace_id" | "capture_id" | "created_at">
        >;
        Relationships: [];
      };
      processing_jobs: {
        Row: ProcessingJobRow;
        Insert: {
          id?: string;
          workspace_id: string;
          capture_id: string;
          status?: ProcessingStatus;
          job_type?: string;
          model?: string | null;
          prompt_version?: string | null;
          confidence?: number | null;
          retry_count?: number;
          error_message?: string | null;
          metadata?: Json;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ProcessingJobRow, "id" | "workspace_id" | "capture_id">>;
        Relationships: [];
      };
      nodes: {
        Row: MindNodeRow;
        Insert: Partial<MindNodeRow> &
          Pick<MindNodeRow, "workspace_id" | "kind" | "title">;
        Update: Partial<Omit<MindNodeRow, "id" | "workspace_id" | "created_at">>;
        Relationships: [];
      };
      edges: {
        Row: MindEdgeRow;
        Insert: Partial<MindEdgeRow> &
          Pick<MindEdgeRow, "workspace_id" | "source_node_id" | "target_node_id" | "kind">;
        Update: Partial<Omit<MindEdgeRow, "id" | "workspace_id" | "created_at">>;
        Relationships: [];
      };
      contexts: {
        Row: MindContextRow;
        Insert: Partial<MindContextRow> &
          Pick<MindContextRow, "workspace_id" | "kind" | "label">;
        Update: Partial<Omit<MindContextRow, "id" | "workspace_id" | "created_at">>;
        Relationships: [];
      };
      node_contexts: {
        Row: NodeContextRow;
        Insert: {
          node_id: string;
          context_id: string;
          workspace_id: string;
          created_at?: string;
        };
        Update: Partial<Pick<NodeContextRow, "workspace_id">>;
        Relationships: [];
      };
      node_revisions: {
        Row: NodeRevisionRow;
        Insert: Partial<NodeRevisionRow> &
          Pick<NodeRevisionRow, "workspace_id" | "node_id" | "revision_number" | "title">;
        Update: Partial<Omit<NodeRevisionRow, "id" | "workspace_id" | "node_id" | "created_at">>;
        Relationships: [];
      };
      exports: {
        Row: ExportRow;
        Insert: Partial<ExportRow> &
          Pick<ExportRow, "workspace_id" | "kind" | "created_by">;
        Update: Partial<Omit<ExportRow, "id" | "workspace_id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      capture_source_kind: CaptureSourceKind;
      processing_status: ProcessingStatus;
      node_kind: NodeKind;
      edge_kind: EdgeKind;
      context_kind: ContextKind;
      export_kind: ExportKind;
    };
    CompositeTypes: Record<string, never>;
  };
};
