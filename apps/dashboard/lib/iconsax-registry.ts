import {
  // Security & Analytics Icons
  SecuritySafe,
  Graph,
  Chart,
  DocumentText,
  Code,
  Danger,
  InfoCircle,
  TickCircle,
  CloseCircle,
  Warning2,
  
  // Navigation Icons
  Home2,
  Category,
  Building4,
  Data,
  Profile,
  People,
  Activity,
  Setting2,
  
  // Action Icons
  Edit,
  Trash,
  Refresh,
  Add,
  Import,
  Export,
  SearchNormal1,
  
  // File & Code Icons
  DocumentCode,
  FolderOpen,
  Global,
  CodeCircle,
  
  // Status Icons
  TickCircle as CheckCircle,
  CloseSquare,
  Information,
  Flash,
  Shield,
  
  // UI Icons
  ArrowRight2,
  ArrowLeft2,
  ArrowUp2,
  ArrowDown2,
  More,
  EyeSlash,
  Eye,
} from "iconsax-react";

export const iconsaxRegistry = {
  // Security & Analytics
  security: SecuritySafe,
  graph: Graph,
  chart: Chart,
  document: DocumentText,
  code: Code,
  danger: Danger,
  info: InfoCircle,
  success: TickCircle,
  error: CloseCircle,
  warning: Warning2,
  
  // Navigation
  home: Home2,
  dashboard: Category,
  building: Building4,
  database: Data,
  profile: Profile,
  users: People,
  activity: Activity,
  settings: Setting2,
  
  // Actions
  edit: Edit,
  delete: Trash,
  refresh: Refresh,
  add: Add,
  import: Import,
  export: Export,
  search: SearchNormal1,
  
  // Files & Code
  documentCode: DocumentCode,
  folder: FolderOpen,
  globe: Global,
  codeCircle: CodeCircle,
  
  // Status
  check: CheckCircle,
  close: CloseSquare,
  information: Information,
  flash: Flash,
  shield: Shield,
  
  // UI
  arrowRight: ArrowRight2,
  arrowLeft: ArrowLeft2,
  arrowUp: ArrowUp2,
  arrowDown: ArrowDown2,
  more: More,
  hide: EyeSlash,
  show: Eye,
} as const;

export type IconsaxName = keyof typeof iconsaxRegistry;

// Helper function to get icon by name
export const getIconsaxIcon = (name: IconsaxName) => {
  return iconsaxRegistry[name];
};