"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Settings, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface JiraConfig {
  configured: boolean;
  base_url?: string;
  username?: string;
}

interface JiraConfigFormData {
  base_url: string;
  username: string;
  api_token: string;
  project_key: string;
}

export function JiraConfiguration() {
  const [config, setConfig] = useState<JiraConfig | null>(null);
  const [formData, setFormData] = useState<JiraConfigFormData>({
    base_url: "",
    username: "",
    api_token: "",
    project_key: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch("/api/dashboard/jira/config");
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        if (data.base_url && data.username) {
          setFormData(prev => ({
            ...prev,
            base_url: data.base_url,
            username: data.username,
          }));
        }
      }
    } catch (error) {
      console.error("Failed to load Jira config:", error);
    }
  };

  const handleSave = async () => {
    if (!formData.base_url || !formData.username || !formData.api_token || !formData.project_key) {
      setError("All fields are required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/jira/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast({
          title: "Jira Configuration Saved",
          description: "Your Jira integration is now configured and ready to use.",
        });
        setIsConfiguring(false);
        loadConfig();
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to save configuration");
      }
    } catch (error) {
      setError("Failed to save configuration");
      console.error("Jira config error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    setIsConfiguring(true);
    setError(null);
  };

  return (
    <Card className="border-orange-200/20 bg-black/40 backdrop-blur-md">
      <CardHeader className="border-b border-orange-200/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-orange-400" />
            <CardTitle className="text-orange-100">Jira Integration</CardTitle>
          </div>
          {config?.configured && (
            <Badge variant="outline" className="border-green-400/20 bg-green-400/10 text-green-400">
              <CheckCircle className="h-3 w-3 mr-1" />
              Configured
            </Badge>
          )}
        </div>
        <CardDescription className="text-gray-400">
          Connect to Jira to create and manage issues from code review findings.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        {error && (
          <Alert className="mb-4 border-red-400/20 bg-red-400/10">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-400">{error}</AlertDescription>
          </Alert>
        )}

        {config?.configured && !isConfiguring ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-gray-300">Instance URL</Label>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-gray-400">{config.base_url}</span>
                  <ExternalLink className="h-3 w-3 text-gray-500" />
                </div>
              </div>
              <div>
                <Label className="text-gray-300">Username</Label>
                <div className="text-gray-400 mt-1">{config.username}</div>
              </div>
            </div>
            <Button 
              onClick={handleEdit}
              variant="outline" 
              className="border-orange-400/20 text-orange-400 hover:bg-orange-400/10"
            >
              <Settings className="h-4 w-4 mr-2" />
              Update Configuration
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="base_url" className="text-gray-300">
                Jira Instance URL
              </Label>
              <Input
                id="base_url"
                placeholder="https://company.atlassian.net"
                value={formData.base_url}
                onChange={(e) => setFormData(prev => ({ ...prev, base_url: e.target.value }))}
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-300">
                Username/Email
              </Label>
              <Input
                id="username"
                placeholder="your-email@company.com"
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_token" className="text-gray-300">
                API Token
              </Label>
              <Input
                id="api_token"
                type="password"
                placeholder="Your Jira API token"
                value={formData.api_token}
                onChange={(e) => setFormData(prev => ({ ...prev, api_token: e.target.value }))}
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
              />
              <p className="text-xs text-gray-500">
                Create an API token at{" "}
                <a 
                  href="https://id.atlassian.com/manage-profile/security/api-tokens" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-orange-400 hover:underline"
                >
                  Atlassian Account Settings
                </a>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project_key" className="text-gray-300">
                Default Project Key
              </Label>
              <Input
                id="project_key"
                placeholder="PROJ"
                value={formData.project_key}
                onChange={(e) => setFormData(prev => ({ ...prev, project_key: e.target.value }))}
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
              />
            </div>
            <div className="flex space-x-2">
              <Button 
                onClick={handleSave} 
                disabled={isLoading}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {isLoading ? "Saving..." : "Save Configuration"}
              </Button>
              {isConfiguring && (
                <Button 
                  onClick={() => setIsConfiguring(false)}
                  variant="outline"
                  className="border-gray-600 text-gray-400 hover:bg-gray-800/50"
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}