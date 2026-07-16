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
  folder_id: string | null;
  idempotency_key: string | null;
  title: string | null;
  raw_text: string;
  source_kind: CaptureSourceKind;
  created_by: string;
  embedding: number[] | null;
  search_document: string;
  metadata: Json;
  updated_at: string;
};

export type FolderRow = RowTimestamps & {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  updated_at: string;
};

export type CaptureTopicRow = {
  capture_id: string;
  topic_context_id: string;
  workspace_id: string;
  topic_kind: "topic";
  assigned_by: string | null;
  created_at: string;
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
  claimed_by: string | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  next_run_at: string;
  max_attempts: number;
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
  search_document: string;
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

export type OutboxEventRow = RowTimestamps & {
  id: string;
  workspace_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  dedupe_key: string;
  payload: Json;
  status: "pending" | "processing" | "published" | "failed";
  attempts: number;
  available_at: string;
  published_at: string | null;
  claimed_by: string | null;
  lease_expires_at: string | null;
  last_error_code: string | null;
  updated_at: string;
};

export type JobAttemptRow = {
  id: string;
  workspace_id: string;
  job_id: string;
  attempt_number: number;
  status: ProcessingStatus;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metadata: Json;
  created_at: string;
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
          folder_id?: string | null;
          idempotency_key?: string | null;
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
          Pick<CaptureRow, "project_id" | "folder_id" | "title" | "metadata" | "updated_at">
        >;
        Relationships: [];
      };
      folders: {
        Row: FolderRow;
        Insert: {
          id?: string;
          workspace_id: string;
          parent_id?: string | null;
          name: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Pick<FolderRow, "parent_id" | "name" | "sort_order" | "updated_at">
        >;
        Relationships: [];
      };
      capture_topics: {
        Row: CaptureTopicRow;
        Insert: {
          capture_id: string;
          topic_context_id: string;
          workspace_id: string;
          topic_kind?: "topic";
          assigned_by?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
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
          claimed_by?: string | null;
          lease_expires_at?: string | null;
          last_heartbeat_at?: string | null;
          next_run_at?: string;
          max_attempts?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ProcessingJobRow, "id" | "workspace_id" | "capture_id">>;
        Relationships: [];
      };
      outbox_events: {
        Row: OutboxEventRow;
        Insert: {
          id?: string;
          workspace_id: string;
          aggregate_type: string;
          aggregate_id: string;
          event_type: string;
          dedupe_key: string;
          payload?: Json;
          status?: OutboxEventRow["status"];
          attempts?: number;
          available_at?: string;
          published_at?: string | null;
          claimed_by?: string | null;
          lease_expires_at?: string | null;
          last_error_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Omit<OutboxEventRow, "id" | "workspace_id" | "created_at">
        >;
        Relationships: [];
      };
      job_attempts: {
        Row: JobAttemptRow;
        Insert: {
          id?: string;
          workspace_id: string;
          job_id: string;
          attempt_number: number;
          status?: ProcessingStatus;
          started_at?: string | null;
          completed_at?: string | null;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<
          Omit<JobAttemptRow, "id" | "workspace_id" | "job_id" | "created_at">
        >;
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
    Functions: {
      claim_analysis_outbox_events: {
        Args: {
          p_worker_id: string;
          p_limit?: number;
          p_lease_seconds?: number;
        };
        Returns: {
          event_id: string;
          workspace_id: string;
          aggregate_id: string;
          event_type: string;
          dedupe_key: string;
          payload: Json;
          attempts: number;
          created_at: string;
        }[];
      };
      claim_analysis_outbox_event_by_job_id: {
        Args: {
          p_processing_job_id: string;
          p_worker_id: string;
          p_lease_seconds?: number;
        };
        Returns: {
          event_id: string;
          workspace_id: string;
          aggregate_id: string;
          event_type: string;
          dedupe_key: string;
          payload: Json;
          attempts: number;
          created_at: string;
        }[];
      };
      mark_analysis_outbox_published: {
        Args: {
          p_event_id: string;
          p_worker_id: string;
          p_message_id?: string | null;
        };
        Returns: boolean;
      };
      fail_analysis_outbox_event: {
        Args: {
          p_event_id: string;
          p_worker_id: string;
          p_error_code: string;
          p_retry_delay_seconds?: number;
          p_max_attempts?: number;
        };
        Returns: {
          status: OutboxEventRow["status"];
          attempts: number;
          available_at: string;
        }[];
      };
      record_analysis_operator_recovery: {
        Args: {
          p_job_id: string;
          p_workspace_id: string;
          p_capture_id: string;
          p_error_code: string;
          p_delivery_count: number;
        };
        Returns: boolean;
      };
      create_capture_command: {
        Args: {
          p_workspace_id: string;
          p_request_id: string;
          p_raw_text: string;
          p_project_id?: string | null;
          p_title?: string | null;
          p_source_kind?: CaptureSourceKind;
          p_source?: Json | null;
          p_metadata?: Json;
        };
        Returns: {
          capture_id: string;
          workspace_id: string;
          project_id: string | null;
          title: string | null;
          source_kind: CaptureSourceKind;
          capture_created_at: string;
          processing_job_id: string;
          processing_job_status: ProcessingStatus;
          processing_job_type: string;
          processing_job_created_at: string;
        }[];
      };
      update_capture_organization: {
        Args: {
          p_capture_id: string;
          p_actor_user_id: string;
          p_folder_id_provided?: boolean;
          p_folder_id?: string | null;
          p_topic_ids?: string[] | null;
        };
        Returns: boolean;
      };
      claim_capture_analysis_job: {
        Args: {
          p_worker_id: string;
          p_lease_seconds?: number;
          p_model?: string | null;
          p_prompt_version?: string | null;
          p_max_attempts?: number;
        };
        Returns: {
          job_id: string;
          attempt_id: string;
          attempt_number: number;
          workspace_id: string;
          capture_id: string;
          raw_text: string;
          source_kind: CaptureSourceKind;
          title: string | null;
          model: string;
          prompt_version: string;
        }[];
      };
      claim_capture_analysis_job_by_id: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_lease_seconds?: number;
          p_model?: string | null;
          p_prompt_version?: string | null;
          p_max_attempts?: number;
        };
        Returns: {
          job_id: string;
          attempt_id: string;
          attempt_number: number;
          workspace_id: string;
          capture_id: string;
          raw_text: string;
          source_kind: CaptureSourceKind;
          title: string | null;
          model: string;
          prompt_version: string;
        }[];
      };
      persist_capture_analysis_result: {
        Args: {
          p_job_id: string;
          p_attempt_id: string;
          p_worker_id: string;
          p_result: Json;
          p_model: string;
          p_prompt_version: string;
          p_confidence: number;
          p_review_required?: boolean;
          p_review_reasons?: Json;
        };
        Returns: {
          job_id: string;
          status: ProcessingStatus;
          node_count: number;
          edge_count: number;
          context_count: number;
        }[];
      };
      fail_capture_analysis_job: {
        Args: {
          p_job_id: string;
          p_attempt_id: string;
          p_worker_id: string;
          p_error_code: string;
          p_error_message?: string | null;
          p_retry_delay_seconds?: number;
          p_max_attempts?: number;
        };
        Returns: {
          job_id: string;
          status: ProcessingStatus;
          retry_count: number;
          next_run_at: string;
        }[];
      };
      delete_capture_lifecycle: {
        Args: {
          p_capture_id: string;
          p_workspace_id: string;
          p_actor_user_id: string;
        };
        Returns: {
          deleted_capture_id: string;
          deleted_node_count: number;
          deleted_edge_count: number;
        }[];
      };
      retry_processing_job_lifecycle: {
        Args: {
          p_job_id: string;
          p_workspace_id: string;
          p_actor_user_id: string;
        };
        Returns: {
          job_id: string;
          status: ProcessingStatus;
          retry_count: number;
          max_attempts: number;
          next_run_at: string;
        }[];
      };
      search_workspace_knowledge: {
        Args: {
          p_workspace_id: string;
          p_query: string;
          p_query_embedding?: string | null;
          p_limit?: number;
        };
        Returns: {
          result_id: string;
          source_type: "node" | "capture";
          title: string;
          snippet: string;
          evidence: string | null;
          node_kind: NodeKind | null;
          capture_id: string | null;
          lexical_score: number;
          semantic_score: number;
          graph_score: number;
          final_score: number;
        }[];
      };
    };
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
  private: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      claim_analysis_outbox_events: {
        Args: {
          p_worker_id: string;
          p_limit?: number;
          p_lease_seconds?: number;
        };
        Returns: {
          event_id: string;
          workspace_id: string;
          aggregate_id: string;
          event_type: string;
          dedupe_key: string;
          payload: Json;
          attempts: number;
          created_at: string;
        }[];
      };
      claim_analysis_outbox_event_by_job_id: {
        Args: {
          p_processing_job_id: string;
          p_worker_id: string;
          p_lease_seconds?: number;
        };
        Returns: {
          event_id: string;
          workspace_id: string;
          aggregate_id: string;
          event_type: string;
          dedupe_key: string;
          payload: Json;
          attempts: number;
          created_at: string;
        }[];
      };
      mark_analysis_outbox_published: {
        Args: {
          p_event_id: string;
          p_worker_id: string;
          p_message_id?: string | null;
        };
        Returns: boolean;
      };
      fail_analysis_outbox_event: {
        Args: {
          p_event_id: string;
          p_worker_id: string;
          p_error_code: string;
          p_retry_delay_seconds?: number;
          p_max_attempts?: number;
        };
        Returns: {
          status: OutboxEventRow["status"];
          attempts: number;
          available_at: string;
        }[];
      };
      record_analysis_operator_recovery: {
        Args: {
          p_job_id: string;
          p_workspace_id: string;
          p_capture_id: string;
          p_error_code: string;
          p_delivery_count: number;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
