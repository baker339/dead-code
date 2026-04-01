/** Persisted on `AnalysisRun.codeGraph` — bump `v` when shape changes. */
export type CodeGraphLanguage =
  | "java"
  | "kotlin"
  | "csharp"
  | "swift"
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "module";

export type CodeGraphV1 = {
  v: 1;
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  /** File or synthetic module nodes */
  nodes: {
    id: string;
    /** Repo-relative path (or module name for synthetic nodes). */
    path: string;
    /** Short label (usually filename). */
    label: string;
    language: CodeGraphLanguage;
  }[];
  edges: {
    from: string;
    to: string;
    kind: "import" | "using" | "swift-module" | "relative" | "python" | "go" | "rust";
  }[];
  /** File node ids with zero incoming edges (possible entry / root files). */
  rootsHint: string[];
  /** File node ids with zero outgoing import edges (possible leaves). */
  leavesHint: string[];
};
