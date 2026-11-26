/**
 * Divisi 06 foundation — AI Research Council roles.
 *
 * This is a static registry, NOT a running agent. No role may trade, withdraw,
 * approve its own output or write code. Human approval remains the only gate for
 * privileged action. Pure module: no I/O, no network, no runtime activation.
 */

export type AgentRoleId =
  | 'market-analyst'
  | 'quant-researcher'
  | 'strategy-developer'
  | 'risk-analyst'
  | 'portfolio-manager'
  | 'independent-reviewer';

export type AgentCapability =
  | 'read_market'
  | 'propose_strategy'
  | 'write_code'
  | 'read_private_account'
  | 'approve'
  | 'execute_trade'
  | 'withdraw';

export interface AgentCapabilitySet {
  readonly read_market: boolean;
  readonly propose_strategy: boolean;
  readonly write_code: boolean;
  readonly read_private_account: boolean;
  readonly approve: boolean;
  readonly execute_trade: boolean;
  readonly withdraw: boolean;
}

export interface AgentRole {
  readonly id: AgentRoleId;
  readonly title: string;
  readonly division: string;
  readonly autonomy_stage: 0 | 1;
  readonly capabilities: AgentCapabilitySet;
  readonly allowed_outputs: readonly string[];
}

const BASE_CAPABILITIES: AgentCapabilitySet = {
  read_market: true,
  propose_strategy: true,
  write_code: false,
  read_private_account: false,
  approve: false,
  execute_trade: false,
  withdraw: false,
};

export const AGENT_ROLES: readonly AgentRole[] = [
  {
    id: 'market-analyst',
    title: 'Market Analyst',
    division: '04',
    autonomy_stage: 1,
    capabilities: BASE_CAPABILITIES,
    allowed_outputs: ['market_summary', 'source_citations', 'data_quality_flags'],
  },
  {
    id: 'quant-researcher',
    title: 'Quant Researcher',
    division: '04',
    autonomy_stage: 1,
    capabilities: BASE_CAPABILITIES,
    allowed_outputs: ['feature_hypothesis', 'factor_scores', 'validation_plan'],
  },
  {
    id: 'strategy-developer',
    title: 'Strategy Developer',
    division: '04',
    autonomy_stage: 1,
    capabilities: BASE_CAPABILITIES,
    allowed_outputs: ['strategy_proposal', 'version_manifest', 'test_plan'],
  },
  {
    id: 'risk-analyst',
    title: 'Risk Analyst',
    division: '03',
    autonomy_stage: 1,
    capabilities: BASE_CAPABILITIES,
    allowed_outputs: ['risk_findings', 'limit_proposal', 'stop_conditions'],
  },
  {
    id: 'portfolio-manager',
    title: 'Portfolio Manager',
    division: '03',
    autonomy_stage: 1,
    capabilities: BASE_CAPABILITIES,
    allowed_outputs: ['allocation_proposal', 'exposure_review', 'rebalance_proposal'],
  },
  {
    id: 'independent-reviewer',
    title: 'Independent Reviewer',
    division: '05',
    autonomy_stage: 1,
    capabilities: BASE_CAPABILITIES,
    allowed_outputs: ['review_findings', 'acceptance_decision_proposal', 'regression_checklist'],
  },
];

const FORBIDDEN_CAPABILITIES: readonly AgentCapability[] = [
  'write_code',
  'read_private_account',
  'approve',
  'execute_trade',
  'withdraw',
];

const ROLE_IDS: ReadonlySet<string> = new Set(AGENT_ROLES.map((role) => role.id));

export function isAgentRoleId(value: unknown): value is AgentRoleId {
  return typeof value === 'string' && ROLE_IDS.has(value);
}

export function getAgentRole(id: unknown): AgentRole | null {
  if (!isAgentRoleId(id)) return null;
  const found = AGENT_ROLES.find((role) => role.id === id);
  return found ?? null;
}

/** Fail closed: privileged capabilities are denied even if a role object is malformed. */
export function canPerform(role: AgentRole | null | undefined, capability: AgentCapability): boolean {
  if (!role || !isAgentRole(role)) return false;
  if (FORBIDDEN_CAPABILITIES.includes(capability)) return false;
  return role.capabilities[capability] === true;
}

export function isAgentCapabilitySet(value: unknown): value is AgentCapabilitySet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (Object.keys(BASE_CAPABILITIES) as readonly (keyof AgentCapabilitySet)[]).every(
    (key) => typeof obj[key] === 'boolean',
  );
}

export function isAgentRole(value: unknown): value is AgentRole {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (!isAgentRoleId(obj.id)) return false;
  if (typeof obj.title !== 'string' || obj.title.length < 1 || obj.title.length > 120) return false;
  if (typeof obj.division !== 'string' || !/^(0[1-8])$/.test(obj.division)) return false;
  if (obj.autonomy_stage !== 0 && obj.autonomy_stage !== 1) return false;
  if (!isAgentCapabilitySet(obj.capabilities)) return false;
  if (FORBIDDEN_CAPABILITIES.some((key) => obj.capabilities && (obj.capabilities as AgentCapabilitySet)[key] === true)) return false;
  return Array.isArray(obj.allowed_outputs) && obj.allowed_outputs.length <= 20
    && obj.allowed_outputs.every((item) => typeof item === 'string' && item.length <= 80);
}
