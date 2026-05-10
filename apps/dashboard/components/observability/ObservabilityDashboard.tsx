'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Settings, 
  Activity, 
  BarChart3, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp,
  Database,
  Server,
  Cpu,
  HardDrive,
  Network,
  Eye,
  Move,
  Trash2,
  Edit3,
  Maximize2,
  RotateCcw
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// Widget Types
interface Widget {
  id: string;
  type: 'metric' | 'chart' | 'status' | 'log' | 'gantt' | 'performance';
  title: string;
  description?: string;
  config: any;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

// Draggable Widget Component
const DraggableWidget: React.FC<{
  widget: Widget;
  onDelete: (id: string) => void;
  onEdit: (widget: Widget) => void;
}> = ({ widget, onDelete, onEdit }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const renderWidgetContent = () => {
    switch (widget.type) {
      case 'metric':
        return (
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {widget.config.value || '0'}
            </div>
            <div className="text-sm text-gray-600">
              {widget.config.unit || ''}
            </div>
            <Progress 
              value={widget.config.progress || 0} 
              className="mt-2"
            />
          </div>
        );

      case 'chart':
        const chartData = widget.config.data || [];
        return (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#8884d8" 
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'status':
        return (
          <div className="space-y-2">
            {(widget.config.services || []).map((service: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm">{service.name}</span>
                <Badge variant={service.status === 'healthy' ? 'default' : 'destructive'}>
                  {service.status === 'healthy' ? (
                    <CheckCircle className="w-3 h-3 mr-1" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 mr-1" />
                  )}
                  {service.status}
                </Badge>
              </div>
            ))}
          </div>
        );

      case 'performance':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <Cpu className="w-6 h-6 mx-auto text-blue-500 mb-1" />
                <div className="text-lg font-bold">{widget.config.cpu || '0'}%</div>
                <div className="text-xs text-gray-600">CPU</div>
              </div>
              <div className="text-center">
                <HardDrive className="w-6 h-6 mx-auto text-green-500 mb-1" />
                <div className="text-lg font-bold">{widget.config.memory || '0'}%</div>
                <div className="text-xs text-gray-600">Memory</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <Database className="w-6 h-6 mx-auto text-purple-500 mb-1" />
                <div className="text-lg font-bold">{widget.config.disk || '0'}%</div>
                <div className="text-xs text-gray-600">Disk</div>
              </div>
              <div className="text-center">
                <Network className="w-6 h-6 mx-auto text-orange-500 mb-1" />
                <div className="text-lg font-bold">{widget.config.network || '0'} MB/s</div>
                <div className="text-xs text-gray-600">Network</div>
              </div>
            </div>
          </div>
        );

      default:
        return <div className="text-gray-500">Unknown widget type</div>;
    }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className={`relative group transition-all duration-200 hover:shadow-lg ${isDragging ? 'ring-2 ring-blue-500' : ''}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div 
                {...listeners}
                className="cursor-move p-1 rounded hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Move className="w-4 h-4 text-gray-400" />
              </div>
              <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
            </div>
            <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(widget)}
                className="p-1"
              >
                <Edit3 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(widget.id)}
                className="p-1 text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {widget.description && (
            <CardDescription className="text-xs">{widget.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {renderWidgetContent()}
        </CardContent>
      </Card>
    </div>
  );
};

// Widget Palette Component
const WidgetPalette: React.FC<{
  onAddWidget: (type: Widget['type']) => void;
}> = ({ onAddWidget }) => {
  const widgetTypes = [
    { type: 'metric' as const, icon: BarChart3, label: 'Metric', description: 'Display key metrics' },
    { type: 'chart' as const, icon: TrendingUp, label: 'Chart', description: 'Line/bar charts' },
    { type: 'status' as const, icon: Activity, label: 'Status', description: 'Service status' },
    { type: 'performance' as const, icon: Server, label: 'Performance', description: 'System metrics' },
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Available Widgets</h3>
      {widgetTypes.map((widgetType) => {
        const Icon = widgetType.icon;
        return (
          <Button
            key={widgetType.type}
            variant="outline"
            className="w-full justify-start text-left h-auto p-3"
            onClick={() => onAddWidget(widgetType.type)}
          >
            <div className="flex items-center space-x-3">
              <Icon className="w-5 h-5 text-blue-500" />
              <div>
                <div className="text-sm font-medium">{widgetType.label}</div>
                <div className="text-xs text-gray-500">{widgetType.description}</div>
              </div>
            </div>
          </Button>
        );
      })}
    </div>
  );
};

// Main Observability Dashboard Component
const ObservabilityDashboard: React.FC = () => {
  const [widgets, setWidgets] = useState<Widget[]>([
    {
      id: '1',
      type: 'metric',
      title: 'Active Reviews',
      description: 'Currently active code reviews',
      config: { value: 24, unit: 'reviews', progress: 75 },
      position: { x: 0, y: 0 },
      size: { width: 1, height: 1 }
    },
    {
      id: '2',
      type: 'chart',
      title: 'Review Velocity',
      description: 'Reviews completed over time',
      config: {
        data: [
          { name: 'Mon', value: 12 },
          { name: 'Tue', value: 19 },
          { name: 'Wed', value: 15 },
          { name: 'Thu', value: 25 },
          { name: 'Fri', value: 22 },
          { name: 'Sat', value: 8 },
          { name: 'Sun', value: 5 },
        ]
      },
      position: { x: 1, y: 0 },
      size: { width: 2, height: 1 }
    },
    {
      id: '3',
      type: 'status',
      title: 'System Status',
      description: 'Service health monitoring',
      config: {
        services: [
          { name: 'API Server', status: 'healthy' },
          { name: 'Database', status: 'healthy' },
          { name: 'Redis Cache', status: 'warning' },
          { name: 'Background Jobs', status: 'healthy' }
        ]
      },
      position: { x: 3, y: 0 },
      size: { width: 1, height: 1 }
    },
    {
      id: '4',
      type: 'performance',
      title: 'System Performance',
      description: 'Real-time performance metrics',
      config: {
        cpu: 45,
        memory: 68,
        disk: 32,
        network: 125
      },
      position: { x: 0, y: 1 },
      size: { width: 1, height: 1 }
    }
  ]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setWidgets((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over?.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }

    setActiveId(null);
  }, []);

  const handleAddWidget = useCallback((type: Widget['type']) => {
    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      type,
      title: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      description: `Description for ${type}`,
      config: getDefaultConfig(type),
      position: { x: 0, y: widgets.length },
      size: { width: 1, height: 1 }
    };

    setWidgets(prev => [...prev, newWidget]);
    setShowPalette(false);
  }, [widgets.length]);

  const handleDeleteWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(widget => widget.id !== id));
  }, []);

  const handleEditWidget = useCallback((widget: Widget) => {
    // For now, just log - in a real implementation, this would open an edit modal
    console.log('Edit widget:', widget);
  }, []);

  const getDefaultConfig = (type: Widget['type']) => {
    switch (type) {
      case 'metric':
        return { value: 0, unit: 'items', progress: 0 };
      case 'chart':
        return { data: [] };
      case 'status':
        return { services: [] };
      case 'performance':
        return { cpu: 0, memory: 0, disk: 0, network: 0 };
      default:
        return {};
    }
  };

  return (
    <div className="h-full flex bg-gray-50">
      {/* Main Dashboard Area */}
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Observability Dashboard</h1>
            <p className="text-gray-600 mt-1">Monitor and visualize your system metrics in real-time</p>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowPalette(!showPalette)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Widget
            </Button>
            <Button variant="outline">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
            <Button variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset Layout
            </Button>
          </div>
        </div>

        {/* Drag and Drop Context */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={widgets.map(w => w.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-4 gap-6 auto-rows-min">
              {widgets.map((widget) => (
                <DraggableWidget
                  key={widget.id}
                  widget={widget}
                  onDelete={handleDeleteWidget}
                  onEdit={handleEditWidget}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Empty State */}
        {widgets.length === 0 && (
          <div className="text-center py-12">
            <Eye className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No widgets configured</h3>
            <p className="text-gray-500 mb-4">Add widgets to start monitoring your system</p>
            <Button onClick={() => setShowPalette(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Widget
            </Button>
          </div>
        )}
      </div>

      {/* Widget Palette Sidebar */}
      {showPalette && (
        <div className="w-80 bg-white border-l border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Widget Palette</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPalette(false)}
            >
              ✕
            </Button>
          </div>
          <WidgetPalette onAddWidget={handleAddWidget} />
        </div>
      )}
    </div>
  );
};

export default ObservabilityDashboard;