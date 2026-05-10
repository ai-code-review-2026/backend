"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Plus, Link, AlertCircle } from "lucide-react";
import { CreateJiraIssueDialog } from "./CreateJiraIssueDialog";
import { useToast } from "@/hooks/use-toast";

interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  priority: string;
  url: string;
  assignee?: string;
}

interface JiraFindingActionsProps {
  findingId: string;
  findingTitle?: string;
  findingDescription?: string;
  className?: string;
}

export function JiraFindingActions({
  findingId,
  findingTitle,
  findingDescription,
  className = "",
}: JiraFindingActionsProps) {
  const [linkedIssue, setLinkedIssue] = useState<JiraIssue | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadLinkedIssue();
  }, [findingId]);

  const loadLinkedIssue = async () => {
    try {
      const response = await fetch(`/api/dashboard/jira/findings/${findingId}`);
      if (response.ok) {
        const data = await response.json();
        setLinkedIssue(data);
      }
    } catch (error) {
      console.error("Failed to load linked issue:", error);
    }
  };

  const handleIssueCreated = (issueKey: string) => {
    setShowCreateDialog(false);
    loadLinkedIssue();
    toast({
      title: "Issue Created",
      description: `Jira issue ${issueKey} has been created and linked to this finding.`,
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "highest":
      case "blocker":
        return "text-red-400 border-red-400/20 bg-red-400/10";
      case "high":
        return "text-orange-400 border-orange-400/20 bg-orange-400/10";
      case "medium":
        return "text-yellow-400 border-yellow-400/20 bg-yellow-400/10";
      case "low":
      case "lowest":
        return "text-green-400 border-green-400/20 bg-green-400/10";
      default:
        return "text-gray-400 border-gray-400/20 bg-gray-400/10";
    }
  };

  const getStatusColor = (status: string) => {
    const lowerStatus = status?.toLowerCase();
    if (lowerStatus?.includes("done") || lowerStatus?.includes("resolved")) {
      return "text-green-400 border-green-400/20 bg-green-400/10";
    } else if (lowerStatus?.includes("progress") || lowerStatus?.includes("active")) {
      return "text-blue-400 border-blue-400/20 bg-blue-400/10";
    } else {
      return "text-gray-400 border-gray-400/20 bg-gray-400/10";
    }
  };

  if (linkedIssue) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center space-x-2 text-sm">
          <Link className="h-4 w-4 text-orange-400" />
          <span className="text-gray-300">Linked to Jira:</span>
        </div>
        <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg border border-gray-700">
          <div className="flex items-center space-x-3">
            <span className="font-mono text-orange-400 font-medium">{linkedIssue.key}</span>
            <Badge variant="outline" className={getStatusColor(linkedIssue.status)}>
              {linkedIssue.status}
            </Badge>
            <Badge variant="outline" className={getPriorityColor(linkedIssue.priority)}>
              {linkedIssue.priority}
            </Badge>
            {linkedIssue.assignee && (
              <span className="text-xs text-gray-400">@ {linkedIssue.assignee}</span>
            )}
          </div>
          <Button
            onClick={() => window.open(linkedIssue.url, "_blank")}
            size="sm"
            variant="outline"
            className="border-orange-400/20 text-orange-400 hover:bg-orange-400/10"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            View
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex space-x-2">
        <Button
          onClick={() => setShowCreateDialog(true)}
          size="sm"
          className="bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-400/20"
          variant="outline"
        >
          <Plus className="h-3 w-3 mr-1" />
          Create Issue
        </Button>
      </div>

      <CreateJiraIssueDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        findingId={findingId}
        findingTitle={findingTitle}
        findingDescription={findingDescription}
        onIssueCreated={handleIssueCreated}
      />
    </div>
  );
}