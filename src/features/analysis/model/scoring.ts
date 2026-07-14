import { JOB_REGISTRY } from "@/config/registry";
import type { CaptureAnalysisOutput } from "@/features/analysis/model/extraction-schema";
import type { VerifiedEvidence } from "@/features/analysis/model/evidence";

type EvidenceBearing = {
  evidence?: VerifiedEvidence | null;
  confidence: number;
};

export type ScoredAnalysis = {
  confidence: number;
  reviewRequired: boolean;
  reviewReasons: string[];
};

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function itemConfidence(item: EvidenceBearing) {
  const base = Math.min(Math.max(item.confidence, 0), 1);

  if (!item.evidence) return Math.min(base, 0.62);
  if (!item.evidence.verified) return Math.min(base, 0.58);

  return base;
}

export function scoreAnalysis(
  analysis: CaptureAnalysisOutput,
  evidenceItems: EvidenceBearing[],
): ScoredAnalysis {
  const reviewReasons = new Set<string>();
  const nodeIds = new Set(analysis.nodes.map((node) => node.clientNodeId));

  if (!analysis.nodes.length) reviewReasons.add("NO_NODES");

  for (const edge of analysis.edges) {
    if (!nodeIds.has(edge.sourceClientNodeId) || !nodeIds.has(edge.targetClientNodeId)) {
      reviewReasons.add("INVALID_EDGE_REFERENCE");
    }
  }

  for (const item of evidenceItems) {
    if (!item.evidence) reviewReasons.add("MISSING_EVIDENCE");
    else if (!item.evidence.verified) reviewReasons.add("UNVERIFIED_EVIDENCE");
  }

  const confidence = average(evidenceItems.map(itemConfidence));

  if (confidence < JOB_REGISTRY.captureStructuring.confidence.autoCompleteThreshold) {
    reviewReasons.add("LOW_CONFIDENCE");
  }

  return {
    confidence,
    reviewRequired:
      reviewReasons.size > 0 ||
      confidence < JOB_REGISTRY.captureStructuring.confidence.autoCompleteThreshold,
    reviewReasons: [...reviewReasons],
  };
}
