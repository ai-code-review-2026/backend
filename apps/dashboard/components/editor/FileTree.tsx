"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export interface TreeEntry {
  path: string
  type: "blob" | "tree"
  sha: string
  size?: number
}

interface TreeNode {
  name: string
  path: string
  type: "file" | "folder"
  children: TreeNode[]
}

interface FileTreeProps {
  entries: TreeEntry[]
  selectedPath: string | null
  onSelectFile: (path: string) => void
  onCreateFile?: (path: string) => void
  onCreateFolder?: (path: string) => void
  onRenamePath?: (oldPath: string, newPath: string) => void
  onDeletePath?: (path: string, type: "file" | "folder") => void
  onRefresh?: () => void
  isLoading?: boolean
}

function buildTree(entries: TreeEntry[]): TreeNode[] {
  const visibleEntries = entries.filter(
    (entry) => !entry.path.endsWith("/.gitkeep") && entry.path !== ".gitkeep",
  )
  const root: TreeNode[] = []
  const nodeMap = new Map<string, TreeNode>()

  const sorted = [...visibleEntries].sort((left, right) => {
    if (left.type === "tree" && right.type !== "tree") return -1
    if (left.type !== "tree" && right.type === "tree") return 1
    return left.path.localeCompare(right.path)
  })

  for (const entry of sorted) {
    const parts = entry.path.split("/")
    let currentPath = ""

    for (let index = 0; index < parts.length; index += 1) {
      const parentPath = currentPath
      currentPath = currentPath ? `${currentPath}/${parts[index]}` : parts[index]

      if (nodeMap.has(currentPath)) continue

      const isLeaf = index === parts.length - 1
      const node: TreeNode = {
        name: parts[index],
        path: currentPath,
        type: isLeaf && entry.type === "blob" ? "file" : "folder",
        children: [],
      }
      nodeMap.set(currentPath, node)

      if (parentPath) {
        const parent = nodeMap.get(parentPath)
        parent?.children.push(node)
      } else {
        root.push(node)
      }
    }
  }

  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((left, right) => {
      if (left.type === "folder" && right.type === "file") return -1
      if (left.type === "file" && right.type === "folder") return 1
      return left.name.localeCompare(right.name)
    })
    nodes.forEach((node) => sortChildren(node.children))
  }

  sortChildren(root)
  return root
}

function getFileColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  const colorMap: Record<string, string> = {
    ts: "text-blue-400",
    tsx: "text-blue-300",
    js: "text-yellow-400",
    jsx: "text-yellow-300",
    py: "text-green-400",
    rs: "text-orange-400",
    go: "text-cyan-400",
    md: "text-gray-400",
    json: "text-yellow-500",
    yaml: "text-red-300",
    yml: "text-red-300",
    css: "text-purple-400",
    html: "text-orange-500",
    sql: "text-pink-400",
    sh: "text-green-300",
    toml: "text-gray-300",
    lock: "text-gray-500",
    env: "text-yellow-600",
  }
  return colorMap[ext] ?? "text-gray-400"
}

function TreeNodeItem({
  node,
  depth,
  selectedPath,
  expandedFolders,
  renamingPath,
  renameValue,
  onRenameValueChange,
  onSubmitRename,
  onCancelRename,
  onStartRename,
  onDeletePath,
  onToggleFolder,
  onSelectFile,
}: {
  node: TreeNode
  depth: number
  selectedPath: string | null
  expandedFolders: Set<string>
  renamingPath: string | null
  renameValue: string
  onRenameValueChange: (value: string) => void
  onSubmitRename: (oldPath: string) => void
  onCancelRename: () => void
  onStartRename: (path: string) => void
  onDeletePath?: (path: string, type: "file" | "folder") => void
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
}) {
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = node.path === selectedPath
  const isRenaming = renamingPath === node.path
  const paddingLeft = 8 + depth * 16

  if (isRenaming) {
    return (
      <div className="px-2 py-1" style={{ paddingLeft: paddingLeft + 18 }}>
        <Input
          value={renameValue}
          onChange={(event) => onRenameValueChange(event.target.value)}
          onBlur={() => onCancelRename()}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmitRename(node.path)
            if (event.key === "Escape") onCancelRename()
          }}
          className="h-7 text-xs"
          autoFocus
        />
      </div>
    )
  }

  if (node.type === "folder") {
    return (
      <div>
        <div
          className={`group flex items-center w-full py-1 px-2 text-sm hover:bg-muted/50 transition-colors ${
            isSelected ? "bg-muted" : ""
          }`}
          style={{ paddingLeft }}
        >
          <button
            className="flex items-center flex-1 min-w-0 text-left"
            onClick={() => onToggleFolder(node.path)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 mr-1 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 mr-1 shrink-0 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 mr-1.5 shrink-0 text-yellow-500" />
            ) : (
              <Folder className="h-4 w-4 mr-1.5 shrink-0 text-yellow-500" />
            )}
            <span className="truncate">{node.name}</span>
          </button>

          <div className="ml-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation()
                onStartRename(node.path)
              }}
              title="Rename folder"
            >
              <Pencil className="h-3 w-3" />
            </button>
            {onDeletePath && (
              <button
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                onClick={(event) => {
                  event.stopPropagation()
                  onDeletePath(node.path, "folder")
                }}
                title="Delete folder"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {isExpanded &&
          node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedFolders={expandedFolders}
              renamingPath={renamingPath}
              renameValue={renameValue}
              onRenameValueChange={onRenameValueChange}
              onSubmitRename={onSubmitRename}
              onCancelRename={onCancelRename}
              onStartRename={onStartRename}
              onDeletePath={onDeletePath}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
            />
          ))}
      </div>
    )
  }

  return (
    <div
      className={`group flex items-center w-full py-1 px-2 text-sm hover:bg-muted/50 transition-colors ${
        isSelected ? "bg-primary/10 text-primary font-medium" : ""
      }`}
      style={{ paddingLeft: paddingLeft + 18 }}
    >
      <button
        className="flex items-center flex-1 min-w-0 text-left"
        onClick={() => onSelectFile(node.path)}
      >
        <File className={`h-4 w-4 mr-1.5 shrink-0 ${getFileColor(node.name)}`} />
        <span className="truncate">{node.name}</span>
      </button>

      <div className="ml-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation()
            onStartRename(node.path)
          }}
          title="Rename file"
        >
          <Pencil className="h-3 w-3" />
        </button>
        {onDeletePath && (
          <button
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation()
              onDeletePath(node.path, "file")
            }}
            title="Delete file"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

export function FileTree({
  entries,
  selectedPath,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onDeletePath,
  onRefresh,
  isLoading,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [creationMode, setCreationMode] = useState<"file" | "folder" | null>(
    null,
  )
  const [newEntryPath, setNewEntryPath] = useState("")
  const [filterText, setFilterText] = useState("")
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  const tree = useMemo(() => buildTree(entries), [entries])

  useEffect(() => {
    if (!selectedPath) return
    const parts = selectedPath.split("/")
    setExpandedFolders((previous) => {
      const next = new Set(previous)
      let current = ""
      for (let index = 0; index < parts.length - 1; index += 1) {
        current = current ? `${current}/${parts[index]}` : parts[index]
        next.add(current)
      }
      return next
    })
  }, [selectedPath])

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const filteredTree = useMemo(() => {
    if (!filterText) return tree
    const normalizedFilter = filterText.toLowerCase()

    const filterNodes = (nodes: TreeNode[]): TreeNode[] =>
      nodes.reduce<TreeNode[]>((result, node) => {
        if (node.type === "file") {
          if (node.path.toLowerCase().includes(normalizedFilter)) {
            result.push(node)
          }
          return result
        }

        const filteredChildren = filterNodes(node.children)
        if (
          filteredChildren.length > 0 ||
          node.path.toLowerCase().includes(normalizedFilter)
        ) {
          result.push({ ...node, children: filteredChildren })
        }
        return result
      }, [])

    return filterNodes(tree)
  }, [tree, filterText])

  const handleCreate = useCallback(() => {
    const value = newEntryPath.trim()
    if (!value || !creationMode) return

    if (creationMode === "file") {
      onCreateFile?.(value)
    } else {
      onCreateFolder?.(value)
    }

    setCreationMode(null)
    setNewEntryPath("")
  }, [creationMode, newEntryPath, onCreateFile, onCreateFolder])

  const handleStartRename = useCallback((path: string) => {
    setRenamingPath(path)
    setRenameValue(path)
  }, [])

  const handleSubmitRename = useCallback(
    (oldPath: string) => {
      const nextPath = renameValue.trim()
      if (!nextPath || !onRenamePath || nextPath === oldPath) {
        setRenamingPath(null)
        setRenameValue("")
        return
      }
      onRenamePath(oldPath, nextPath)
      setRenamingPath(null)
      setRenameValue("")
    },
    [onRenamePath, renameValue],
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          {onCreateFile && (
            <Button
              variant={creationMode === "file" ? "secondary" : "ghost"}
              size="icon"
              className="h-5 w-5"
              onClick={() => {
                setCreationMode((previous) =>
                  previous === "file" ? null : "file",
                )
                setNewEntryPath("")
              }}
              title="New file"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          {onCreateFolder && (
            <Button
              variant={creationMode === "folder" ? "secondary" : "ghost"}
              size="icon"
              className="h-5 w-5"
              onClick={() => {
                setCreationMode((previous) =>
                  previous === "folder" ? null : "folder",
                )
                setNewEntryPath("")
              }}
              title="New folder"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
          )}
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="px-2 py-1.5 border-b">
        <Input
          placeholder="Filter files..."
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          className="h-6 text-xs"
        />
      </div>

      {creationMode && (
        <div className="px-2 py-1.5 border-b flex gap-1">
          <Input
            placeholder={
              creationMode === "file" ? "path/to/file.ts" : "path/to/folder"
            }
            value={newEntryPath}
            onChange={(event) => setNewEntryPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleCreate()
              if (event.key === "Escape") {
                setCreationMode(null)
                setNewEntryPath("")
              }
            }}
            className="h-6 text-xs flex-1"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleCreate}
          >
            {creationMode === "file" ? (
              <Plus className="h-3 w-3" />
            ) : (
              <FolderPlus className="h-3 w-3" />
            )}
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {isLoading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            {filterText ? "No matching files" : "No files found"}
          </div>
        ) : (
          filteredTree.map((node) => (
            <TreeNodeItem
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              expandedFolders={expandedFolders}
              renamingPath={renamingPath}
              renameValue={renameValue}
              onRenameValueChange={setRenameValue}
              onSubmitRename={handleSubmitRename}
              onCancelRename={() => {
                setRenamingPath(null)
                setRenameValue("")
              }}
              onStartRename={handleStartRename}
              onDeletePath={onDeletePath}
              onToggleFolder={toggleFolder}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </div>
    </div>
  )
}
