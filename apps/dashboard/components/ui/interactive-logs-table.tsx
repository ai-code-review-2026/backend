'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from './badge';
import { Button } from './button';
import { Input } from './input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from './dropdown-menu';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Copy,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Settings2,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success';

export interface LogEntry {
  id: string;
  timestamp: string | Date;
  level: LogLevel;
  message: string;
  source?: string;
  details?: string | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface LogsTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (value: unknown, row: LogEntry) => React.ReactNode;
}

export interface InteractiveLogsTableProps {
  logs: LogEntry[];
  columns?: LogsTableColumn[];
  title?: string;
  description?: string;
  loading?: boolean;
  pageSize?: number;
  searchable?: boolean;
  filterable?: boolean;
  exportable?: boolean;
  refreshable?: boolean;
  onRefresh?: () => void;
  onExport?: (logs: LogEntry[]) => void;
  onRowClick?: (log: LogEntry) => void;
  onRowAction?: (action: string, log: LogEntry) => void;
  className?: string;
  emptyMessage?: string;
  rowActions?: RowAction[];
}

export interface RowAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatTimestamp(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getLevelConfig(level: LogLevel) {
  const configs: Record<LogLevel, { icon: React.ReactNode; className: string; bgClass: string }> = {
    error: {
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      className: 'bg-red-500/10 text-red-400 border-red-500/20',
      bgClass: 'bg-red-500/5',
    },
    warn: {
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      bgClass: 'bg-yellow-500/5',
    },
    info: {
      icon: <Info className="h-3.5 w-3.5" />,
      className: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      bgClass: 'bg-blue-500/5',
    },
    debug: {
      icon: <Settings2 className="h-3.5 w-3.5" />,
      className: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
      bgClass: 'bg-gray-500/5',
    },
    success: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      className: 'bg-green-500/10 text-green-400 border-green-500/20',
      bgClass: 'bg-green-500/5',
    },
  };
  return configs[level] || configs.info;
}

// ============================================================================
// DEFAULT COLUMNS
// ============================================================================

const defaultColumns: LogsTableColumn[] = [
  {
    key: 'timestamp',
    label: 'Timestamp',
    sortable: true,
    width: '160px',
    render: (value) => (
      <div className="flex items-center gap-2 text-gray-400">
        <Clock className="h-3.5 w-3.5 text-gray-500" />
        <span className="font-mono text-xs">{formatTimestamp(value as string)}</span>
      </div>
    ),
  },
  {
    key: 'level',
    label: 'Level',
    sortable: true,
    width: '100px',
    render: (value) => {
      const config = getLevelConfig(value as LogLevel);
      return (
        <Badge className={cn('gap-1 font-medium', config.className)}>
          {config.icon}
          {String(value).toUpperCase()}
        </Badge>
      );
    },
  },
  {
    key: 'source',
    label: 'Source',
    sortable: true,
    width: '120px',
    render: (value) => (
      <span className="text-xs font-mono text-gray-500 bg-gray-500/10 px-2 py-0.5 rounded">
        {value ? String(value) : '-'}
      </span>
    ),
  },
  {
    key: 'message',
    label: 'Message',
    sortable: false,
    render: (value) => (
      <span className="text-sm text-gray-200 line-clamp-2">{String(value)}</span>
    ),
  },
];

const defaultRowActions: RowAction[] = [
  { key: 'view', label: 'View Details', icon: <Eye className="h-4 w-4" /> },
  { key: 'copy', label: 'Copy Log', icon: <Copy className="h-4 w-4" /> },
  { key: 'delete', label: 'Delete', icon: <Trash2 className="h-4 w-4" />, destructive: true },
];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function LogLevelFilter({
  selectedLevels,
  onChange,
}: {
  selectedLevels: LogLevel[];
  onChange: (levels: LogLevel[]) => void;
}) {
  const levels: LogLevel[] = ['error', 'warn', 'info', 'debug', 'success'];

  const toggleLevel = (level: LogLevel) => {
    if (selectedLevels.includes(level)) {
      onChange(selectedLevels.filter((l) => l !== level));
    } else {
      onChange([...selectedLevels, level]);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-white/5 border-white/10 hover:bg-white/10">
          <Filter className="h-4 w-4" />
          Filter
          {selectedLevels.length > 0 && selectedLevels.length < levels.length && (
            <Badge className="ml-1 bg-blue-500/20 text-blue-400 text-xs">
              {selectedLevels.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-gray-900 border-white/10">
        {levels.map((level) => {
          const config = getLevelConfig(level);
          return (
            <DropdownMenuCheckboxItem
              key={level}
              checked={selectedLevels.includes(level)}
              onCheckedChange={() => toggleLevel(level)}
              className="gap-2"
            >
              <span className={cn('flex items-center gap-2', config.className.split(' ')[1])}>
                {config.icon}
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </span>
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem onClick={() => onChange(levels)} className="text-gray-400">
          Select All
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange([])} className="text-gray-400">
          Clear All
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowActionsMenu({
  log,
  actions,
  onAction,
}: {
  log: LogEntry;
  actions: RowAction[];
  onAction?: (action: string, log: LogEntry) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-white/10">
          <MoreHorizontal className="h-4 w-4 text-gray-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-gray-900 border-white/10">
        {actions.map((action, idx) => (
          <React.Fragment key={action.key}>
            {action.destructive && idx > 0 && <DropdownMenuSeparator className="bg-white/10" />}
            <DropdownMenuItem
              onClick={() => onAction?.(action.key, log)}
              className={cn(
                'gap-2',
                action.destructive && 'text-red-400 focus:text-red-400 focus:bg-red-500/10'
              )}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function InteractiveLogsTable({
  logs,
  columns = defaultColumns,
  title = 'System Logs',
  description,
  loading = false,
  pageSize = 10,
  searchable = true,
  filterable = true,
  exportable = true,
  refreshable = true,
  onRefresh,
  onExport,
  onRowClick,
  onRowAction,
  className,
  emptyMessage = 'No logs available',
  rowActions = defaultRowActions,
}: InteractiveLogsTableProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<LogLevel[]>(['error', 'warn', 'info', 'debug', 'success']);
  const [sortColumn, setSortColumn] = useState<string | null>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Filtered and sorted logs
  const processedLogs = useMemo(() => {
    let result = [...logs];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (log) =>
          log.message.toLowerCase().includes(query) ||
          log.source?.toLowerCase().includes(query) ||
          (typeof log.details === 'string' && log.details.toLowerCase().includes(query))
      );
    }

    // Filter by level
    if (selectedLevels.length > 0 && selectedLevels.length < 5) {
      result = result.filter((log) => selectedLevels.includes(log.level));
    }

    // Sort
    if (sortColumn && sortDirection) {
      result.sort((a, b) => {
        const aVal = a[sortColumn as keyof LogEntry];
        const bVal = b[sortColumn as keyof LogEntry];
        
        if (sortColumn === 'timestamp') {
          const aTime = new Date(aVal as string).getTime();
          const bTime = new Date(bVal as string).getTime();
          return sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
        }
        
        const aStr = String(aVal || '');
        const bStr = String(bVal || '');
        return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }

    return result;
  }, [logs, searchQuery, selectedLevels, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(processedLogs.length / pageSize);
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedLogs.slice(start, start + pageSize);
  }, [processedLogs, currentPage, pageSize]);

  // Handlers
  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc'));
      if (sortDirection === 'desc') setSortColumn(null);
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  const handleExport = useCallback(() => {
    if (onExport) {
      onExport(processedLogs);
    } else {
      // Default export as JSON
      const blob = new Blob([JSON.stringify(processedLogs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `logs-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }, [processedLogs, onExport]);

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-4 w-4 text-blue-400" />
    ) : sortDirection === 'desc' ? (
      <ChevronDown className="h-4 w-4 text-blue-400" />
    ) : null;
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {refreshable && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="gap-2 bg-white/5 border-white/10 hover:bg-white/10"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          )}
          {exportable && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="gap-2 bg-white/5 border-white/10 hover:bg-white/10"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {searchable && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 bg-white/5 border-white/10 focus:border-blue-500/50"
            />
          </div>
        )}
        
        {filterable && (
          <LogLevelFilter
            selectedLevels={selectedLevels}
            onChange={(levels) => {
              setSelectedLevels(levels);
              setCurrentPage(1);
            }}
          />
        )}
        
        <div className="text-sm text-gray-500 flex items-center">
          {processedLogs.length} {processedLogs.length === 1 ? 'log' : 'logs'}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/10 overflow-hidden bg-black/20">
        <Table>
          <TableHeader>
            <TableRow className="bg-white/5 hover:bg-white/5 border-b border-white/10">
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  style={{ width: column.width }}
                  className={cn(
                    'text-gray-400 font-medium',
                    column.sortable && 'cursor-pointer hover:text-white transition-colors'
                  )}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center gap-2">
                    {column.label}
                    {column.sortable && getSortIcon(column.key)}
                  </div>
                </TableHead>
              ))}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {loading ? (
                // Loading skeleton
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={`skeleton-${idx}`} className="border-b border-white/5">
                    {columns.map((col) => (
                      <TableCell key={col.key}>
                        <div className="h-4 bg-white/10 rounded animate-pulse" />
                      </TableCell>
                    ))}
                    <TableCell />
                  </TableRow>
                ))
              ) : paginatedLogs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + 1}
                    className="text-center py-12 text-gray-500"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Info className="h-8 w-8 text-gray-600" />
                      {emptyMessage}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLogs.map((log, idx) => {
                  const levelConfig = getLevelConfig(log.level);
                  const isExpanded = expandedRow === log.id;
                  
                  return (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ delay: idx * 0.02 }}
                      className={cn(
                        'border-b border-white/5 transition-colors cursor-pointer',
                        'hover:bg-white/5',
                        isExpanded && levelConfig.bgClass
                      )}
                      onClick={() => {
                        if (onRowClick) {
                          onRowClick(log);
                        } else {
                          setExpandedRow(isExpanded ? null : log.id);
                        }
                      }}
                    >
                      {columns.map((column) => (
                        <TableCell key={column.key} className="py-3">
                          {column.render
                            ? column.render(log[column.key as keyof LogEntry], log)
                            : String(log[column.key as keyof LogEntry] || '-')}
                        </TableCell>
                      ))}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu log={log} actions={rowActions} onAction={onRowAction} />
                      </TableCell>
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="bg-white/5 border-white/10 hover:bg-white/10 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      'w-8 h-8 p-0',
                      currentPage === pageNum
                        ? 'bg-blue-500 hover:bg-blue-600'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    )}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="bg-white/5 border-white/10 hover:bg-white/10 disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
