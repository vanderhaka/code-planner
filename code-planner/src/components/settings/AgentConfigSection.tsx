/**
 * Agent configuration section component.
 */

import type { ReviewAgent, Settings } from "@/lib/settings";

const AGENT_LABELS: Record<ReviewAgent, string> = {
  "bug-detector": "Bug Detector",
  "security-auditor": "Security Auditor",
  "performance-optimizer": "Performance Optimizer",
  "refactoring-architect": "Refactoring Architect",
};

type Props = {
  settings: Settings;
  onAgentToggle: (agent: ReviewAgent) => void;
  onConfidenceToggle: () => void;
};

export function AgentConfigSection({ settings, onAgentToggle, onConfidenceToggle }: Props) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="text-sm font-medium text-neutral-900">Agent-Based Review</div>
      <div className="mt-1 text-xs text-neutral-600">
        Configure which specialized agents run in agent-based review mode.
      </div>

      <div className="mt-4 space-y-2">
        {(Object.keys(AGENT_LABELS) as ReviewAgent[]).map((agent) => {
          const isEnabled = settings.agentConfig.enabledAgents.includes(agent);
          return (
            <label key={agent} className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-900">{AGENT_LABELS[agent]}</div>
                <div className="text-xs text-neutral-600">
                  {agent === "bug-detector" && "Detects bugs, logic errors, and AI slop"}
                  {agent === "security-auditor" && "Identifies security vulnerabilities"}
                  {agent === "performance-optimizer" && "Finds performance bottlenecks"}
                  {agent === "refactoring-architect" && "Suggests code organization improvements"}
                </div>
              </div>
              <input
                className="h-4 w-4 accent-neutral-900"
                type="checkbox"
                checked={isEnabled}
                onChange={() => onAgentToggle(agent)}
              />
            </label>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-neutral-100">
        <label className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-neutral-900">Confidence Evaluation</div>
            <div className="text-xs text-neutral-600">
              Include confidence scoring for findings (slower but more thorough)
            </div>
          </div>
          <input
            className="h-4 w-4 accent-neutral-900"
            type="checkbox"
            checked={settings.agentConfig.includeConfidence}
            onChange={onConfidenceToggle}
          />
        </label>
      </div>
    </div>
  );
}

