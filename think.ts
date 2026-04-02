import Anthropic from '@anthropic-ai/sdk'
import { Venture, LoopState, ThinkResult, PlannedAction } from '../types'
import { Memory } from './memory'
import { logger } from './logger'
import dotenv from 'dotenv'
dotenv.config()

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ============================================
// THINK ENGINE — Drie niveaus van denken
// ============================================
export class ThinkEngine {

  // ============================================
  // STRATEGISCH DENKEN — wekelijks
  // Claude Opus — traag, diep, duur
  // ============================================
  static async strategicThink(state: LoopState): Promise<ThinkResult> {
    logger.info(`[STRATEGIC THINK] Venture ${state.venture.id}`)

    const prompt = `
Je bent de strategische kern van een autonoom AI-organisme genaamd Evergreen.
Je taak: bepaal de beste langetermijnstrategie voor deze venture.

== INTENTIE ==
Origineel: ${state.venture.original_intent}
Geëvolueerd: ${state.venture.evolved_intent || 'Nog niet bijgesteld'}
Versie: ${state.venture.intent_version}

== HUIDIGE TOESTAND ==
Fase: ${state.venture.phase}
Loop count: ${state.venture.loop_count}
Budget resterend: €${state.budgetRemaining}
Omzet totaal: €${state.venture.revenue_total}

== METRICS ==
${JSON.stringify(state.currentMetrics, null, 2)}

== RECENTE LESSEN ==
${state.recentLearnings.map(l => `- [${l.category}] ${l.insight} (confidence: ${l.confidence})`).join('\n')}

== RECENTE BESLISSINGEN ==
${state.recentDecisions.slice(0, 5).map(d => `- ${d.action_type}: ${d.reasoning} → ${d.success ? 'succes' : 'gefaald'}`).join('\n')}

== JOUW TAAK ==
Analyseer de situatie grondig. Denk als een senior strategisch adviseur.

Beantwoord:
1. Wat is de huidige situatie echt?
2. Wat werkt? Wat werkt niet?
3. Wat is de grootste hefboom voor de komende periode?
4. Moet de intentie bijgesteld worden?
5. Welke 3-5 acties zijn strategisch het meest waardevol?

Antwoord ALLEEN in dit JSON formaat:
{
  "reasoning": "uitgebreide strategische analyse",
  "situationAssessment": "eerlijke beoordeling van huidige staat",
  "keyLeverage": "de grootste hefboom voor groei",
  "shouldEvolveIntent": false,
  "evolvedIntent": null,
  "actions": [
    {
      "type": "action_type",
      "priority": "high",
      "params": {},
      "estimatedCost": 0,
      "requiresApproval": false,
      "reasoning": "waarom deze actie"
    }
  ],
  "nextCycleMinutes": 360,
  "strategyInsight": "één cruciale strategische inzicht"
}
`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const clean = text.replace(/```json|```/g, '').trim()
      const result = JSON.parse(clean)

      return {
        reasoning: result.reasoning,
        actions: result.actions,
        nextCycleMinutes: result.nextCycleMinutes || 360,
        strategyInsight: result.strategyInsight,
        shouldEvolveIntent: result.shouldEvolveIntent,
        evolvedIntent: result.evolvedIntent
      }
    } catch (err) {
      logger.error('strategicThink error', err)
      return ThinkEngine.fallbackThink(state)
    }
  }

  // ============================================
  // TACTISCH DENKEN — dagelijks
  // Claude Sonnet — balans
  // ============================================
  static async tacticalThink(state: LoopState): Promise<ThinkResult> {
    logger.info(`[TACTICAL THINK] Venture ${state.venture.id}`)

    const prompt = `
Je bent de tactische planning module van Evergreen.
Bepaal de beste acties voor de komende 24 uur.

== CONTEXT ==
Intentie: ${state.venture.evolved_intent || state.venture.original_intent}
Fase: ${state.venture.phase}
Budget resterend: €${state.budgetRemaining}
Pending goedkeuringen: ${state.pendingApprovals.length}

== METRICS ==
${JSON.stringify(state.currentMetrics, null, 2)}

== RECENTE ACTIES ==
${state.recentDecisions.slice(0, 8).map(d => 
  `- ${d.action_type}: ${d.success ? '✓' : '✗'} — ${d.learnings || 'geen lessen'}`
).join('\n')}

== LESSEN ==
${state.recentLearnings.map(l => `- ${l.insight}`).join('\n')}

== JOUW TAAK ==
Welke 3-5 concrete acties zijn vandaag het meest waardevol?
Denk pragmatisch. Wat geeft het snelste resultaat?
Houd rekening met budget en pending goedkeuringen.

Antwoord ALLEEN in dit JSON formaat:
{
  "reasoning": "tactische analyse",
  "actions": [
    {
      "type": "send_outreach_email",
      "priority": "high",
      "params": {
        "target_criteria": "Belgische accountants met LinkedIn profiel",
        "email_approach": "waarde-eerste aanpak",
        "count": 10
      },
      "estimatedCost": 0,
      "requiresApproval": false,
      "reasoning": "waarom nu"
    }
  ],
  "nextCycleMinutes": 120
}

Beschikbare actietypes:
- send_outreach_email
- follow_up_contacts  
- research_market
- create_content
- build_feature
- setup_infrastructure
- analyze_results
- request_budget_approval
- update_strategy
- find_contacts
- send_proposal
- create_invoice
`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const clean = text.replace(/```json|```/g, '').trim()
      const result = JSON.parse(clean)

      return {
        reasoning: result.reasoning,
        actions: result.actions,
        nextCycleMinutes: result.nextCycleMinutes || 120,
      }
    } catch (err) {
      logger.error('tacticalThink error', err)
      return ThinkEngine.fallbackThink(state)
    }
  }

  // ============================================
  // OPERATIONEEL DENKEN — per actie
  // Claude Haiku — snel, goedkoop
  // ============================================
  static async operationalThink(
    venture: Venture,
    actionType: string,
    actionParams: Record<string, any>,
    context: string
  ): Promise<{ steps: string[]; content?: string; reasoning: string }> {
    logger.info(`[OPERATIONAL THINK] ${actionType}`)

    const prompt = `
Je bent de uitvoeringsmodule van Evergreen.
Voer deze specifieke actie concreet uit.

== VENTURE INTENTIE ==
${venture.evolved_intent || venture.original_intent}

== ACTIE ==
Type: ${actionType}
Parameters: ${JSON.stringify(actionParams, null, 2)}

== CONTEXT ==
${context}

== JOUW TAAK ==
Genereer de exacte uitvoering van deze actie.
Wees concreet, specifiek, klaar om te gebruiken.

Antwoord ALLEEN in dit JSON formaat:
{
  "reasoning": "waarom deze aanpak",
  "steps": ["stap 1", "stap 2"],
  "content": "de daadwerkelijke content indien van toepassing (email tekst, post tekst, code, etc.)"
}
`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const clean = text.replace(/```json|```/g, '').trim()
      return JSON.parse(clean)
    } catch (err) {
      logger.error('operationalThink error', err)
      return { steps: ['Actie mislukt door AI fout'], reasoning: 'Fallback' }
    }
  }

  // ============================================
  // ZELFEVALUATIE — wekelijks
  // ============================================
  static async selfEvaluate(state: LoopState): Promise<{
    strengths: string[]
    weaknesses: string[]
    blindSpots: string[]
    recommendation: string
    shouldChangeStrategy: boolean
  }> {
    logger.info(`[SELF EVALUATE] Venture ${state.venture.id}`)

    const allDecisions = await Memory.getRecentDecisions(state.venture.id, 50)
    const successRate = allDecisions.filter(d => d.success).length / Math.max(allDecisions.length, 1)

    const prompt = `
Je bent een kritische zelfanalyse module.
Evalueer de prestaties van deze Evergreen venture eerlijk en zonder schoonmakerij.

== INTENTIE ==
${state.venture.original_intent}

== STATISTIEKEN ==
- Loops uitgevoerd: ${state.venture.loop_count}
- Succesrate acties: ${(successRate * 100).toFixed(1)}%
- Omzet: €${state.venture.revenue_total}
- Budget gebruikt: €${state.venture.budget_spent} / €${state.venture.budget_total}
- Contacts: ${state.currentMetrics.contacts_total || 0} totaal, ${state.currentMetrics.contacts_converted || 0} geconverteerd

== RECENTE BESLISSINGEN (successen en mislukkingen) ==
${allDecisions.slice(0, 20).map(d => 
  `[${d.success ? 'OK' : 'FAIL'}] ${d.action_type}: ${d.learnings || 'geen lessen genoteerd'}`
).join('\n')}

Antwoord ALLEEN in JSON:
{
  "strengths": ["wat werkt goed"],
  "weaknesses": ["wat werkt niet"],
  "blindSpots": ["wat missen we volledig"],
  "recommendation": "de één ding dat het meeste impact zou hebben",
  "shouldChangeStrategy": false
}
`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const clean = text.replace(/```json|```/g, '').trim()
      return JSON.parse(clean)
    } catch (err) {
      logger.error('selfEvaluate error', err)
      return {
        strengths: [],
        weaknesses: ['Zelfevaluatie mislukt'],
        blindSpots: [],
        recommendation: 'Herstart systeem',
        shouldChangeStrategy: false
      }
    }
  }

  // Fallback als AI call faalt
  private static fallbackThink(state: LoopState): ThinkResult {
    return {
      reasoning: 'Fallback door AI fout — basis acties uitvoeren',
      actions: [
        {
          type: 'research_market',
          priority: 'medium',
          params: { query: state.venture.original_intent },
          reasoning: 'Altijd nuttig om markt te begrijpen'
        }
      ],
      nextCycleMinutes: 60
    }
  }
}
