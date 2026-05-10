'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { 
  ExternalLink, 
  Settings, 
  Activity, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  User, 
  Calendar,
  RefreshCw,
  Link as LinkIcon,
  Unlink,
  Eye,
  Edit3,
  Trash2,
  Plus,
  Filter,
  Search,
  ArrowRight,
  Bug,
  Zap,
  Target,
  BookOpen,
  Users,
  GitBranch,
  MessageSquare
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Types
interface JiraCredentials {
  domain: string;
  email: string;
  apiToken: string;
  isConnected: boolean;
  lastSyncAt?: Date;
}

interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  description?: string;
  status: {
    name: string;
    category: 'To Do' | 'In Progress' | 'Done';
  };
  priority: {
    name: string;
    iconUrl?: string;
  };
  assignee?: {
    displayName: string;
    emailAddress: string;
    avatarUrls: {
      '16x16': string;
      '24x24': string;
      '32x32': string;
      '48x48': string;
    };
  };
  reporter: {
    displayName: string;
    emailAddress: string;
  };
  issueType: {
    name: string;
    iconUrl: string;
  };
  created: string;
  updated: string;
  duedate?: string;
  project: {
    key: string;
    name: string;
  };
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  lead: {
    displayName: string;
  };
}

// Draggable Issue Card Component
const DraggableIssueCard: React.FC<{
  issue: JiraIssue;
  onEdit: (issue: JiraIssue) => void;
  onView: (issue: JiraIssue) => void;
}> = ({ issue, onEdit, onView }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getStatusColor = (category: string) => {
    switch (category) {
      case 'To Do':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'In Progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Done':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'highest':
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'high':
        return <ArrowRight className="w-4 h-4 text-orange-500 rotate-[-45deg]" />;
      case 'medium':
        return <ArrowRight className="w-4 h-4 text-yellow-500" />;
      case 'low':
        return <ArrowRight className="w-4 h-4 text-green-500 rotate-45" />;
      default:
        return <ArrowRight className="w-4 h-4 text-gray-500" />;
    }
  };

  const getIssueTypeIcon = (issueType: string) => {
    switch (issueType.toLowerCase()) {
      case 'bug':
        return <Bug className="w-4 h-4 text-red-500" />;
      case 'story':
        return <BookOpen className="w-4 h-4 text-green-500" />;
      case 'task':
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'epic':
        return <Zap className="w-4 h-4 text-purple-500" />;
      default:
        return <Target className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className={`group hover:shadow-md transition-all duration-200 cursor-pointer ${isDragging ? 'ring-2 ring-blue-500' : ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              {getIssueTypeIcon(issue.issueType.name)}
              <div className="text-sm font-medium text-blue-600">{issue.key}</div>
              {getPriorityIcon(issue.priority.name)}
            </div>
            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onView(issue);
                }}
                className="p-1"
              >
                <Eye className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(issue);
                }}
                className="p-1"
              >
                <Edit3 className="w-4 h-4" />
              </Button>
              <div 
                {...listeners}
                className="cursor-move p-1 rounded hover:bg-gray-100"
              >
                <RefreshCw className="w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">
              {issue.summary}
            </h3>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge
                className={`text-xs ${getStatusColor(issue.status.category)}`}
                variant="outline"
              >
                {issue.status.name}
              </Badge>
              <span className="text-xs text-gray-500">
                {issue.project.key}
              </span>
            </div>
            
            {issue.assignee && (
              <div className="flex items-center space-x-2">
                <img
                  src={issue.assignee.avatarUrls['24x24']}
                  alt={issue.assignee.displayName}
                  className="w-6 h-6 rounded-full"
                />
                <span className="text-xs text-gray-600 truncate">
                  {issue.assignee.displayName}
                </span>
              </div>
            )}
            
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Updated: {new Date(issue.updated).toLocaleDateString()}</span>
              {issue.duedate && (
                <span className="flex items-center">
                  <Calendar className="w-3 h-3 mr-1" />
                  {new Date(issue.duedate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Kanban Board Component
const JiraKanbanBoard: React.FC<{
  issues: JiraIssue[];
  onIssueUpdate: (issueId: string, newStatus: string) => void;
}> = ({ issues, onIssueUpdate }) => {
  const [boardIssues, setBoardIssues] = useState(issues);
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    setBoardIssues(issues);
  }, [issues]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) return;
    
    const activeIssue = boardIssues.find(issue => issue.id === active.id);
    if (!activeIssue) return;
    
    // Determine new status based on drop zone
    const newStatus = over.id as string;
    if (newStatus !== activeIssue.status.category) {
      onIssueUpdate(activeIssue.id, newStatus);
      
      // Update local state
      setBoardIssues(prev => prev.map(issue => 
        issue.id === activeIssue.id 
          ? { ...issue, status: { ...issue.status, category: newStatus as any } }
          : issue
      ));
    }
  };

  const columns = [
    { id: 'To Do', title: 'To Do', color: 'border-gray-300' },
    { id: 'In Progress', title: 'In Progress', color: 'border-blue-300' },
    { id: 'Done', title: 'Done', color: 'border-green-300' }
  ];

  const getIssuesForColumn = (columnId: string) => {
    return boardIssues.filter(issue => issue.status.category === columnId);
  };

  return (
    <div className="h-full">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-3 gap-6 h-full">
          {columns.map((column) => {
            const columnIssues = getIssuesForColumn(column.id);
            
            return (
              <div key={column.id} className="flex flex-col">
                <div className={`p-4 bg-gray-50 rounded-t-lg border-t-2 ${column.color}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {column.title}
                    </h3>
                    <Badge variant="outline" className="text-xs">
                      {columnIssues.length}
                    </Badge>
                  </div>
                </div>
                
                <div className="flex-1 bg-white border border-t-0 rounded-b-lg p-4 min-h-[600px]">
                  <SortableContext
                    items={columnIssues.map(issue => issue.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {columnIssues.map((issue) => (
                        <DraggableIssueCard
                          key={issue.id}
                          issue={issue}
                          onEdit={(issue) => console.log('Edit issue:', issue)}
                          onView={(issue) => console.log('View issue:', issue)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              </div>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
};

// OAuth Configuration Component
const JiraOAuthConfig: React.FC<{
  credentials: JiraCredentials;
  onConnect: (credentials: JiraCredentials) => void;
  onDisconnect: () => void;
}> = ({ credentials, onConnect, onDisconnect }) => {
  const [domain, setDomain] = useState(credentials.domain);
  const [email, setEmail] = useState(credentials.email);
  const [apiToken, setApiToken] = useState(credentials.apiToken);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    
    try {
      // Simulate API call to test connection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      onConnect({
        domain,
        email,
        apiToken,
        isConnected: true,
        lastSyncAt: new Date()
      });
    } catch (error) {
      console.error('Failed to connect to Jira:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <LinkIcon className="w-5 h-5 mr-2 text-blue-600" />
          Jira Connection
        </CardTitle>
        <CardDescription>
          Configure your Jira Cloud connection with OAuth authentication
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {credentials.isConnected ? (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <div className="text-sm font-medium text-green-900">
                  Connected to {credentials.domain}
                </div>
                <div className="text-xs text-green-700">
                  Last synced: {credentials.lastSyncAt?.toLocaleString()}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={onDisconnect}>
                <Unlink className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
              <Button variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync Now
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="domain">Jira Domain</Label>
              <Input
                id="domain"
                placeholder="your-domain.atlassian.net"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your-email@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="apiToken">API Token</Label>
              <Input
                id="apiToken"
                type="password"
                placeholder="Your Jira API Token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Generate an API token from your{' '}
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Atlassian Account Settings
                </a>
              </p>
            </div>
            
            <Button 
              onClick={handleConnect}
              disabled={!domain || !email || !apiToken || isConnecting}
              className="w-full"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Connect to Jira
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Main Jira Integration Component
const JiraIntegration: React.FC = () => {
  const [credentials, setCredentials] = useState<JiraCredentials>({
    domain: '',
    email: '',
    apiToken: '',
    isConnected: false,
  });

  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all-projects');
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Mock data for demonstration
  useEffect(() => {
    if (credentials.isConnected) {
      // Simulate loading projects
      setProjects([
        {
          id: '1',
          key: 'PROJ',
          name: 'Main Project',
          projectTypeKey: 'software',
          lead: { displayName: 'John Doe' }
        },
        {
          id: '2',
          key: 'DEV',
          name: 'Development Team',
          projectTypeKey: 'software',
          lead: { displayName: 'Jane Smith' }
        }
      ]);

      // Simulate loading issues
      setIssues([
        {
          id: '1',
          key: 'PROJ-123',
          summary: 'Implement user authentication system',
          description: 'Create a secure authentication system with JWT tokens',
          status: { name: 'To Do', category: 'To Do' },
          priority: { name: 'High' },
          assignee: {
            displayName: 'John Doe',
            emailAddress: 'john@example.com',
            avatarUrls: {
              '16x16': 'https://via.placeholder.com/16',
              '24x24': 'https://via.placeholder.com/24',
              '32x32': 'https://via.placeholder.com/32',
              '48x48': 'https://via.placeholder.com/48'
            }
          },
          reporter: {
            displayName: 'Jane Smith',
            emailAddress: 'jane@example.com'
          },
          issueType: { name: 'Story', iconUrl: '' },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          duedate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          project: { key: 'PROJ', name: 'Main Project' }
        },
        {
          id: '2',
          key: 'PROJ-124',
          summary: 'Fix login validation bug',
          status: { name: 'In Progress', category: 'In Progress' },
          priority: { name: 'Critical' },
          assignee: {
            displayName: 'Mike Johnson',
            emailAddress: 'mike@example.com',
            avatarUrls: {
              '16x16': 'https://via.placeholder.com/16',
              '24x24': 'https://via.placeholder.com/24',
              '32x32': 'https://via.placeholder.com/32',
              '48x48': 'https://via.placeholder.com/48'
            }
          },
          reporter: {
            displayName: 'John Doe',
            emailAddress: 'john@example.com'
          },
          issueType: { name: 'Bug', iconUrl: '' },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          project: { key: 'PROJ', name: 'Main Project' }
        },
        {
          id: '3',
          key: 'DEV-45',
          summary: 'Code review process improvements',
          status: { name: 'Done', category: 'Done' },
          priority: { name: 'Medium' },
          assignee: {
            displayName: 'Sarah Wilson',
            emailAddress: 'sarah@example.com',
            avatarUrls: {
              '16x16': 'https://via.placeholder.com/16',
              '24x24': 'https://via.placeholder.com/24',
              '32x32': 'https://via.placeholder.com/32',
              '48x48': 'https://via.placeholder.com/48'
            }
          },
          reporter: {
            displayName: 'Jane Smith',
            emailAddress: 'jane@example.com'
          },
          issueType: { name: 'Task', iconUrl: '' },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          project: { key: 'DEV', name: 'Development Team' }
        }
      ]);
    }
  }, [credentials.isConnected]);

  const handleConnect = (newCredentials: JiraCredentials) => {
    setCredentials(newCredentials);
  };

  const handleDisconnect = () => {
    setCredentials({
      domain: '',
      email: '',
      apiToken: '',
      isConnected: false,
    });
    setProjects([]);
    setIssues([]);
  };

  const handleIssueUpdate = async (issueId: string, newStatus: string) => {
    // Simulate API call to update issue status
    console.log('Updating issue:', issueId, 'to status:', newStatus);
    
    setIssues(prev => prev.map(issue => 
      issue.id === issueId 
        ? { ...issue, status: { ...issue.status, category: newStatus as any } }
        : issue
    ));
  };

  const filteredIssues = issues.filter(issue => {
    const matchesSearch = searchTerm === '' || 
      issue.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.key.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || issue.status.category === statusFilter;
    const matchesProject = selectedProject === 'all-projects' || selectedProject === '' || issue.project.key === selectedProject;
    
    return matchesSearch && matchesStatus && matchesProject;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <ExternalLink className="w-8 h-8 text-blue-600 mr-3" />
                Jira Integration
              </h1>
              <p className="text-gray-600 mt-1">
                Connect and manage your Jira issues with real-time synchronization
              </p>
            </div>
            {credentials.isConnected && (
              <div className="flex items-center space-x-2">
                <Badge variant="outline" className="text-green-600 border-green-200">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
                <Button variant="outline">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </div>
            )}
          </div>
        </div>

        <Tabs defaultValue={credentials.isConnected ? "kanban" : "setup"} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="setup" className="flex items-center space-x-2">
              <Settings className="w-4 h-4" />
              <span>Setup</span>
            </TabsTrigger>
            <TabsTrigger value="kanban" className="flex items-center space-x-2" disabled={!credentials.isConnected}>
              <Activity className="w-4 h-4" />
              <span>Kanban Board</span>
            </TabsTrigger>
            <TabsTrigger value="issues" className="flex items-center space-x-2" disabled={!credentials.isConnected}>
              <CheckCircle className="w-4 h-4" />
              <span>Issues</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center space-x-2" disabled={!credentials.isConnected}>
              <Target className="w-4 h-4" />
              <span>Analytics</span>
            </TabsTrigger>
          </TabsList>

          {/* Setup Tab */}
          <TabsContent value="setup" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <JiraOAuthConfig
                credentials={credentials}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
              />
              
              {credentials.isConnected && (
                <Card>
                  <CardHeader>
                    <CardTitle>Integration Status</CardTitle>
                    <CardDescription>
                      Current status of your Jira integration
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {projects.length}
                        </div>
                        <div className="text-sm text-gray-600">Projects</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {issues.length}
                        </div>
                        <div className="text-sm text-gray-600">Issues</div>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Available Projects</h4>
                      {projects.map((project) => (
                        <div key={project.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div>
                            <span className="font-medium text-sm">{project.key}</span>
                            <span className="text-gray-600 text-sm ml-2">{project.name}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {project.projectTypeKey}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Kanban Board Tab */}
          <TabsContent value="kanban" className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                 <Select value={selectedProject} onValueChange={setSelectedProject}>
                   <SelectTrigger className="w-48">
                     <SelectValue placeholder="All Projects" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all-projects">All Projects</SelectItem>
                     {projects.map((project) => (
                       <SelectItem key={project.id} value={project.key}>
                         {project.key} - {project.name}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
                 
                 <div className="relative">
                   <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                   <Input
                    placeholder="Search issues..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sync
                </Button>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Issue
                </Button>
              </div>
            </div>
            
            <JiraKanbanBoard
              issues={filteredIssues}
              onIssueUpdate={handleIssueUpdate}
            />
          </TabsContent>

          {/* Issues Tab */}
          <TabsContent value="issues" className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="To Do">To Do</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Done">Done</SelectItem>
                  </SelectContent>
                </Select>
                
                 <Select value={selectedProject} onValueChange={setSelectedProject}>
                   <SelectTrigger className="w-48">
                     <SelectValue placeholder="All Projects" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all-projects">All Projects</SelectItem>
                     {projects.map((project) => (
                       <SelectItem key={project.id} value={project.key}>
                         {project.key} - {project.name}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
              
              <div className="flex items-center space-x-2">
                <Badge variant="outline">
                  {filteredIssues.length} issues
                </Badge>
                <Button variant="outline" size="sm">
                  <Filter className="w-4 h-4 mr-2" />
                  More Filters
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredIssues.map((issue) => (
                <DraggableIssueCard
                  key={issue.id}
                  issue={issue}
                  onEdit={(issue) => console.log('Edit issue:', issue)}
                  onView={(issue) => console.log('View issue:', issue)}
                />
              ))}
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <CheckCircle className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Total Issues</p>
                      <p className="text-2xl font-bold text-gray-900">{issues.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Clock className="w-6 h-6 text-orange-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">In Progress</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {issues.filter(i => i.status.category === 'In Progress').length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Completed</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {issues.filter(i => i.status.category === 'Done').length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <AlertTriangle className="w-6 h-6 text-red-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">High Priority</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {issues.filter(i => ['High', 'Highest', 'Critical'].includes(i.priority.name)).length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Issue Distribution by Project</CardTitle>
                <CardDescription>
                  Breakdown of issues across different projects
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {projects.map((project) => {
                    const projectIssues = issues.filter(i => i.project.key === project.key);
                    const percentage = (projectIssues.length / issues.length) * 100;
                    
                    return (
                      <div key={project.id}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{project.name} ({project.key})</span>
                          <span className="text-sm text-gray-600">{projectIssues.length} issues</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default JiraIntegration;