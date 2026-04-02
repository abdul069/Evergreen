import { createClient } from '@supabase/supabase-js'
import Redis from 'ioredis'
import { Venture, Decision, Contact, Transaction, Learning, Notification, LoopState } from '../types'
import winston from 'winston'
import dotenv from 'dotenv'
dotenv.config()

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
})

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

export class Memory {

  static async getVenture(id: string): Promise<Venture | null> {
    const { data, error } = await supabase.from('ventures').select('*').eq('id', id).single()
    if (error) { logger.error('getVenture error ' + error.message); return null }
    return data
  }

  static async getAllActiveVentures(): Promise<Venture[]> {
    const { data, error } = await supabase.from('ventures').select('*').eq('status', 'active').order('last_active_at', { ascending: true })
    if (error) { logger.error('getAllActiveVentures error ' + error.message); return [] }
    return data || []
  }

  static async updateVenture(id: string, updates: Partial<Venture>): Promise<void> {
    const { error } = await supabase.from('ventures').update({ ...updates, last_active_at: new Date().toISOString() }).eq('id', id)
    if (error) logger.error('updateVenture error ' + error.message)
  }

  static async createVenture(data: { owner_email: string; original_intent: string; budget_total: number; approval_threshold?: number }): Promise<Venture | null> {
    const { data: venture, error } = await supabase.from('ventures').insert({
      ...data,
      status: 'bootstrapping',
      phase: 'bootstrap',
      approval_threshold: data.approval_threshold || 50,
    }).select().single()
    if (error) { logger.error('createVenture error ' + error.message); return null }
    return venture
  }

  static async saveDecision(decision: any): Promise<Decision | null> {
    const { data, error } = await supabase.from('decisions').insert(decision).select().single()
    if (error) { logger.error('saveDecision error ' + error.message); return null }
    return data
  }

  static async getRecentDecisions(ventureId: string, limit = 20): Promise<Decision[]> {
    const { data, error } = await supabase.from('decisions').select('*').eq('venture_id', ventureId).order('created_at', { ascending: false }).limit(limit)
    if (error) { logger.error('getRecentDecisions error ' + error.message); return [] }
    return data || []
  }

  static async markDecisionExecuted(id: string, result: any, success: boolean, learnings?: string): Promise<void> {
    const { error } = await supabase.from('decisions').update({ executed: true, result, success, learnings, executed_at: new Date().toISOString() }).eq('id', id)
    if (error) logger.error('markDecisionExecuted error ' + error.message)
  }

  static async saveContact(contact: any): Promise<Contact | null> {
    const { data: existing } = await supabase.from('contacts').select('id').eq('venture_id', contact.venture_id).eq('email', contact.email).single()
    if (existing) return null
    const { data, error } = await supabase.from('contacts').insert(contact).select().single()
    if (error) { logger.error('saveContact error ' + error.message); return null }
    return data
  }

  static async updateContactStatus(id: string, status: string, interaction?: any): Promise<void> {
    const { data: contact } = await supabase.from('contacts').select('interactions').eq('id', id).single()
    const interactions = contact?.interactions || []
    if (interaction) interactions.push(interaction)
    const { error } = await supabase.from('contacts').update({ status, interactions, last_contacted_at: new Date().toISOString() }).eq('id', id)
    if (error) logger.error('updateContactStatus error ' + error.message)
  }

  static async getContactsByStatus(ventureId: string, status: string): Promise<Contact[]> {
    const { data, error } = await supabase.from('contacts').select('*').eq('venture_id', ventureId).eq('status', status)
    if (error) { logger.error('getContactsByStatus error ' + error.message); return [] }
    return data || []
  }

  static async recordTransaction(tx: any): Promise<Transaction | null> {
    const { data, error } = await supabase.from('transactions').insert(tx).select().single()
    if (error) { logger.error('recordTransaction error ' + error.message); return null }
    return data
  }

  static async getBudgetRemaining(ventureId: string): Promise<number> {
    const { data } = await supabase.from('ventures').select('budget_total, budget_spent').eq('id', ventureId).single()
    if (!data) return 0
    return data.budget_total - data.budget_spent
  }

  static async saveLearning(learning: any): Promise<void> {
    const { error } = await supabase.from('learnings').insert(learning)
    if (error) logger.error('saveLearning error ' + error.message)
  }

  static async getRecentLearnings(ventureId: string, limit = 10): Promise<Learning[]> {
    const { data, error } = await supabase.from('learnings').select('*').eq('venture_id', ventureId).order('created_at', { ascending: false }).limit(limit)
    if (error) { logger.error('getRecentLearnings error ' + error.message); return [] }
    return data || []
  }

  static async recordMetric(ventureId: string, metric: string, value: number, unit?: string): Promise<void> {
    const { error } = await supabase.from('metrics').insert({ venture_id: ventureId, metric, value, unit })
    if (error) logger.error('recordMetric error ' + error.message)
  }

  static async getLatestMetrics(ventureId: string): Promise<Record<string, number>> {
    const { data } = await supabase.from('metrics').select('metric, value').eq('venture_id', ventureId).order('recorded_at', { ascending: false }).limit(50)
    const metrics: Record<string, number> = {}
    const seen = new Set<string>()
    for (const row of (data || [])) {
      if (!seen.has(row.metric)) { metrics[row.metric] = row.value; seen.add(row.metric) }
    }
    return metrics
  }

  static async saveNotification(notif: any): Promise<Notification | null> {
    const { data, error } = await supabase.from('notifications').insert(notif).select().single()
    if (error) { logger.error('saveNotification error ' + error.message); return null }
    return data
  }

  static async updateNotification(id: string, updates: any): Promise<void> {
    const { error } = await supabase.from('notifications').update(updates).eq('id', id)
    if (error) logger.error('updateNotification error ' + error.message)
  }

  static async getPendingApprovals(ventureId: string): Promise<Notification[]> {
    const { data, error } = await supabase.from('notifications').select('*').eq('venture_id', ventureId).eq('type', 'approval_request').is('response', null)
    if (error) { logger.error('getPendingApprovals error ' + error.message); return [] }
    return data || []
  }

  static async handleApprovalResponse(token: string, response: string): Promise<Notification | null> {
    const { data, error } = await supabase.from('notifications').update({ response, responded_at: new Date().toISOString(), read: true }).eq('approval_token', token).select().single()
    if (error) { logger.error('handleApprovalResponse error ' + error.message); return null }
    return data
  }

  static async saveAccount(account: any): Promise<void> {
    const { error } = await supabase.from('accounts').insert(account)
    if (error) logger.error('saveAccount error ' + error.message)
  }

  static async cacheSet(key: string, value: any, ttlSeconds = 3600): Promise<void> {
    await redis.setex(key, ttlSeconds, JSON.stringify(value))
  }

  static async cacheGet(key: string): Promise<any> {
    const val = await redis.get(key)
    if (!val) return null
    return JSON.parse(val)
  }

  static async cacheDel(key: string): Promise<void> {
    await redis.del(key)
  }

  static async buildLoopState(venture: Venture): Promise<LoopState> {
    const [currentMetrics, recentDecisions, recentLearnings, pendingApprovals] = await Promise.all([
      Memory.getLatestMetrics(venture.id),
      Memory.getRecentDecisions(venture.id, 10),
      Memory.getRecentLearnings(venture.id, 5),
      Memory.getPendingApprovals(venture.id)
    ])
    const budgetRemaining = await Memory.getBudgetRemaining(venture.id)
    return { venture, currentMetrics, recentDecisions, recentLearnings, pendingApprovals, budgetRemaining }
  }
}
