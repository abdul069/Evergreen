import { Venture, LoopState, ThinkResult, PlannedAction, ExecutionResult } from '../types'
import { Memory } from './memory'
import { ThinkEngine } from './think'
import { Executor } from './executor'
import { NotificationService } from '../notifications/owner'
import { logger } from './logger'

// ============================================
// DE ONEINDIGE LOOP — Het hart van Evergreen
// ============================================
export class EvergreenLoop {

  private static runningVentures = new Map<string, boolean>()

  // ============================================
  // Start de loop voor één venture
  // Draait voor altijd. Stopt nooit.
  // ============================================
  static async start(ventureId: string): Promise<void> {
    if (this.runningVentures.get(ventureId)) {
      logger.warn(`Loop al actief voor venture ${ventureId}`)
      return
    }

    this.runningVentures.set(ventureId, true)
    logger.info(`🌱 Loop gestart voor venture ${ventureId}`)

    while (this.runningVentures.get(ventureId)) {
      try {
        await this.tick(ventureId)
      } catch (err) {
        logger.error(`Loop error voor venture ${ventureId}`, err)
        await this.sleep(5 * 60 * 1000)
      }
    }
  }

  static stop(ventureId: string): void {
    this.runningVentures.set(ventureId, false)
    logger.info(`Loop gestopt voor venture ${ventureId}`)
  }

  // ============================================
  // TICK — Één cyclus van de loop
  // ============================================
  private static async tick(ventureId: string): Promise<void> {
    const venture = await Memory.getVenture(ventureId)
    if (!venture) {
      logger.error(`Venture ${ventureId} niet gevonden`)
      this.stop(ventureId)
      return
    }

    if (venture.status === 'paused' || venture.status === 'archived') {
      logger.info(`Venture ${ventureId} is ${venture.status} — wachten`)
      await this.sleep(10 * 60 * 1000)
      return
    }

    logger.info(`\n${'='.repeat(50)}`)
    logger.info(`🔄 TICK #${venture.loop_count + 1} — Venture: ${venture.project_name || ventureId}`)
    logger.info(`${'='.repeat(50)}`)

    // 1. Observeer huidige toestand
    const state = await Memory.buildLoopState(venture)
    logger.info(`💰 Budget resterend: €${state.budgetRemaining}`)
    logger.info(`📊 Metrics: ${JSON.stringify(state.currentMetrics)}`)

    // 2. Bepaal welk niveau van denken nodig is
    const thinkLevel = this.determineThinkLevel(venture)
    logger.info(`🧠 Denkniveau: ${thinkLevel}`)

    // 3. Denk
    let thinkResult: ThinkResult
    if (thinkLevel === 'strategic') {
      thinkResult = await ThinkEngine.strategicThink(state)
    } else {
      thinkResult = await ThinkEngine.tacticalThink(state)
    }

    logger.info(`💭 Redenering: ${thinkResult.reasoning.substring(0, 200)}...`)

    // 4. Sla de strategische beslissing op
    await Memory.saveDecision({
      venture_id: ventureId,
      level: thinkLevel,
      context_summary: `Loop #${venture.loop_count + 1} — ${thinkLevel} denken`,
      context_full: { metrics: state.currentMetrics, budget: state.budgetRemaining },
      reasoning: thinkResult.reasoning,
      action_type: 'planning',
      action_params: { planned_actions: thinkResult.actions },
      executed: true,
      success: true,
      significance: thinkLevel === 'strategic' ? 0.8 : 0.5
    })

    // 5. Voer acties uit (gesorteerd op prioriteit)
    const sortedActions = this.sortByPriority(thinkResult.actions)
    for (const action of sortedActions) {
      await this.executeAction(state, action)
    }

    // 6. Intentie evolutie indien nodig
    if (thinkResult.shouldEvolveIntent && thinkResult.evolvedIntent) {
      await this.handleIntentEvolution(venture, thinkResult.evolvedIntent)
    }

    // 7. Zelfevaluatie — elke 12 cycli (sneller dan voorheen voor nieuwe venture)
    if (venture.loop_count > 0 && venture.loop_count % 12 === 0) {
      await this.runSelfEvaluation(state)
    }

    // 8. Update loop status
    const nextLoop = new Date(Date.now() + thinkResult.nextCycleMinutes * 60 * 1000)
    await Memory.updateVenture(ventureId, {
      loop_count: venture.loop_count + 1,
      last_loop_at: new Date().toISOString(),
      next_loop_at: nextLoop.toISOString(),
      loop_interval_minutes: thinkResult.nextCycleMinutes
    })

    logger.info(`✅ Tick voltooid. Volgende cyclus in ${thinkResult.nextCycleMinutes} minuten`)

    // 9. Wacht tot volgende cyclus
    await this.sleep(thinkResult.nextCycleMinutes * 60 * 1000)
  }

  // ============================================
  // Voer één actie uit
  // ============================================
  private static async executeAction(state: LoopState, action: PlannedAction): Promise<void> {
    logger.info(`\n⚡ Actie: ${action.type} (${action.priority})`)
    logger.info(`   Reden: ${action.reasoning}`)

    // Check budget indien kost
    if (action.estimatedCost && action.estimatedCost > 0) {
      if (action.estimatedCost > state.budgetRemaining) {
        logger.warn(`   ❌ Onvoldoende budget (${action.estimatedCost} > ${state.budgetRemaining})`)
        return
      }

      if (action.requiresApproval || action.estimatedCost > state.venture.approval_threshold) {
        const approved = await this.requestApproval(state.venture, action)
        if (!approved) {
          logger.info(`   ⏸️ Wacht op goedkeuring van eigenaar`)
          return
        }
      }
    }

    // Sla actie op
    const decision = await Memory.saveDecision({
      venture_id: state.venture.id,
      level: 'operational',
      context_summary: `Uitvoering: ${action.type}`,
      context_full: { action, metrics: state.currentMetrics },
      reasoning: action.reasoning || 'Geen redenering opgegeven',
      action_type: action.type,
      action_params: action.params,
      executed: false,
      significance: action.priority === 'critical' ? 0.9 : action.priority === 'high' ? 0.7 : 0.4
    })

    // Voer uit via Executor
    const result = await Executor.execute(state.venture, action)

    // Update beslissing met resultaat
    if (decision) {
      await Memory.markDecisionExecuted(
        decision.id,
        result.output,
        result.success,
        result.learnings
      )
    }

    // Sla lessen op
    if (result.learnings) {
      await Memory.saveLearning({
        venture_id: state.venture.id,
        category: action.type,
        insight: result.learnings,
        confidence: result.success ? 0.8 : 0.6,
        applied_count: 1
      })
    }

    // Update metrics
    if (result.metricsImpact) {
      for (const [metric, value] of Object.entries(result.metricsImpact)) {
        await Memory.recordMetric(state.venture.id, metric, value)
      }
    }

    // Notificeer bij significante resultaten
    if (result.significance > 0.7) {
      await NotificationService.sendMilestone(
        state.venture,
        `Significante actie: ${action.type}`,
        `${action.reasoning}\n\nResultaat: ${result.success ? 'Succes' : 'Mislukt'}\n${JSON.stringify(result.output, null, 2)}`
      )
    }

    logger.info(`   ${result.success ? '✅' : '❌'} Resultaat: ${result.success ? 'Succes' : result.error}`)
  }

  // ============================================
  // Goedkeuring vragen aan eigenaar
  // ============================================
  private static async requestApproval(venture: Venture, action: PlannedAction): Promise<boolean> {
    const pending = await Memory.getPendingApprovals(venture.id)
    const existing = pending.find(p => p.approval_action?.type === action.type)

    if (existing) {
      const updated = await Memory.cacheGet<{ response: string }>(`approval_${existing.id}`)
      if (updated?.response === 'approved') return true
      if (updated?.response === 'rejected') return false
      return false
    }

    await NotificationService.sendApprovalRequest(
      venture,
      action.estimatedCost || 0,
      action.type,
      action.reasoning,
      action
    )

    return false
  }

  // ============================================
  // Intentie evolutie
  // ============================================
  private static async handleIntentEvolution(venture: Venture, newIntent: string): Promise<void> {
    logger.info(`🔄 Intentie evolutie: ${newIntent.substring(0, 100)}`)

    await NotificationService.sendStrategyChange(
      venture,
      `Intentie bijstelling voorgesteld`,
      `Op basis van de data stel ik voor de intentie bij te stellen:\n\nOrigineel: ${venture.original_intent}\n\nNieuwe richting: ${newIntent}\n\nIk voer deze wijziging door tenzij je binnen 24u reageert.`,
      newIntent
    )

    await Memory.updateVenture(venture.id, {
      evolved_intent: newIntent,
      intent_version: venture.intent_version + 1
    })
  }

  // ============================================
  // Zelfevaluatie
  // ============================================
  private static async runSelfEvaluation(state: LoopState): Promise<void> {
    logger.info(`🔍 Zelfevaluatie`)

    const evaluation = await ThinkEngine.selfEvaluate(state)

    await NotificationService.sendInfo(
      state.venture,
      'Zelfevaluatie',
      `
Sterke punten:
${evaluation.strengths.map(s => `• ${s}`).join('\n')}

Zwakke punten:
${evaluation.weaknesses.map(w => `• ${w}`).join('\n')}

Blinde vlekken:
${evaluation.blindSpots.map(b => `• ${b}`).join('\n')}

Aanbeveling:
${evaluation.recommendation}
      `.trim()
    )

    await Memory.saveLearning({
      venture_id: state.venture.id,
      category: 'self_evaluation',
      insight: evaluation.recommendation,
      confidence: 0.9,
      applied_count: 0
    })
  }

  // ============================================
  // Bepaal denkniveau
  // Nieuwe venture: vaker strategisch in het begin
  // ============================================
  private static determineThinkLevel(venture: Venture): 'strategic' | 'tactical' {
    if (venture.loop_count === 0) return 'strategic'
    // Eerste 5 loops: elke 2 cycli strategisch (snel richting bepalen)
    if (venture.loop_count < 10 && venture.loop_count % 2 === 0) return 'strategic'
    // Daarna: elke 8 cycli strategisch
    if (venture.loop_count % 8 === 0) return 'strategic'
    return 'tactical'
  }

  private static sortByPriority(actions: PlannedAction[]): PlannedAction[] {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    return [...actions].sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2))
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

