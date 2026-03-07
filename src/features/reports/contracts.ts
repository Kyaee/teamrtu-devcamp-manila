import type { DrainReport, FloodReport } from "@/src/types/domain";

export type ReportSubmissionPayload =
  | { type: "flood"; data: FloodReport }
  | { type: "drain"; data: DrainReport };

export type ReportSubmissionResult = {
  queuedOffline: boolean;
  accepted: boolean;
};
