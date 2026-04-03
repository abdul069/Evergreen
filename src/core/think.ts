import Anthropic from '@anthropic-ai/sdk'
import { Venture, LoopState, ThinkResult, PlannedAction } from '../types'
import { Memory } from './memory'
import winston from 'winston'
import dotenv from 'dotenv'
dotenv.config()

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
})

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function parseJSON(text: string): any {
  // 1. Strip markdown fences
  let clean = text.replace(/^```(?:json|typescript|ts)?\s*/gim, '').replace(/```\s*$/gim, '').trim()

  // 2. Verwijder control characters (behoud newline/tab als spatie)
  clean = clean.replace(/[\x00-\x1F\x7F]/g, function(c) {
    if (c === '\n' || c === '\r' || c === '\t') return ' '
    return ''
  })

  // 3. Verwijder trailing commas voor ] of }
  clean = clean.replace(/,\s*([\]}])/g, '$1')

  // 4. Probeer direct parsen
  try { return JSON.parse(clean) } catch (_) {}

  // 5. Extraheer eerste { ... } blok
  const objMatch = clean.match(/\{[\s\S]*\}/)
  if (objMatch) {
    let candidate = objMatch[0].replace(/,\s*([\]}])/g, '$1')

    // 5a. Probeer het blok direct
    try { return JSON.parse(candidate) } catch (_) {}

    // 5b. Afgekapte JSON: sluit open arrays en objecten
    candidate = closeOpenJSON(candidate)
    try { return JSON.parse(candidate) } catch (_) {}

    // 5c. Kap af bij laatste geldig sluitend teken
    const lastBrace = candidate.lastIndexOf('}')
    if (lastBrace > 0) {
      try { return JSON.parse(candidate.substring(0, lastBrace + 1)) } catch (_) {}
    }
  }

  // 6. Laatste poging: de hele tekst afsluiten
  const closed = closeOpenJSON(clean)
  try { return JSON.parse(closed) } catch (e: any) {
    throw new Error('parseJSON mislukt: ' + e.message + ' | input: ' + clean.substring(0, 120))
  }
}

/**
 * Sluit open JSON-structuren door ontbrekende ] en } toe te voegen.
 * Werkt voor afgekapte Claude-output.
 */
function closeOpenJSON(text: string): string {
  const stack: string[] = []
  let inString = false
  let escape = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }

  // Verwijder eventuele trailing komma voor de sluitende tekens
  let result = text.replace(/,\s*$/, '')
  while (stack.length > 0) {
    result += stack.pop()
  }
  return result
}

export class ThinkEngine {

  static async strategicThink(state: LoopState): Promise<ThinkResult> {
    logger.info('[STRATEGIC THINK] Venture ' + state.venture.id)

    const prompt = 'Je bent de strategische kern van een autonoom AI-organisme genaamd Evergreen.\n\n' +
      '== INTENTIE ==\n' +
      'Origineel: ' + state.venture.original_intent + '\n' +
      'Geevolueerd: ' + (state.venture.evolved_intent || 'Nog niet') + '\n\n' +
      '== TOESTAND ==\n' +
      'Fase: ' + state.venture.phase + '\n' +
      'Loop: ' + state.venture.loop_count + '\n' +
      'Budget: EUR' + state.budgetRemaining + '\n' +
      'Omzet: EUR' + state.venture.revenue_total + '\n\n' +
      '== RECENTE LESSEN ==\n' +
      state.recentLearnings.map(function(l) { return '- ' + l.insight }).join('\n') + '\n\n' +
      '== RECENTE BESLISSINGEN ==\n' +
      state.recentDecisions.slice(0, 5).map(function(d) {
        return '- ' + d.action_type + ': ' + (d.success ? 'succes' : 'gefaald')
      }).join('\n') + '\n\n' +
      'Analyseer de situatie en geef de beste strategie.\n\n' +
      'Antwoord ALLEEN in dit JSON formaat zonder speciale tekens:\n' +
      '{"reasoning":"analyse","actions":[{"type":"research_market","priority":"high","params":{"query":"zoekterm"},"estimatedCost":0,"requiresApproval":false,"reasoning":"waarom"}],"nextCycleMinutes":120,"strategyInsight":"inzicht","shouldEvolveIntent":false,"evolvedIntent":null}'

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const result = parseJSON(text)

      return {
        reasoning: String(result.reasoning || ''),
        actions: Array.isArray(result.actions) ? result.actions : [],
        nextCycleMinutes: Number(result.nextCycleMinutes) || 120,
        strategyInsight: result.strategyInsight ? String(result.strategyInsight) : undefined,
        shouldEvolveIntent: result.shouldEvolveIntent === true,
        evolvedIntent: result.evolvedIntent ? String(result.evolvedIntent) : undefined
      }
    } catch (err: any) {
      logger.error('strategicThink error: ' + err.message)
      return ThinkEngine.fallbackThink(state)
    }
  }

  static async tacticalThink(state: LoopState): Promise<ThinkResult> {
    logger.info('[TACTICAL THINK] Venture ' + state.venture.id)

    const prompt = 'Je bent de tactische planning module van Evergreen.\n\n' +
      '== CONTEXT ==\n' +
      'Intentie: ' + (state.venture.evolved_intent || state.venture.original_intent) + '\n' +
      'Fase: ' + state.venture.phase + '\n' +
      'Budget: EUR' + state.budgetRemaining + '\n' +
      'Loop: ' + state.venture.loop_count + '\n\n' +
      '== RECENTE ACTIES ==\n' +
      state.recentDecisions.slice(0, 8).map(function(d) {
        return '- ' + d.action_type + ': ' + (d.success ? 'OK' : 'FAIL') + ' - ' + (d.learnings || '')
      }).join('\n') + '\n\n' +
      'Welke 3-5 concrete acties zijn nu het meest waardevol?\n\n' +
      'Antwoord ALLEEN in JSON zonder speciale tekens:\n' +
      '{"reasoning":"analyse","actions":[{"type":"research_market","priority":"high","params":{"query":"zoekterm"},"estimatedCost":0,"requiresApproval":false,"reasoning":"waarom"}],"nextCycleMinutes":60}\n\n' +
      'Beschikbare actietypes: research_market, find_contacts, send_outreach_email, follow_up_contacts, create_content, analyze_results, update_strategy'

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const result = parseJSON(text)

      return {
        reasoning: String(result.reasoning || ''),
        actions: Array.isArray(result.actions) ? result.actions : [],
        nextCycleMinutes: Number(result.nextCycleMinutes) || 60
      }
    } catch (err: any) {
      logger.error('tacticalThink error: ' + err.message)
      return ThinkEngine.fallbackThink(state)
    }
  }

  static async operationalThink(
    venture: Venture,
    actionType: string,
    actionParams: Record<string, any>,
    context: string
  ): Promise<{ steps: string[]; content?: string; reasoning: string }> {
    logger.info('[OPERATIONAL THINK] ' + actionType)

    const prompt = 'Je bent de uitvoeringsmodule van Evergreen.\n\n' +
      '== VENTURE ==\n' +
      (venture.evolved_intent || venture.original_intent) + '\n\n' +
      '== ACTIE ==\n' +
      'Type: ' + actionType + '\n' +
      'Parameters: ' + JSON.stringify(actionParams) + '\n\n' +
      '== CONTEXT ==\n' +
      context + '\n\n' +
      'Genereer de concrete uitvoering. Gebruik GEEN speciale tekens of unicode in je antwoord.\n\n' +
      'Antwoord ALLEEN in JSON:\n' +
      '{"reasoning":"waarom","steps":["stap 1","stap 2"],"content":"de daadwerkelijke inhoud indien van toepassing"}'

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const result = parseJSON(text)

      return {
        reasoning: String(result.reasoning || ''),
        steps: Array.isArray(result.steps) ? result.steps.map(String) : ['Actie uitvoeren'],
        content: result.content ? String(result.content) : undefined
      }
    } catch (err: any) {
      logger.error('operationalThink error: ' + err.message)
      return {
        reasoning: 'Fallback door parse fout',
        steps: ['Actie uitvoeren met standaard parameters'],
        content: undefined
      }
    }
  }

  static async selfEvaluate(state: LoopState): Promise<{
    strengths: string[]
    weaknesses: string[]
    blindSpots: string[]
    recommendation: string
    shouldChangeStrategy: boolean
  }> {
    logger.info('[SELF EVALUATE] Venture ' + state.venture.id)

    const allDecisions = await Memory.getRecentDecisions(state.venture.id, 50)
    const successRate = allDecisions.length > 0
      ? allDecisions.filter(function(d) { return d.success }).length / allDecisions.length
      : 0

    const prompt = 'Evalueer deze venture eerlijk.\n\n' +
      'Intentie: ' + state.venture.original_intent + '\n' +
      'Succesrate: ' + (successRate * 100).toFixed(1) + '%\n' +
      'Omzet: EUR' + state.venture.revenue_total + '\n' +
      'Loops: ' + state.venture.loop_count + '\n\n' +
      'Antwoord in JSON zonder speciale tekens:\n' +
      '{"strengths":["sterk punt"],"weaknesses":["zwak punt"],"blindSpots":["blinde vlek"],"recommendation":"aanbeveling","shouldChangeStrategy":false}'

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const result = parseJSON(text)

      return {
        strengths: Array.isArray(result.strengths) ? result.strengths.map(String) : [],
        weaknesses: Array.isArray(result.weaknesses) ? result.weaknesses.map(String) : [],
        blindSpots: Array.isArray(result.blindSpots) ? result.blindSpots.map(String) : [],
        recommendation: String(result.recommendation || ''),
        shouldChangeStrategy: result.shouldChangeStrategy === true
      }
    } catch (err: any) {
      logger.error('selfEvaluate error: ' + err.message)
      return {
        strengths: [],
        weaknesses: ['Zelfevaluatie mislukt'],
        blindSpots: [],
        recommendation: 'Herstart strategisch denken',
        shouldChangeStrategy: false
      }
    }
  }

  static fallbackThink(state: LoopState): ThinkResult {
    return {
      reasoning: 'Fallback door AI fout - basis acties uitvoeren',
      actions: [
        {
          type: 'research_market',
          priority: 'medium',
          params: { query: String(state.venture.original_intent || '').substring(0, 100) },
          reasoning: 'Altijd nuttig om markt te begrijpen'
        }
      ],
      nextCycleMinutes: 60
    }
  }
}
