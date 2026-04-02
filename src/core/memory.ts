import { createClient } from '@supabase/supabase-js'
import Redis from 'ioredis'
import { Venture, Decision, Contact, Transaction, Learning, Notification, LoopState } from '../types'
import { logger } from './logger'
import dotenv from 'dotenv'
dotenv.config()

// ============================================
// Supabase client — langetermijn geheugen
// ============================================
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ============================================
// Redis client — kortetermijn geheugen
// ============================================
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

// ============================================
// MEMORY — Alle geheugenoperaties
// ============================================
export class Memory {

  // -- VENTURES --

  static async getVenture(id: string): Promise<Venture | null> {
    const { data, error } = await supabase
      .from('ventures')
      .select('*')
      .eq('id', id)
      .single()
    if (error) { logger.error('getVenture error', error); return null }
    return data
  }

  static async getAllActiveVentures(): Promise<Venture[]> {
    const { data, error } = await supabase
      .from('ventures')
      .select('*')
      .eq('status', 'active')
      .order('last_active_at', { ascending: true })
    if (error) { logger.error('getAllActiveVentures error', error); return [] }
    return data || []
  }

  static async updateVenture(id: string, updates: Partial<Venture>): Promise<void> {
    const { error } = await supabase
      .from('ventures')
      .update({ ...updates, last_active_at: new Date().toISOString() })
      .eq('id', id)
    if (error) logger.error('updateVenture error', error)
  }

  static async createVenture(data: {
    owner_email: string
    original_intent: string
    budget_total: number
    approval_threshold?: number
  }): Promise<Venture | null> {
    const { data: venture, error } = await supabase
      .from('ventures')
      .insert({
        ...data,
        status: 'bootstrapping',
        phase: 'bootstrap',
        approval_threshold: data.approval_threshold || 50,
      })
      .select()
      .single()
    if (error) { logger.error('createVenture error', error); return null }
    return venture
  }

  // -- DECISIONS --

  static async saveDecision(decision: Omit<Decision, 'id' | 'created_at'>): Promise<Decision | null> {
    const { data, error } = await supabase
      .from('decisions')
      .insert(decision)
      .select()
      .single()
    if (error) { logger.error('saveDecision error', error); return null }
    return data
  }

  static async getRecentDecisions(ventureId: string, limit = 20): Promise<Decision[]> {
    const { data, error } = await supabase
      .from('decisions')
      .select('*')
      .eq('venture_id', ventureId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) { logger.error('getRecentDecisions error', error); return [] }
    return data || []
  }

  static async markDecisionExecuted(id: string, result: any, success: boolean, learnings?: string): Promise<void> {
    const { error } = await supabase
      .from('decisions')
      .update({
        executed: true,
        result,
        success,
        learnings,
        executed_at: new Date().toISOString()
      })
      .eq('id', id)
    if (error) logger.error('markDecisionExecuted error', error)
  }

  // -- CONTACTS --

  static async saveContact(contact: Omit<Contact, 'id' | 'created_at'>): Promise<Contact | null> {
    // Check of contact al bestaat
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('venture_id', contact.venture_id)
      .eq('email', contact.email)
      .single()

    if (existing) {
      logger.info(`Contact ${contact.email} bestaat al`)
      return null
    }

    const { data, error } = await supabase
      .from('contacts')
      .insert(contact)
      .select()
      .single()
    if (error) { logger.error('saveContact error', error); return null }
    return data
  }

  static async updateContactStatus(id: string, status: Contact['status'], interaction?: any): Promise<void> {
    const { data: contact } = await supabase
      .from('contacts')
      .select('interactions')
      .eq('id', id)
      .single()

    const interactions = contact?.interactions || []
    if (interaction) interactions.push(interaction)

    const { error } = await supabase
      .from('contacts')
      .update({
        status,
        interactions,
        last_contacted_at: new Date().toISOString()
      })
      .eq('id', id)
    if (error) logger.error('updateContactStatus error', error)
  }

  static async getContactsByStatus(ventureId: string, status: Contact['status']): Promise<Contact[]> {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('venture_id', ventureId)
      .eq('status', status)
    if (error) { logger.error('getContactsByStatus error', error); return [] }
    return data || []
  }

  // -- TRANSACTIONS --

  static async recordTransaction(tx: Omit<Transaction, 'id' | 'created_at'>): Promise<Transaction | null> {
    const { data, error } = await supabase
      .from('transactions')
      .insert(tx)
      .select()
      .single()
    if (error) { logger.error('recordTransaction error', error); return null }

    // Update budget indien expense en goedgekeurd
    if (tx.type === 'expense' && tx.approved !== false) {
      await supabase.rpc('increment_budget_spent', {
        venture_id: tx.venture_id,
        amount: tx.amount
      })
    }

    return data
  }

  static async getBudgetRemaining(ventureId: string): Promise<number> {
    const { data } = await supabase
      .from('ventures')
      .select('budget_total, budget_spent')
      .eq('id', ventureId)
      .single()
    if (!data) return 0
    return data.budget_total - data.budget_spent
  }

  // -- LEARNINGS --

  static async saveLearning(learning: Omit<Learning, 'id' | 'created_at'>): Promise<void> {
    const { error } = await supabase
      .from('learnings')
      .insert(learning)
    if (error) logger.error('saveLearning error', error)
  }

  static async getRecentLearnings(ventureId: string, limit = 10): Promise<Learning[]> {
    const { data, error } = await supabase
      .from('learnings')
      .select('*')
      .eq('venture_id', ventureId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) { logger.error('getRecentLearnings error', error); return [] }
    return data || []
  }

  // -- METRICS --

  static async recordMetric(ventureId: string, metric: string, value: number, unit?: string): Promise<void> {
    const { error } = await supabase
      .from('metrics')
      .insert({ venture_id: ventureId, metric, value, unit })
    if (error) logger.error('recordMetric error', error)
  }

  static async getLatestMetrics(ventureId: string): Promise<Record<string, number>> {
    const { data } = await supabase
      .from('metrics')
      .select('metric, value')
      .eq('venture_id', ventureId)
      .order('recorded_at', { ascending: false })
      .limit(50)

    const metrics: Record<string, number> = {}
    const seen = new Set<string>()
    for (const row of (data || [])) {
      if (!seen.has(row.metric)) {
        metrics[row.metric] = row.value
        seen.add(row.metric)
      }
    }
    return metrics
  }

  // -- NOTIFICATIONS --

  static async saveNotification(notif: Omit<Notification, 'id' | 'created_at'>): Promise<Notification | null> {
    const { data, error } = await supabase
      .from('notifications')
      .insert(notif)
      .select()
      .single()
    if (error) { logger.error('saveNotification error', error); return null }
    return data
  }

  static async getPendingApprovals(ventureId: string): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('venture_id', ventureId)
      .eq('type', 'approval_request')
      .is('response', null)
    if (error) { logger.error('getPendingApprovals error', error); return [] }
    return data || []
  }

  static async handleApprovalResponse(token: string, response: 'approved' | 'rejected'): Promise<Notification | null> {
    const { data, error } = await supabase
      .from('notifications')
      .update({ response, responded_at: new Date().toISOString(), read: true })
      .eq('approval_token', token)
      .select()
      .single()
    if (error) { logger.error('handleApprovalResponse error', error); return null }
    return data
  }

  // -- REDIS CACHE --

  static async cacheSet(key: string, value: any, ttlSeconds = 3600): Promise<void> {
    await redis.setex(key, ttlSeconds, JSON.stringify(value))
  }

  static async cacheGet<T>(key: string): Promise<T | null> {
    const val = await redis.get(key)
    if (!val) return null
    return JSON.parse(val) as T
  }

  static async cacheDel(key: string): Promise<void> {
    await redis.del(key)
  }

  // -- LOOP STATE -- samengesteld overzicht

  static async buildLoopState(venture: Venture): Promise<LoopState> {
    const [currentMetrics, recentDecisions, recentLearnings, pendingApprovals] = await Promise.all([
      Memory.getLatestMetrics(venture.id),
      Memory.getRecentDecisions(venture.id, 10),
      Memory.getRecentLearnings(venture.id, 5),
      Memory.getPendingApprovals(venture.id)
    ])

    const budgetRemaining = await Memory.getBudgetRemaining(venture.id)

    return {
      venture,
      currentMetrics,
      recentDecisions,
      recentLearnings,
      pendingApprovals,
      budgetRemaining
    }
  }
}

  // -- Extra methodes --

  static async saveAccount(account: any): Promise<void> {
    const { error } = await supabase.from('accounts').insert(account)
    if (error) logger.error('saveAccount error', error)
  }

  static async updateNotification(id: string, updates: any): Promise<void> {
    const { error } = await supabase.from('notifications').update(updates).eq('id', id)
    if (error) logger.error('updateNotification error', error)
  }
