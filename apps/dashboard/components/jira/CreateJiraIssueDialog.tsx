"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface JiraProject {
  key: string;
  name: string;
  project_type: string;
  lead?: string;
}

interface CreateJiraIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  findingId: string;
  findingTitle?: string;
  findingDescription?: string;
  onIssueCreated?: (issueKey: string) => void;
}

export function CreateJiraIssueDialog({
  open,
  onOpenChange,
  findingId,
  findingTitle = "",
  findingDescription = "",
  onIssueCreated,
}: CreateJiraIssueDialogProps) {
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [issueType, setIssueType] = useState<string>("Bug");
  const [priority, setPriority] = useState<string>("Medium");
  const [assignee, setAssignee] = useState<string>("");
  const [additionalDescription, setAdditionalDescription] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdIssue, setCreatedIssue] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadProjects();
      setError(null);
      setCreatedIssue(null);
    }
  }, [open]);

  const loadProjects = async () => {
    try {
      const response = await fetch("/api/dashboard/jira/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
        if (data.length > 0 && !selectedProject) {
          setSelectedProject(data[0].key);
        }
      } else {
        setError("Failed to load Jira projects. Please check your configuration.");
      }
    } catch (error) {
      setError("Failed to connect to Jira. Please check your configuration.");
      console.error("Failed to load projects:", error);
    }
  };

  const handleCreateIssue = async () => {
    if (!selectedProject || !findingId) {
      setError("Project and finding are required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/jira/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finding_id: findingId,
          project_key: selectedProject,
          issue_type: issueType,
          priority: priority,
          assignee: assignee || null,
          additional_description: additionalDescription || null,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setCreatedIssue(data.issue);
        toast({
          title: "Jira Issue Created",
          description: `Successfully created issue ${data.issue.key}`,
        });
        onIssueCreated?.(data.issue.key);
      } else {
        setError(data.error || "Failed to create Jira issue");
      }
    } catch (error) {
      setError("Failed to create Jira issue");
      console.error("Create issue error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset form state
    setSelectedProject("");
    setIssueType("Bug");
    setPriority("Medium");
    setAssignee("");
    setAdditionalDescription("");
    setError(null);
    setCreatedIssue(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl bg-black/95 backdrop-blur-md border-orange-200/20">
        <DialogHeader>
          <DialogTitle className="text-orange-100">Create Jira Issue</DialogTitle>
          <DialogDescription className="text-gray-400">
            Create a new Jira issue for this code review finding.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert className="border-red-400/20 bg-red-400/10">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-400">{error}</AlertDescription>
          </Alert>
        )}

        {createdIssue ? (
          <div className="space-y-4">
            <Alert className="border-green-400/20 bg-green-400/10">
              <AlertDescription className="text-green-400">
                Successfully created Jira issue: <strong>{createdIssue.key}</strong>
              </AlertDescription>
            </Alert>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-gray-300">Issue Key</Label>
                <div className="text-gray-100 font-mono">{createdIssue.key}</div>
              </div>
              <div>
                <Label className="text-gray-300">Status</Label>
                <div className="text-gray-400">{createdIssue.status}</div>
              </div>
              <div>
                <Label className="text-gray-300">Priority</Label>
                <div className="text-gray-400">{createdIssue.priority}</div>
              </div>
              <div>
                <Label className="text-gray-300">Type</Label>
                <div className="text-gray-400">{createdIssue.issue_type}</div>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <Button
                onClick={() => window.open(createdIssue.url, "_blank")}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View in Jira
              </Button>
              <Button onClick={handleClose} variant="outline" className="border-gray-600 text-gray-400">
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {findingTitle && (
              <div className="space-y-2">
                <Label className="text-gray-300">Finding</Label>
                <div className="text-sm text-gray-400 p-3 bg-gray-800/30 rounded-md border border-gray-700">
                  <div className="font-medium text-gray-200">{findingTitle}</div>
                  {findingDescription && (
                    <div className="mt-1 text-gray-400">{findingDescription}</div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="project" className="text-gray-300">
                  Project *
                </Label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="bg-gray-800/50 border-gray-600">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    {projects.map((project) => (
                      <SelectItem key={project.key} value={project.key}>
                        {project.key} - {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="issueType" className="text-gray-300">
                  Issue Type
                </Label>
                <Select value={issueType} onValueChange={setIssueType}>
                  <SelectTrigger className="bg-gray-800/50 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="Bug">Bug</SelectItem>
                    <SelectItem value="Task">Task</SelectItem>
                    <SelectItem value="Story">Story</SelectItem>
                    <SelectItem value="Improvement">Improvement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority" className="text-gray-300">
                  Priority
                </Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="bg-gray-800/50 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="Highest">Highest</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Lowest">Lowest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="assignee" className="text-gray-300">
                  Assignee (Optional)
                </Label>
                <Input
                  id="assignee"
                  placeholder="Username or leave empty"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-gray-300">
                Additional Description (Optional)
              </Label>
              <Textarea
                id="description"
                placeholder="Add any additional context or instructions..."
                value={additionalDescription}
                onChange={(e) => setAdditionalDescription(e.target.value)}
                rows={3}
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
              />
            </div>

            <div className="flex space-x-2 pt-4">
              <Button 
                onClick={handleCreateIssue} 
                disabled={isLoading || !selectedProject}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {isLoading ? "Creating..." : "Create Issue"}
              </Button>
              <Button 
                onClick={handleClose} 
                variant="outline"
                className="border-gray-600 text-gray-400 hover:bg-gray-800/50"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}