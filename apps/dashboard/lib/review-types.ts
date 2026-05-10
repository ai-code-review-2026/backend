// Review Assignment Types
export interface ReviewAssignment {
  id: string
  analysis_id: string
  reviewer_id: string
  assigner_id: string | null
  assignment_type: "auto" | "manual" | "self_assigned"
  status: "pending" | "in_progress" | "completed" | "declined"
  priority: "low" | "medium" | "high" | "critical"
  assigned_at: string
  started_at: string | null
  completed_at: string | null
  due_at: string | null
  declined_reason: string | null
  created_at: string
  updated_at: string
}

// Review Comment Types
export interface ReviewComment {
  id: string
  analysis_id: string
  author_id: string
  parent_id: string | null
  file_path: string
  line_start: number
  line_end: number | null
  code_snippet: string | null
  content: string
  comment_type: "comment" | "suggestion" | "question" | "praise" | "change_request"
  severity: "info" | "warn" | "blocker" | null
  status: "open" | "resolved" | "wontfix"
  resolved_by: string | null
  resolved_at: string | null
  is_blocking: boolean
  reactions_json: Record<string, number>
  created_at: string
  updated_at: string
}

// Change Request Types
export interface ChangeRequest {
  id: string
  analysis_id: string
  reviewer_id: string
  title: string
  description: string
  category: "security" | "performance" | "quality" | "style" | "tests" | "documentation"
  priority: "low" | "medium" | "high" | "critical"
  related_comments: string[]
  related_findings: string[]
  status: "open" | "in_progress" | "resolved" | "declined"
  resolved_by: string | null
  resolved_at: string | null
  resolution_comment: string | null
  created_at: string
  updated_at: string
}

// Review Template Types
export interface ReviewTemplate {
  id: string
  created_by: string
  organization_id: string | null
  name: string
  description: string | null
  category: "security" | "performance" | "general" | "critical_change" | "frontend" | "backend"
  is_default: boolean
  is_public: boolean
  checklist_items: ChecklistItem[]
  guidelines: string | null
  auto_apply_rules: Record<string, any>
  usage_count: number
  created_at: string
  updated_at: string
}

export interface ChecklistItem {
  id: string
  label: string
  description?: string
  checked: boolean
  required?: boolean
}

// Review Session Types (Live Collaboration)
export interface ReviewSession {
  id: string
  analysis_id: string
  initiator_id: string
  status: "active" | "paused" | "completed"
  participants: string[]
  started_at: string
  ended_at: string | null
  current_file: string | null
  cursor_positions: Record<string, CursorPosition>
  session_notes: string | null
  recording_enabled: boolean
  created_at: string
  updated_at: string
}

export interface CursorPosition {
  file: string
  line: number
}

// Reviewer Metrics Types
export interface ReviewerMetrics {
  id: string
  reviewer_id: string
  period_start: string
  period_end: string
  // Volume metrics
  reviews_assigned: number
  reviews_completed: number
  reviews_declined: number
  comments_created: number
  change_requests_created: number
  // Quality metrics
  avg_review_time_minutes: number | null
  avg_comments_per_review: number | null
  findings_identified: number
  false_positives: number
  // Decision metrics
  approvals: number
  warnings: number
  blocks: number
  overrides_received: number
  // SLA metrics
  reviews_within_sla: number
  reviews_breached_sla: number
  avg_response_time_minutes: number | null
  created_at: string
  updated_at: string
}

// Dashboard View Types
export interface ReviewerQueueItem {
  assignment: ReviewAssignment
  analysis: {
    id: string
    repo: string
    pr_label: string
    author: string
    findings_summary: {
      blocker: number
      warn: number
      info: number
    }
    complexity_score?: number
    estimated_time_minutes?: number
  }
  is_overdue: boolean
  wait_time_hours: number
}

export interface ReviewerDashboardStats {
  pending_reviews: number
  in_progress_reviews: number
  completed_this_week: number
  overdue_reviews: number
  avg_review_time_minutes: number
  sla_compliance_rate: number
}

export interface ReviewQueueFilters {
  status?: "pending" | "in_progress" | "overdue" | null
  priority?: "low" | "medium" | "high" | "critical" | null
  assignment_type?: "auto" | "manual" | "self_assigned" | null
  specialties?: string[]
}

// API Request/Response Types
export interface CreateReviewAssignmentRequest {
  analysis_id: string
  reviewer_id: string
  assigner_id?: string | null
  assignment_type: "auto" | "manual" | "self_assigned"
  priority?: "low" | "medium" | "high" | "critical"
  due_at?: string | null
}

export interface UpdateReviewAssignmentRequest {
  status?: "pending" | "in_progress" | "completed" | "declined"
  started_at?: string | null
  completed_at?: string | null
  declined_reason?: string | null
}

export interface CreateReviewCommentRequest {
  analysis_id: string
  author_id: string
  file_path: string
  line_start: number
  content: string
  comment_type?: "comment" | "suggestion" | "question" | "praise" | "change_request"
  parent_id?: string | null
  line_end?: number | null
  code_snippet?: string | null
  severity?: "info" | "warn" | "blocker" | null
  is_blocking?: boolean
}

export interface CreateChangeRequestRequest {
  analysis_id: string
  reviewer_id: string
  title: string
  description: string
  category: "security" | "performance" | "quality" | "style" | "tests" | "documentation"
  priority?: "low" | "medium" | "high" | "critical"
  related_comments?: string[]
  related_findings?: string[]
}

export interface ReviewDecisionRequest {
  decision: "approve" | "warn" | "block"
  comment?: string
  summary?: string
}

// WebSocket Message Types (for live sessions)
export interface WSMessage {
  type: "cursor_update" | "comment_created" | "user_joined" | "user_left" | "file_changed"
  session_id: string
  user_id: string
  data: any
}

export interface CursorUpdateMessage extends WSMessage {
  type: "cursor_update"
  data: CursorPosition
}

export interface CommentCreatedMessage extends WSMessage {
  type: "comment_created"
  data: ReviewComment
}

// Extended Analysis Type (with review fields)
export interface AnalysisWithReview {
  id: string
  repo: string
  pr_number: number | null
  commit_sha: string | null
  status: string
  // Review-specific fields
  assigned_reviewer_id: string | null
  review_status: "pending" | "in_review" | "changes_requested" | "approved" | "rejected"
  review_priority: "low" | "medium" | "high" | "critical"
  review_due_at: string | null
  review_started_at: string | null
  review_completed_at: string | null
  blocking_comments_count: number
  change_requests_count: number
  // Other existing fields...
  created_at: string
  updated_at: string
}

// User with reviewer metadata
export interface ReviewerUser {
  id: string
  email: string
  display_name: string | null
  is_active: boolean
  reviewer_level: "junior" | "senior" | "lead" | null
  reviewer_capacity: number
  reviewer_specialties: string[]
  auto_assign_enabled: boolean
  notification_preferences: {
    email: boolean
    push: boolean
    realtime: boolean
  }
}

// Utility Types
export type ReviewStatus = "pending" | "in_review" | "changes_requested" | "approved" | "rejected"
export type AssignmentStatus = "pending" | "in_progress" | "completed" | "declined"
export type CommentStatus = "open" | "resolved" | "wontfix"
export type ChangeRequestStatus = "open" | "in_progress" | "resolved" | "declined"
export type ReviewPriority = "low" | "medium" | "high" | "critical"
export type ReviewerLevel = "junior" | "senior" | "lead"

// Pending Comment (for batched review submission)
export interface PendingComment {
  id: string // temporary UUID for tracking in UI
  file_path: string
  line_start: number
  line_end?: number
  code_snippet?: string
  content: string
  comment_type: "comment" | "suggestion" | "question" | "praise" | "change_request"
  severity?: "info" | "warn" | "blocker"
  is_blocking: boolean
}

// Review Verdict Types
export type ReviewVerdict = "approve" | "request_changes" | "comment_only"

// Review Submission Request
export interface ReviewSubmissionRequest {
  analysis_id: string
  verdict: ReviewVerdict
  summary: string
  comments: PendingComment[]
}

// Notification Types
export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  data: Record<string, any>
  read: boolean
  created_at: string
  read_at: string | null
}

// Comment Thread (grouped comments)
export interface CommentThread {
  root: ReviewComment
  replies: ReviewComment[]
}

// Author info for displaying in comments
export interface CommentAuthor {
  id: string
  name: string
  avatar?: string
}