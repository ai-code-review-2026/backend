"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Play, 
  Pause, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  RefreshCw,
  GitMerge,
  ArrowRight,
  Users,
  MessageSquare,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReviewState {
  id: string;
  analysis_id: string;
  current_state: string;
  previous_state?: string;
  transition_reason?: string;
  transitioned_by?: string;
  transitioned_at: string;
  metadata: Record<string, any>;
  reviewers_assigned: string[];
  reviewers_completed: string[];
  blocking_comments: number;
  change_requests: number;
  time_in_current_state?: number;
  total_review_time?: number;
  sla_deadline?: string;
  is_overdue: boolean;
  is_terminal: boolean;
  is_active: boolean;
  valid_transitions: string[];
  created_at: string;
  updated_at: string;
}

interface ReviewStateVisualizerProps {
  analysisId: string;
  className?: string;
}

const STATE_LABELS: Record<string, string> = {
  draft: "Draft",
  ready_for_review: "Ready for Review",
  assigning_reviewers: "Assigning Reviewers",
  pending_review: "Pending Review",
  in_review: "In Review",
  waiting_for_changes: "Waiting for Changes",
  changes_requested: "Changes Requested",
  approved: "Approved",
  approved_with_suggestions: "Approved with Suggestions",
  merged: "Merged",
  closed: "Closed",
  abandoned: "Abandoned",
  blocked: "Blocked",
  failed: "Failed",
};

const STATE_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  ready_for_review: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  assigning_reviewers: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  pending_review: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  in_review: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  waiting_for_changes: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  changes_requested: "bg-red-500/20 text-red-300 border-red-500/30",
  approved: "bg-green-500/20 text-green-300 border-green-500/30",
  approved_with_suggestions: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  merged: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  closed: "bg-gray-600/20 text-gray-400 border-gray-600/30",
  abandoned: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  blocked: "bg-red-600/20 text-red-400 border-red-600/30",
  failed: "bg-red-700/20 text-red-500 border-red-700/30",
};

const STATE_ICONS: Record<string, any> = {
  draft: RefreshCw,
  ready_for_review: Play,
  assigning_reviewers: Users,
  pending_review: Clock,
  in_review: Play,
  waiting_for_changes: Pause,
  changes_requested: MessageSquare,
  approved: CheckCircle,
  approved_with_suggestions: CheckCircle,
  merged: GitMerge,
  closed: XCircle,
  abandoned: XCircle,
  blocked: AlertTriangle,
  failed: XCircle,
};

const TRANSITION_LABELS: Record<string, string> = {
  submit_for_review: "Submit for Review",
  request_review: "Request Review",
  update_changes: "Update Changes",
  address_feedback: "Address Feedback",
  abandon: "Abandon",
  start_review: "Start Review",
  request_changes: "Request Changes",
  approve: "Approve",
  approve_with_suggestions: "Approve with Suggestions",
  block: "Block",
  reassign: "Reassign",
  auto_assign: "Auto Assign",
  merge: "Merge",
  close: "Close",
  timeout: "Timeout",
  error: "Error",
  restart_review: "Restart Review",
};

export function ReviewStateVisualizer({ analysisId, className = "" }: ReviewStateVisualizerProps) {
  const [state, setState] = useState<ReviewState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedTransition, setSelectedTransition] = useState<string>("");
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [transitionNote, setTransitionNote] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadState();
  }, [analysisId]);

  const loadState = async () => {
    try {
      const response = await fetch(`/api/dashboard/review-states/analysis/${analysisId}`);
      if (response.ok) {
        const data = await response.json();
        setState(data);
      } else if (response.status === 404) {
        // No state exists yet, show initial state
        setState(null);
      } else {
        throw new Error("Failed to load review state");
      }
    } catch (error) {
      console.error("Failed to load review state:", error);
      setError("Failed to load review state");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransition = async () => {
    if (!selectedTransition || !selectedReason) {
      return;
    }

    setIsTransitioning(true);
    setError(null);

    try {
      const response = await fetch(`/api/dashboard/review-states/analysis/${analysisId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_state: selectedTransition,
          transition_reason: selectedReason,
          metadata: transitionNote ? { note: transitionNote } : {},
        }),
      });

      if (response.ok) {
        const updatedState = await response.json();
        setState(updatedState);
        setSelectedTransition("");
        setSelectedReason("");
        setTransitionNote("");
        toast({
          title: "State Transition Successful",
          description: `Review moved to ${STATE_LABELS[selectedTransition]}`,
        });
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to transition state");
      }
    } catch (error) {
      setError("Failed to transition state");
      console.error("Transition error:", error);
    } finally {
      setIsTransitioning(false);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "N/A";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (isLoading) {
    return (
      <Card className={`border-orange-200/20 bg-black/40 backdrop-blur-md ${className}`}>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-700 rounded w-1/4"></div>
            <div className="h-8 bg-gray-700 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!state) {
    return (
      <Card className={`border-orange-200/20 bg-black/40 backdrop-blur-md ${className}`}>
        <CardHeader>
          <CardTitle className="text-orange-100">Review State</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-gray-400">No review state tracking available for this analysis.</p>
        </CardContent>
      </Card>
    );
  }

  const StateIcon = STATE_ICONS[state.current_state] || RefreshCw;

  return (
    <Card className={`border-orange-200/20 bg-black/40 backdrop-blur-md ${className}`}>
      <CardHeader className="border-b border-orange-200/10">
        <CardTitle className="text-orange-100 flex items-center space-x-2">
          <RefreshCw className="h-5 w-5" />
          <span>Review State</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {error && (
          <Alert className="border-red-400/20 bg-red-400/10">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-400">{error}</AlertDescription>
          </Alert>
        )}

        {/* Current State */}
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-lg border ${STATE_COLORS[state.current_state]}`}>
              <StateIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-100">
                {STATE_LABELS[state.current_state]}
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-400">
                  Since {new Date(state.transitioned_at).toLocaleString()}
                </span>
                {state.is_overdue && (
                  <Badge variant="outline" className="border-red-400/20 bg-red-400/10 text-red-400">
                    Overdue
                  </Badge>
                )}
                {state.is_active && (
                  <Badge variant="outline" className="border-orange-400/20 bg-orange-400/10 text-orange-400">
                    Active
                  </Badge>
                )}
                {state.is_terminal && (
                  <Badge variant="outline" className="border-gray-400/20 bg-gray-400/10 text-gray-400">
                    Terminal
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Progress Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-gray-400">Reviewers</div>
              <div className="text-sm font-medium text-gray-200">
                {state.reviewers_completed.length}/{state.reviewers_assigned.length}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-400">Blocking Comments</div>
              <div className="text-sm font-medium text-gray-200">{state.blocking_comments}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-400">Change Requests</div>
              <div className="text-sm font-medium text-gray-200">{state.change_requests}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-400">Review Time</div>
              <div className="text-sm font-medium text-gray-200">
                {formatDuration(state.total_review_time)}
              </div>
            </div>
          </div>
        </div>

        {/* State Transition */}
        {!state.is_terminal && state.valid_transitions.length > 0 && (
          <div className="space-y-4 border-t border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-gray-200">Transition to Next State</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-gray-300">Next State</label>
                <Select value={selectedTransition} onValueChange={setSelectedTransition}>
                  <SelectTrigger className="bg-gray-800/50 border-gray-600">
                    <SelectValue placeholder="Select state..." />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    {state.valid_transitions.map((transitionState) => (
                      <SelectItem key={transitionState} value={transitionState}>
                        {STATE_LABELS[transitionState]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm text-gray-300">Transition Reason</label>
                <Select value={selectedReason} onValueChange={setSelectedReason}>
                  <SelectTrigger className="bg-gray-800/50 border-gray-600">
                    <SelectValue placeholder="Select reason..." />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    {Object.entries(TRANSITION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Note (Optional)</label>
              <Textarea
                value={transitionNote}
                onChange={(e) => setTransitionNote(e.target.value)}
                placeholder="Add a note about this transition..."
                rows={2}
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
              />
            </div>
            
            <Button
              onClick={handleTransition}
              disabled={isTransitioning || !selectedTransition || !selectedReason}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isTransitioning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Transitioning...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Transition State
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}