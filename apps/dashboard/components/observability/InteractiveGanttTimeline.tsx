'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { 
  Calendar, 
  Clock, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  Play, 
  Pause, 
  RotateCcw,
  Filter,
  Download,
  Maximize2,
  Plus,
  Edit,
  Trash2
} from 'lucide-react';

interface GanttTask {
  id: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  progress: number;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked' | 'delayed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignee: string;
  dependencies: string[];
  category: 'review' | 'development' | 'testing' | 'deployment' | 'analysis';
}

interface TimelineProps {
  tasks: GanttTask[];
  viewMode: 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
}

const GanttTimeline: React.FC<TimelineProps> = ({ 
  tasks, 
  viewMode, 
  startDate, 
  endDate 
}) => {
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);

  // Calculate timeline dimensions and positions
  const timelineDuration = endDate.getTime() - startDate.getTime();
  const dayWidth = viewMode === 'day' ? 80 : viewMode === 'week' ? 40 : 20;
  
  const getTaskPosition = useCallback((task: GanttTask) => {
    const taskStart = task.startDate.getTime() - startDate.getTime();
    const taskDuration = task.endDate.getTime() - task.startDate.getTime();
    
    const left = (taskStart / timelineDuration) * 100;
    const width = (taskDuration / timelineDuration) * 100;
    
    return { left: `${left}%`, width: `${Math.max(width, 2)}%` };
  }, [startDate, timelineDuration]);

  const getStatusColor = (status: GanttTask['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'in-progress':
        return 'bg-blue-500';
      case 'blocked':
        return 'bg-red-500';
      case 'delayed':
        return 'bg-orange-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getPriorityColor = (priority: GanttTask['priority']) => {
    switch (priority) {
      case 'critical':
        return 'border-l-red-600';
      case 'high':
        return 'border-l-orange-500';
      case 'medium':
        return 'border-l-blue-500';
      default:
        return 'border-l-gray-400';
    }
  };

  // Generate time scale
  const generateTimeScale = useMemo(() => {
    const scale = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      scale.push(new Date(current));
      
      if (viewMode === 'day') {
        current.setDate(current.getDate() + 1);
      } else if (viewMode === 'week') {
        current.setDate(current.getDate() + 7);
      } else {
        current.setMonth(current.getMonth() + 1);
      }
    }
    
    return scale;
  }, [startDate, endDate, viewMode]);

  const handleTaskDragStart = (taskId: string) => {
    setDraggedTask(taskId);
  };

  const handleTaskDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // In a real implementation, this would calculate new dates based on drop position
    setDraggedTask(null);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Timeline Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Project Timeline</h3>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-xs">
              {tasks.length} tasks
            </Badge>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Time Scale */}
      <div className="relative border-b border-gray-200 bg-gray-50">
        <div className="flex items-center h-12 px-4">
          <div className="w-64 flex-shrink-0"></div>
          <div className="flex-1 relative">
            <div className="flex">
              {generateTimeScale.map((date, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 text-xs text-gray-600 text-center border-l border-gray-200 px-2 py-1"
                  style={{ width: `${dayWidth}px` }}
                >
                  {viewMode === 'day' && date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {viewMode === 'week' && `Week ${Math.ceil(date.getDate() / 7)}`}
                  {viewMode === 'month' && date.toLocaleDateString('en-US', { month: 'short' })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Task Rows */}
      <div className="relative">
        {tasks.map((task, index) => {
          const position = getTaskPosition(task);
          const isSelected = selectedTask === task.id;
          const isDragged = draggedTask === task.id;

          return (
            <div
              key={task.id}
              className={`flex items-center border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                isSelected ? 'bg-blue-50 border-blue-200' : ''
              }`}
              style={{ height: '60px' }}
            >
              {/* Task Info Column */}
              <div className="w-64 flex-shrink-0 px-4 py-3 border-r border-gray-200">
                <div className="flex items-center space-x-2">
                  <div className={`w-1 h-8 rounded ${getPriorityColor(task.priority)}`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {task.title}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {task.assignee}
                    </div>
                  </div>
                  <Badge
                    variant={task.status === 'completed' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {task.status}
                  </Badge>
                </div>
              </div>

              {/* Timeline Column */}
              <div className="flex-1 relative px-4 py-3">
                <div className="relative h-6">
                  {/* Task Bar */}
                  <div
                    className={`absolute h-6 rounded-md cursor-pointer transition-all duration-200 hover:shadow-lg ${
                      getStatusColor(task.status)
                    } ${isDragged ? 'opacity-50 scale-105' : 'opacity-90 hover:opacity-100'} ${
                      isSelected ? 'ring-2 ring-blue-400' : ''
                    }`}
                    style={position}
                    draggable
                    onDragStart={() => handleTaskDragStart(task.id)}
                    onDrop={handleTaskDrop}
                    onClick={() => setSelectedTask(task.id === selectedTask ? null : task.id)}
                  >
                    {/* Progress Indicator */}
                    <div 
                      className="h-full bg-white bg-opacity-30 rounded-l-md transition-all duration-300"
                      style={{ width: `${task.progress}%` }}
                    ></div>
                    
                    {/* Task Title Overlay */}
                    <div className="absolute inset-0 flex items-center px-2 text-white text-xs font-medium truncate">
                      {task.title}
                    </div>
                  </div>

                  {/* Dependencies Lines */}
                  {task.dependencies.map((depId) => {
                    const dependencyTask = tasks.find(t => t.id === depId);
                    if (!dependencyTask) return null;

                    return (
                      <svg
                        key={depId}
                        className="absolute inset-0 pointer-events-none"
                        style={{ zIndex: -1 }}
                      >
                        <line
                          x1="0"
                          y1="12"
                          x2="20"
                          y2="12"
                          stroke="#64748b"
                          strokeWidth="2"
                          strokeDasharray="4 4"
                        />
                      </svg>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Details Panel */}
      {selectedTask && (
        <div className="border-t border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900">Task Details</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedTask(null)}
            >
              ✕
            </Button>
          </div>
          {(() => {
            const task = tasks.find(t => t.id === selectedTask);
            if (!task) return null;

            return (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Status:</span>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {task.status}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Progress:</span>
                  <span className="ml-2">{task.progress}%</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Priority:</span>
                  <Badge
                    variant={task.priority === 'critical' ? 'destructive' : 'outline'}
                    className="ml-2 text-xs"
                  >
                    {task.priority}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Start:</span>
                  <span className="ml-2">{task.startDate.toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">End:</span>
                  <span className="ml-2">{task.endDate.toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Assignee:</span>
                  <span className="ml-2">{task.assignee}</span>
                </div>
                {task.description && (
                  <div className="col-span-3">
                    <span className="font-medium text-gray-600">Description:</span>
                    <p className="ml-2 text-gray-800">{task.description}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

// Main Interactive Gantt Component
const InteractiveGanttTimeline: React.FC = () => {
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Sample tasks data
  const [tasks] = useState<GanttTask[]>([
    {
      id: '1',
      title: 'Code Review: Authentication Module',
      description: 'Review security implementation for user authentication',
      startDate: new Date(2026, 3, 15),
      endDate: new Date(2026, 3, 18),
      progress: 75,
      status: 'in-progress',
      priority: 'high',
      assignee: 'John Doe',
      dependencies: [],
      category: 'review'
    },
    {
      id: '2',
      title: 'API Testing Framework Setup',
      description: 'Set up comprehensive testing framework for REST APIs',
      startDate: new Date(2026, 3, 16),
      endDate: new Date(2026, 3, 22),
      progress: 30,
      status: 'in-progress',
      priority: 'medium',
      assignee: 'Jane Smith',
      dependencies: ['1'],
      category: 'testing'
    },
    {
      id: '3',
      title: 'Database Migration Script',
      description: 'Create migration scripts for schema updates',
      startDate: new Date(2026, 3, 17),
      endDate: new Date(2026, 3, 19),
      progress: 100,
      status: 'completed',
      priority: 'critical',
      assignee: 'Mike Johnson',
      dependencies: [],
      category: 'development'
    },
    {
      id: '4',
      title: 'Performance Analysis',
      description: 'Analyze application performance bottlenecks',
      startDate: new Date(2026, 3, 20),
      endDate: new Date(2026, 3, 25),
      progress: 0,
      status: 'pending',
      priority: 'medium',
      assignee: 'Sarah Wilson',
      dependencies: ['2'],
      category: 'analysis'
    },
    {
      id: '5',
      title: 'Production Deployment',
      description: 'Deploy latest version to production environment',
      startDate: new Date(2026, 3, 26),
      endDate: new Date(2026, 3, 28),
      progress: 0,
      status: 'pending',
      priority: 'critical',
      assignee: 'DevOps Team',
      dependencies: ['3', '4'],
      category: 'deployment'
    }
  ]);

  // Filter tasks based on search and filters
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = searchTerm === '' || 
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.assignee.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
      const matchesCategory = filterCategory === 'all' || task.category === filterCategory;
      
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [tasks, searchTerm, filterStatus, filterCategory]);

  // Calculate timeline bounds
  const timelineBounds = useMemo(() => {
    if (tasks.length === 0) return { start: new Date(), end: new Date() };
    
    const dates = tasks.flatMap(task => [task.startDate, task.endDate]);
    const start = new Date(Math.min(...dates.map(d => d.getTime())));
    const end = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Add some padding
    start.setDate(start.getDate() - 2);
    end.setDate(end.getDate() + 2);
    
    return { start, end };
  }, [tasks]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Interactive Gantt Timeline</h1>
            <p className="text-gray-600 mt-1">Visualize and manage project timelines with drag-and-drop functionality</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
            <Button variant="outline" size="sm">
              <Calendar className="w-4 h-4 mr-2" />
              Today
            </Button>
            <Button variant="outline" size="sm">
              <Maximize2 className="w-4 h-4 mr-2" />
              Fullscreen
            </Button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">View:</label>
            <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Category:</label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="development">Development</SelectItem>
                <SelectItem value="testing">Testing</SelectItem>
                <SelectItem value="deployment">Deployment</SelectItem>
                <SelectItem value="analysis">Analysis</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 max-w-sm">
            <Input
              placeholder="Search tasks or assignees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Timeline Container */}
      <div className="flex-1 overflow-hidden">
        <GanttTimeline
          tasks={filteredTasks}
          viewMode={viewMode}
          startDate={timelineBounds.start}
          endDate={timelineBounds.end}
        />
      </div>

      {/* Status Bar */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center space-x-6">
            <span>Showing {filteredTasks.length} of {tasks.length} tasks</span>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-green-500 rounded"></div>
                <span>Completed: {filteredTasks.filter(t => t.status === 'completed').length}</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span>In Progress: {filteredTasks.filter(t => t.status === 'in-progress').length}</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-gray-400 rounded"></div>
                <span>Pending: {filteredTasks.filter(t => t.status === 'pending').length}</span>
              </div>
            </div>
          </div>
          <div>
            Timeline: {timelineBounds.start.toLocaleDateString()} - {timelineBounds.end.toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InteractiveGanttTimeline;