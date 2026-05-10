# Task 8: Diff Editor Refactoring Plan

## Status: PARTIAL COMPLETION ✅

### What Was Completed

1. **Extracted Utilities** → `components/diff-editor/utils.ts`
   - File info helpers
   - Quality score calculation
   - Path normalization
   - Severity ranking
   - Score colors and glows
   - Repo coordinate parsing
   - Timestamp formatting

2. **Extracted UI Components** → `components/diff-editor/DiffUIComponents.tsx`
   - `ExtBadge` - File extension badge
   - `ScoreRing` - Animated quality score ring
   - `LoadingSpinner` - Loading indicator
   - `StatusBadge` - Analysis status badge
   - `SeverityBadge` - Finding severity badge

### Current Structure (1630 lines)

```
AnnotatedDiff.tsx
├── Helper functions (lines 49-131) ✅ EXTRACTED
├── Sub-components
│   ├── ExtBadge (134-150) ✅ EXTRACTED
│   ├── ScoreRing (152-188) ✅ EXTRACTED
│   ├── RagComment (190-336) → TO EXTRACT
│   └── DiffLine (338-471) → TO EXTRACT
└── Main Component (473-1630)
    ├── State management (30+ useState)
    ├── Effects (4 useEffect)
    ├── Memoized values (5 useMemo)
    ├── Event handlers (20+ functions)
    └── Render logic (800+ lines)
```

### Future Refactoring Steps

#### Phase 1: Component Extraction (Remaining)

1. **RagComment Component** (147 lines)
   - Extract to `components/diff-editor/RagComment.tsx`
   - Props: finding, onApply, onComment, onDismiss, onRequestCall
   - Handles AI review finding display with actions

2. **DiffLine Component** (134 lines)
   - Extract to `components/diff-editor/DiffLine.tsx`
   - Props: line, showCommentForm, onAddComment, etc.
   - Renders individual diff lines with annotations

3. **FileSidebar Component** (~300 lines)
   - Extract to `components/diff-editor/FileSidebar.tsx`
   - Props: files, selectedFile, onChange, analysis
   - File list with stats and quality indicators

4. **FindingsPanel Component** (~200 lines)
   - Extract to `components/diff-editor/FindingsPanel.tsx`
   - Props: findings, onSelect, onDismiss, etc.
   - Findings list with filters and actions

5. **DiffHeader Component** (~150 lines)
   - Extract to `components/diff-editor/DiffHeader.tsx`
   - Props: analysis, repoCoordinates, qualityScore
   - Top bar with repo info, stats, and actions

#### Phase 2: Hook Extraction

1. **useDiffState Hook**
   ```typescript
   // State management for diff viewing
   - selectedFilePath
   - dismissedFindings
   - viewMode (diff/edit)
   - activeBranch
   ```

2. **useReviewState Hook**
   ```typescript
   // Review-specific state
   - pendingComments
   - existingComments
   - activeCommentLine
   - showSubmitDialog
   ```

3. **useGitHubActions Hook**
   ```typescript
   // GitHub API interactions
   - commitFile
   - createPR
   - submitReview
   - resolveBranch
   ```

4. **useComments Hook**
   ```typescript
   // Comment management
   - fetchComments
   - addComment
   - resolveComment
   - replyToComment
   ```

#### Phase 3: Context Provider

Create `DiffEditorProvider` to share state across extracted components:
- Analysis data
- Selected file
- User permissions
- GitHub credentials

#### Phase 4: Final Structure

```
components/diff-editor/
├── utils.ts ✅
├── DiffUIComponents.tsx ✅
├── RagComment.tsx
├── DiffLine.tsx
├── FileSidebar.tsx
├── FindingsPanel.tsx
├── DiffHeader.tsx
├── hooks/
│   ├── useDiffState.ts
│   ├── useReviewState.ts
│   ├── useGitHubActions.ts
│   └── useComments.ts
├── DiffEditorProvider.tsx
└── index.ts (exports)

components/dashboard/
└── AnnotatedDiff.tsx (orchestrator, ~300 lines)
```

### Benefits of Full Refactoring

1. **Maintainability**: Smaller, focused files
2. **Testability**: Each component can be tested independently
3. **Reusability**: Components can be used in other contexts
4. **Performance**: Easier to optimize individual components
5. **Readability**: Clear separation of concerns

### Estimated Effort

- Phase 1: 4-6 hours
- Phase 2: 3-4 hours
- Phase 3: 2-3 hours
- Phase 4: 1-2 hours
- **Total: 10-15 hours**

### Priority

**Medium** - The current implementation works well. Refactoring should be done:
- When adding new diff editor features
- When experiencing performance issues
- During a dedicated refactoring sprint
- When new team members struggle to navigate the code

### Notes

- Preserve existing design tokens and animations
- Maintain glassmorphism style
- Keep all keyboard shortcuts
- Ensure backward compatibility with existing review flow
- Add storybook stories for extracted components
