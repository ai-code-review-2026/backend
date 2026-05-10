'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  User, 
  Calendar,
  RefreshCw,
  Eye,
  MessageSquare,
  GitPullRequest,
  Activity,
  Bell,
  Settings,
  Filter,
  Search,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Pause,
  Play,
  FastForward,
  RotateCcw,
  Zap,
  FileText,
  Code,
  Users,
  Target,
  Timer,
  CheckSquare,
  XCircle,
  AlertCircle,
  Info
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// Types
interface ReviewEvent {
  id: string;
  type: 'created' | 'approved' | 'rejected' | 'commented' | 'updated' | 'merged' | 'closed';
  timestamp: Date;
  author: {
    name: string;
    avatar: string;
    role: string;
  };
  description: string;
  metadata?: {
    pullRequestId?: string;
    commitHash?: string;
    comment?: string;
    changedFiles?: number;
    linesAdded?: number;
    linesDeleted?: number;
  };
}

interface Review {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-review' | 'approved' | 'rejected' | 'merged' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  author: {
    name: string;
    avatar: string;
    email: string;
  };
  assignees: Array<{
    name: string;
    avatar: string;
    email: string;
    status: 'assigned' | 'reviewing' | 'approved' | 'rejected';
  }>;
  repository: {
    name: string;
    branch: string;
  };
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
  completedAt?: Date;
  metrics: {
    changedFiles: number;
    linesAdded: number;
    linesDeleted: number;
    commits: number;
    comments: number;
  };
  events: ReviewEvent[];
}

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
  actionUrl?: string;
  reviewId?: string;
}

// Visual Timeline Component
const ReviewTimeline: React.FC<{
  events: ReviewEvent[];
  isRealTime?: boolean;
}> = ({ events, isRealTime = false }) => {
  const getEventIcon = (type: ReviewEvent['type']) => {
    switch (type) {
      case 'created':
        return <GitPullRequest className="w-4 h-4 text-blue-500" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'commented':
        return <MessageSquare className="w-4 h-4 text-purple-500" />;
      case 'updated':
        return <RefreshCw className="w-4 h-4 text-orange-500" />;
      case 'merged':
        return <CheckSquare className="w-4 h-4 text-green-600" />;
      case 'closed':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getEventColor = (type: ReviewEvent['type']) => {
    switch (type) {
      case 'created':
        return 'border-blue-200 bg-blue-50';
      case 'approved':
        return 'border-green-200 bg-green-50';
      case 'rejected':
        return 'border-red-200 bg-red-50';
      case 'commented':
        return 'border-purple-200 bg-purple-50';
      case 'updated':
        return 'border-orange-200 bg-orange-50';
      case 'merged':
        return 'border-green-200 bg-green-50';
      case 'closed':
        return 'border-gray-200 bg-gray-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  return (
    <div className="relative">
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>
      <div className="space-y-6">
        {events.map((event, index) => (
          <div key={event.id} className="relative flex items-start space-x-4">
            <div className={`
              flex items-center justify-center w-12 h-12 rounded-full border-2 ${getEventColor(event.type)}
              ${isRealTime && index === 0 ? 'animate-pulse ring-4 ring-blue-200' : ''}
            `}>
              {getEventIcon(event.type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <img
                  src={event.author.avatar}
                  alt={event.author.name}
                  className="w-6 h-6 rounded-full"
                />
                <span className="text-sm font-medium text-gray-900">
                  {event.author.name}
                </span>
                <Badge variant="outline" className="text-xs">
                  {event.author.role}
                </Badge>
                <span className="text-xs text-gray-500">
                  {event.timestamp.toLocaleString()}
                </span>
              </div>
              
              <p className="mt-1 text-sm text-gray-700">
                {event.description}
              </p>
              
              {event.metadata && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {event.metadata.changedFiles && (
                    <Badge variant="outline" className="text-xs">
                      <FileText className="w-3 h-3 mr-1" />
                      {event.metadata.changedFiles} files
                    </Badge>
                  )}
                  {event.metadata.linesAdded && (
                    <Badge variant="outline" className="text-xs text-green-600">
                      +{event.metadata.linesAdded}
                    </Badge>
                  )}
                  {event.metadata.linesDeleted && (
                    <Badge variant="outline" className="text-xs text-red-600">
                      -{event.metadata.linesDeleted}
                    </Badge>
                  )}
                  {event.metadata.commitHash && (
                    <Badge variant="outline" className="text-xs font-mono">
                      <Code className="w-3 h-3 mr-1" />
                      {event.metadata.commitHash.substring(0, 7)}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Real-time Notifications Component
const NotificationPanel: React.FC<{
  notifications: Notification[];
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
}> = ({ notifications, onMarkAsRead, onMarkAllAsRead }) => {
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center text-lg">
            <Bell className="w-5 h-5 mr-2 text-blue-600" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unreadCount}
              </Badge>
            )}
          </CardTitle>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={onMarkAllAsRead}>
              Mark all as read
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No notifications
            </p>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                  notification.isRead
                    ? 'bg-gray-50 border-gray-200'
                    : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                }`}
                onClick={() => !notification.isRead && onMarkAsRead(notification.id)}
              >
                <div className="flex items-start space-x-3">
                  {getNotificationIcon(notification.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-medium text-gray-900">
                        {notification.title}
                      </h4>
                      {!notification.isRead && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {notification.message}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {notification.timestamp.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Review Status Card Component
const ReviewStatusCard: React.FC<{
  review: Review;
  onViewDetails: (review: Review) => void;
}> = ({ review, onViewDetails }) => {
  const getStatusColor = (status: Review['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'in-review':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'merged':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'closed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityColor = (priority: Review['priority']) => {
    switch (priority) {
      case 'critical':
        return 'border-l-red-500';
      case 'high':
        return 'border-l-orange-500';
      case 'medium':
        return 'border-l-blue-500';
      default:
        return 'border-l-gray-400';
    }
  };

  const approvedCount = review.assignees.filter(a => a.status === 'approved').length;
  const totalAssignees = review.assignees.length;
  const progressPercentage = totalAssignees > 0 ? (approvedCount / totalAssignees) * 100 : 0;

  return (
    <Card className={`hover:shadow-md transition-shadow cursor-pointer border-l-4 ${getPriorityColor(review.priority)}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-2">
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {review.title}
              </h3>
              <Badge className={`text-xs ${getStatusColor(review.status)}`} variant="outline">
                {review.status.replace('-', ' ')}
              </Badge>
            </div>
            <p className="text-xs text-gray-600 line-clamp-2">
              {review.description}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewDetails(review)}
            className="p-1 ml-2"
          >
            <Eye className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <img
              src={review.author.avatar}
              alt={review.author.name}
              className="w-6 h-6 rounded-full"
            />
            <span className="text-xs text-gray-600">
              {review.author.name} • {review.repository.name}
            </span>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">Review Progress</span>
              <span className="font-medium">{approvedCount}/{totalAssignees} approved</span>
            </div>
            <Progress value={progressPercentage} className="h-1.5" />
          </div>
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Updated: {review.updatedAt.toLocaleDateString()}</span>
            <div className="flex items-center space-x-3">
              <span className="flex items-center">
                <FileText className="w-3 h-3 mr-1" />
                {review.metrics.changedFiles}
              </span>
              <span className="flex items-center">
                <MessageSquare className="w-3 h-3 mr-1" />
                {review.metrics.comments}
              </span>
            </div>
          </div>
          
          {review.assignees.length > 0 && (
            <div className="flex items-center space-x-1">
              <span className="text-xs text-gray-600 mr-2">Assignees:</span>
              <div className="flex -space-x-1">
                {review.assignees.slice(0, 3).map((assignee, index) => (
                  <img
                    key={index}
                    src={assignee.avatar}
                    alt={assignee.name}
                    className="w-5 h-5 rounded-full border-2 border-white"
                    title={`${assignee.name} (${assignee.status})`}
                  />
                ))}
                {review.assignees.length > 3 && (
                  <div className="w-5 h-5 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center">
                    <span className="text-xs font-medium text-gray-600">
                      +{review.assignees.length - 3}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Main Review Status Component
const ReviewStatusDashboard: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Mock data initialization
  useEffect(() => {
    const mockReviews: Review[] = [
      {
        id: '1',
        title: 'Add user authentication system',
        description: 'Implement JWT-based authentication with refresh tokens and role-based access control',
        status: 'in-review',
        priority: 'high',
        author: {
          name: 'John Doe',
          avatar: 'https://via.placeholder.com/32',
          email: 'john@example.com'
        },
        assignees: [
          {
            name: 'Alice Smith',
            avatar: 'https://via.placeholder.com/32',
            email: 'alice@example.com',
            status: 'approved'
          },
          {
            name: 'Bob Johnson',
            avatar: 'https://via.placeholder.com/32',
            email: 'bob@example.com',
            status: 'reviewing'
          }
        ],
        repository: {
          name: 'auth-service',
          branch: 'feature/jwt-auth'
        },
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 30 * 60 * 1000),
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        metrics: {
          changedFiles: 12,
          linesAdded: 456,
          linesDeleted: 123,
          commits: 8,
          comments: 15
        },
        events: [
          {
            id: '1',
            type: 'created',
            timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            author: {
              name: 'John Doe',
              avatar: 'https://via.placeholder.com/32',
              role: 'Developer'
            },
            description: 'Created pull request for authentication system implementation',
            metadata: {
              pullRequestId: 'PR-123',
              commitHash: 'abc123def',
              changedFiles: 12,
              linesAdded: 456,
              linesDeleted: 123
            }
          },
          {
            id: '2',
            type: 'commented',
            timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
            author: {
              name: 'Alice Smith',
              avatar: 'https://via.placeholder.com/32',
              role: 'Senior Developer'
            },
            description: 'Added comments on security best practices implementation',
            metadata: {
              comment: 'Consider using bcrypt for password hashing'
            }
          },
          {
            id: '3',
            type: 'approved',
            timestamp: new Date(Date.now() - 30 * 60 * 1000),
            author: {
              name: 'Alice Smith',
              avatar: 'https://via.placeholder.com/32',
              role: 'Senior Developer'
            },
            description: 'Approved the pull request after security improvements'
          }
        ]
      },
      {
        id: '2',
        title: 'Fix database connection pool issues',
        description: 'Resolve connection pool exhaustion under high load',
        status: 'approved',
        priority: 'critical',
        author: {
          name: 'Sarah Wilson',
          avatar: 'https://via.placeholder.com/32',
          email: 'sarah@example.com'
        },
        assignees: [
          {
            name: 'Mike Chen',
            avatar: 'https://via.placeholder.com/32',
            email: 'mike@example.com',
            status: 'approved'
          }
        ],
        repository: {
          name: 'api-gateway',
          branch: 'fix/db-pool-exhaustion'
        },
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 15 * 60 * 1000),
        completedAt: new Date(Date.now() - 15 * 60 * 1000),
        metrics: {
          changedFiles: 3,
          linesAdded: 87,
          linesDeleted: 45,
          commits: 2,
          comments: 8
        },
        events: [
          {
            id: '4',
            type: 'created',
            timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
            author: {
              name: 'Sarah Wilson',
              avatar: 'https://via.placeholder.com/32',
              role: 'DevOps Engineer'
            },
            description: 'Created hotfix for database connection pool issues',
            metadata: {
              pullRequestId: 'PR-124',
              commitHash: 'def456ghi',
              changedFiles: 3,
              linesAdded: 87,
              linesDeleted: 45
            }
          },
          {
            id: '5',
            type: 'approved',
            timestamp: new Date(Date.now() - 15 * 60 * 1000),
            author: {
              name: 'Mike Chen',
              avatar: 'https://via.placeholder.com/32',
              role: 'Lead Developer'
            },
            description: 'Approved critical database fix for immediate deployment'
          }
        ]
      }
    ];

    const mockNotifications: Notification[] = [
      {
        id: '1',
        type: 'success',
        title: 'Review Approved',
        message: 'Your pull request "Fix database connection pool issues" has been approved by Mike Chen',
        timestamp: new Date(Date.now() - 15 * 60 * 1000),
        isRead: false,
        reviewId: '2'
      },
      {
        id: '2',
        type: 'info',
        title: 'New Comment',
        message: 'Alice Smith commented on your pull request "Add user authentication system"',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        isRead: false,
        reviewId: '1'
      },
      {
        id: '3',
        type: 'warning',
        title: 'Review Overdue',
        message: 'Pull request "API rate limiting implementation" is overdue for review',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
        isRead: true
      }
    ];

    setReviews(mockReviews);
    setNotifications(mockNotifications);
  }, []);

  // Real-time updates simulation
  useEffect(() => {
    if (!isRealTimeEnabled) return;

    const interval = setInterval(() => {
      const now = new Date();
      setLastUpdate(now);

      // Simulate random notifications
      if (Math.random() < 0.3) {
        const newNotification: Notification = {
          id: `notif-${Date.now()}`,
          type: ['info', 'success', 'warning'][Math.floor(Math.random() * 3)] as any,
          title: 'Real-time Update',
          message: `System update received at ${now.toLocaleTimeString()}`,
          timestamp: now,
          isRead: false
        };
        
        setNotifications(prev => [newNotification, ...prev.slice(0, 9)]);
      }
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [isRealTimeEnabled]);

  const handleMarkAsRead = (notificationId: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === notificationId ? { ...n, isRead: true } : n
    ));
  };

  const handleMarkAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleViewReviewDetails = (review: Review) => {
    setSelectedReview(review);
  };

  const filteredReviews = reviews.filter(review => {
    const matchesSearch = searchTerm === '' || 
      review.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      review.author.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || review.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || review.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  // Analytics data
  const statusCounts = reviews.reduce((acc, review) => {
    acc[review.status] = (acc[review.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const chartData = [
    { name: 'Pending', value: statusCounts.pending || 0, color: '#facc15' },
    { name: 'In Review', value: statusCounts['in-review'] || 0, color: '#3b82f6' },
    { name: 'Approved', value: statusCounts.approved || 0, color: '#10b981' },
    { name: 'Rejected', value: statusCounts.rejected || 0, color: '#ef4444' },
    { name: 'Merged', value: statusCounts.merged || 0, color: '#8b5cf6' },
    { name: 'Closed', value: statusCounts.closed || 0, color: '#6b7280' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Activity className="w-8 h-8 text-blue-600 mr-3" />
                Review Status Center
              </h1>
              <p className="text-gray-600 mt-1">
                Monitor code review progress with real-time updates and visual timeline
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="text-blue-600 border-blue-200">
                <Clock className="w-3 h-3 mr-1" />
                Last updated: {lastUpdate.toLocaleTimeString()}
              </Badge>
              <Button
                variant="outline"
                onClick={() => setIsRealTimeEnabled(!isRealTimeEnabled)}
                className={isRealTimeEnabled ? 'bg-green-50 border-green-200' : ''}
              >
                {isRealTimeEnabled ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                Real-time: {isRealTimeEnabled ? 'On' : 'Off'}
              </Button>
              <Button variant="outline">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard" className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4" />
              <span>Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center space-x-2">
              <Clock className="w-4 h-4" />
              <span>Timeline</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center space-x-2">
              <Bell className="w-4 h-4" />
              <span>Notifications</span>
              {notifications.filter(n => !n.isRead).length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {notifications.filter(n => !n.isRead).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4" />
              <span>Analytics</span>
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Filters */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search reviews..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in-review">In Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="merged">Merged</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              
              <Badge variant="outline">
                {filteredReviews.length} reviews
              </Badge>
            </div>

            {/* Review Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredReviews.map((review) => (
                <ReviewStatusCard
                  key={review.id}
                  review={review}
                  onViewDetails={handleViewReviewDetails}
                />
              ))}
            </div>

            {filteredReviews.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No reviews found</h3>
                <p className="text-gray-500">Try adjusting your filters or search terms</p>
              </div>
            )}
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-6">
            {selectedReview ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center">
                          <Clock className="w-5 h-5 mr-2 text-blue-600" />
                          Review Timeline - {selectedReview.title}
                        </CardTitle>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedReview(null)}
                        >
                          Back to List
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ReviewTimeline
                        events={selectedReview.events}
                        isRealTime={isRealTimeEnabled}
                      />
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Review Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div>
                        <span className="font-medium text-gray-600">Author:</span>
                        <span className="ml-2">{selectedReview.author.name}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Repository:</span>
                        <span className="ml-2">{selectedReview.repository.name}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Branch:</span>
                        <span className="ml-2 font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                          {selectedReview.repository.branch}
                        </span>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>Files: {selectedReview.metrics.changedFiles}</div>
                        <div>Commits: {selectedReview.metrics.commits}</div>
                        <div className="text-green-600">+{selectedReview.metrics.linesAdded}</div>
                        <div className="text-red-600">-{selectedReview.metrics.linesDeleted}</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Assignees</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedReview.assignees.map((assignee, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <img
                            src={assignee.avatar}
                            alt={assignee.name}
                            className="w-6 h-6 rounded-full"
                          />
                          <span className="text-sm flex-1">{assignee.name}</span>
                          <Badge
                            variant={assignee.status === 'approved' ? 'default' : 'outline'}
                            className="text-xs"
                          >
                            {assignee.status}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a review</h3>
                <p className="text-gray-500 mb-4">
                  Choose a review from the dashboard to view its timeline
                </p>
                <Button onClick={() => window.history.back()}>
                  Go to Dashboard
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <NotificationPanel
              notifications={notifications}
              onMarkAsRead={handleMarkAsRead}
              onMarkAllAsRead={handleMarkAllAsRead}
            />
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Review Status Distribution</CardTitle>
                  <CardDescription>Current status breakdown of all reviews</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value, percent }) => 
                          `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                        }
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Review Metrics</CardTitle>
                  <CardDescription>Key performance indicators</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {reviews.length}
                      </div>
                      <div className="text-sm text-gray-600">Total Reviews</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {reviews.filter(r => r.status === 'approved' || r.status === 'merged').length}
                      </div>
                      <div className="text-sm text-gray-600">Completed</div>
                    </div>
                    <div className="text-center p-3 bg-orange-50 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">
                        {reviews.filter(r => r.status === 'in-review').length}
                      </div>
                      <div className="text-sm text-gray-600">In Review</div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">
                        {reviews.filter(r => r.dueDate && new Date() > r.dueDate && r.status !== 'merged' && r.status !== 'approved').length}
                      </div>
                      <div className="text-sm text-gray-600">Overdue</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Review Activity Summary</CardTitle>
                <CardDescription>Recent activity across all reviews</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reviews
                    .flatMap(review => review.events.map(event => ({ ...event, reviewTitle: review.title })))
                    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                    .slice(0, 10)
                    .map((event: any) => (
                      <div key={event.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                        <img
                          src={event.author.avatar}
                          alt={event.author.name}
                          className="w-8 h-8 rounded-full"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900">
                            <span className="font-medium">{event.author.name}</span>
                            {' '}
                            <span className="text-gray-600">{event.description}</span>
                          </p>
                          <p className="text-xs text-gray-500">
                            {event.reviewTitle} • {event.timestamp.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ReviewStatusDashboard;