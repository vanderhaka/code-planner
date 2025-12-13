/**
 * Scope parser for determining which files to review.
 * Handles file paths, glob patterns, commit ranges, and default behavior.
 */

export type ScopeType = "file" | "glob" | "commits" | "empty" | "invalid";

export type ParsedScope = {
  type: ScopeType;
  value: string;
  commitCount?: number;
};

/**
 * Check if a string looks like a file path (contains / and has an extension)
 */
function isFilePath(scope: string): boolean {
  // Simple heuristic: contains / and has a file extension
  if (!scope.includes("/")) return false;
  
  // Check for common file extensions
  const hasExtension = /\.(ts|tsx|js|jsx|py|java|go|rs|rb|php|cs|cpp|c|h|hpp|vue|svelte|html|css|scss|json|yaml|yml|md|sql|sh|bash)$/i.test(scope);
  
  // Or if it's a path with a file-like structure
  return hasExtension || scope.split("/").pop()?.includes(".") === true;
}

/**
 * Check if a string looks like a glob pattern
 */
function isGlobPattern(scope: string): boolean {
  return scope.includes("*") || scope.includes("?") || scope.includes("[");
}

/**
 * Check if a string is a number (for commit count)
 */
function isCommitCount(scope: string): boolean {
  const num = parseInt(scope, 10);
  return !isNaN(num) && num > 0 && num.toString() === scope.trim();
}

/**
 * Parse a scope argument into a structured format.
 * 
 * Rules:
 * 1. If empty → type: "empty" (review last commit changes)
 * 2. If it's a number → type: "commits" (review last N commits)
 * 3. If it's a glob pattern → type: "glob"
 * 4. If it's a file path → type: "file"
 * 5. Otherwise → type: "invalid"
 */
export function parseScope(scope: string | null | undefined): ParsedScope {
  const trimmed = scope?.trim() ?? "";
  
  if (!trimmed) {
    return { type: "empty", value: "" };
  }
  
  // Check if it's a commit count (just a number)
  if (isCommitCount(trimmed)) {
    const count = parseInt(trimmed, 10);
    return {
      type: "commits",
      value: trimmed,
      commitCount: count,
    };
  }
  
  // Check if it's a glob pattern
  if (isGlobPattern(trimmed)) {
    return {
      type: "glob",
      value: trimmed,
    };
  }
  
  // Check if it's a file path
  if (isFilePath(trimmed)) {
    return {
      type: "file",
      value: trimmed,
    };
  }
  
  // Could be a relative path without extension, treat as file path
  if (trimmed.includes("/")) {
    return {
      type: "file",
      value: trimmed,
    };
  }
  
  // Invalid scope
  return {
    type: "invalid",
    value: trimmed,
  };
}

/**
 * Convert a glob pattern to a regex pattern for matching file paths.
 * Simple glob implementation - supports * and ** wildcards.
 */
export function globToRegex(glob: string): RegExp {
  // Escape special regex characters except * and ?
  let pattern = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{DOUBLE_STAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/{{DOUBLE_STAR}}/g, ".*");
  
  // Anchor to start of string
  if (!pattern.startsWith(".*")) {
    pattern = "^" + pattern;
  }
  
  return new RegExp(pattern);
}

/**
 * Match a file path against a glob pattern.
 */
export function matchesGlob(filePath: string, glob: string): boolean {
  const regex = globToRegex(glob);
  return regex.test(filePath);
}

/**
 * Get a human-readable description of a parsed scope.
 */
export function getScopeDescription(scope: ParsedScope): string {
  switch (scope.type) {
    case "empty":
      return "Review files changed in last commit";
    case "commits":
      return `Review files changed in last ${scope.commitCount} commit(s)`;
    case "file":
      return `Review file: ${scope.value}`;
    case "glob":
      return `Review files matching: ${scope.value}`;
    case "invalid":
      return `Invalid scope: ${scope.value}`;
  }
}

