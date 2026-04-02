// ============================================
// EVERGREEN — Gedeelde Types
// ============================================

export interface Venture {
  id: string
  owner_email: string
  original_intent: string
  evolved_intent?: string
  intent_version: number
  status: 'bootstrapping' | 'active' | 'paused' | 'archived'
  phase: 'bootstrap' | 'understand' | 'infrastructure' | 'execute' | 'scale'
  budget_total: number
  budget_spent: number
  approval_threshold: number
  revenue_total: number
  loop_interval_minutes: number
  last_loop_at?: string
  next_loop_at?: string
  loop_count: number
  project_name?: string
  project_email?: string
  domain?: string
  created_at: string
  last_active_at: string
}

export interface Decision {
  id: string
  venture_id: string
  level: 'strategic' | 'tactical' | 'operational'
  context_summary: string
  context_full: Record<string, any>
  reasoning: string
  action_type: string
  action_params: Record<string, any>
  executed: boolean
  result?: Record<string, any>
  success?: boolean
  error_message?: string
  learnings?: string
  significance: number
  created_at: string
  executed_at?: string
}

export interface Contact {
  id: string
  venture_id: string
  name?: string
  email?: string
  company?: string
  role?: string
  linkedin_url?: string
  status: 'discovered' | 'researched' | 'contacted' | 'replied' | 'meeting' | 'converted' | 'rejected'
  profile: Record<string, any>
  interactions: Interaction[]
  estimated_value?: number
  actual_value: number
  discovered_via?: string
  created_at: string
  last_contacted_at?: string
}

export interface Interaction {
  type: 'email_sent' | 'email_received' | 'meeting' | 'call'
  date: string
  summary: string
  outcome?: string
}

export interface Transaction {
  id: string
  venture_id: string
  type: 'expense' | 'revenue'
  amount: number
  currency: string
  description: string
  category?: string
  requires_approval: boolean
  approved?: boolean
  approved_by?: string
  executed: boolean
  created_at: string
}

export interface Learning {
  id: string
  venture_id: string
  category: string
  insight: string
  evidence?: string
  confidence: number
  applied_count: number
  success_rate?: number
  created_at: string
}

export interface Notification {
  id: string
  venture_id: string
  type: 'info' | 'approval_request' | 'strategy_change' | 'milestone' | 'error'
  subject: string
  body: string
  approval_token?: string
  approval_amount?: number
  approval_action?: Record<string, any>
  sent: boolean
  read: boolean
  response?: string
  created_at: string
}

export interface LoopState {
  venture: Venture
  currentMetrics: Record<string, number>
  recentDecisions: Decision[]
  recentLearnings: Learning[]
  pendingApprovals: Notification[]
  budgetRemaining: number
}

export interface ThinkResult {
  reasoning: string
  actions: PlannedAction[]
  nextCycleMinutes: number
  strategyInsight?: string
  shouldEvolveIntent?: boolean
  evolvedIntent?: string
}

export interface PlannedAction {
  type: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  params: Record<string, any>
  estimatedCost?: number
  requiresApproval?: boolean
  reasoning: string
}

export interface ExecutionResult {
  success: boolean
  output?: any
  error?: string
  significance: number
  learnings?: string
  metricsImpact?: Record<string, number>
}
