import Anthropic from '@anthropic-ai/sdk'
import { Venture } from '../types'
import { Memory } from '../core/memory'
import { InfrastructureTools } from '../tools/infrastructure'
import { NotificationService } from '../notifications/owner'
import { logger } from '../core/logger'
import dotenv from 'dotenv'
dotenv.config()

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ============================================
// BOOTSTRAP PROTOCOL
// Elke nieuwe venture doorloopt dit éénmalig
// ============================================
export class BootstrapProtocol {

  static async run(venture: Venture): Promise<void> {
    logger.info(`\n🌱 BOOTSTRAP PROTOCOL GESTART voor venture ${venture.id}`)
    logger.info(`📋 Intentie: ${venture.original_intent}`)

    try {
      // Fase 0: Naam en identiteit genereren
      const identity = await this.generateIdentity(venture)
      await Memory.updateVenture(venture.id, {
        project_name: identity.name,
      })
      logger.info(`✅ Identiteit: ${identity.name}`)

      // Fase 1: Infrastructuur opzetten
      logger.info(`\n📦 Infrastructuur opzetten...`)
      await InfrastructureTools.setupBasicInfrastructure(venture, {
        reasoning: 'Bootstrap infrastructuur',
        steps: ['email', 'database', 'repository']
      })

      // Fase 2: Markt begrijpen
      logger.info(`\n🔍 Markt analyseren...`)
      const marketAnalysis = await this.analyzeMarket(venture)

      // Fase 3: Initiële strategie bepalen
      logger.info(`\n🎯 Strategie bepalen...`)
      const strategy = await this.defineStrategy(venture, marketAnalysis)

      // Fase 4: Sla strategie op
      await Memory.saveLearning({
        venture_id: venture.id,
        category: 'initial_strategy',
        insight: strategy.summary,
        confidence: 0.7,
        applied_count: 0
      })

      // Update venture naar active
      await Memory.updateVenture(venture.id, {
        status: 'active',
        phase: 'execute',
        evolved_intent: strategy.refinedIntent || venture.original_intent
      })

      // Stuur bevestiging aan eigenaar
      await NotificationService.sendMilestone(
        { ...venture, project_name: identity.name },
        `🚀 ${identity.name} is gestart!`,
        `
Uw venture is succesvol opgestart.

📋 Naam: ${identity.name}
🎯 Verfijnde intentie: ${strategy.refinedIntent || venture.original_intent}

📊 Marktanalyse:
${marketAnalysis.substring(0, 500)}

🗺️ Initiële strategie:
${strategy.summary}

Eerste acties worden nu uitgevoerd. U ontvangt updates bij significante ontwikkelingen.
        `.trim()
      )

      logger.info(`\n✅ BOOTSTRAP VOLTOOID — ${identity.name} is actief`)

    } catch (err) {
      logger.error('Bootstrap protocol gefaald', err)
      await Memory.updateVenture(venture.id, { status: 'paused' })
      await NotificationService.sendError(
        venture,
        err instanceof Error ? err.message : 'Onbekende fout',
        'Bootstrap protocol'
      )
    }
  }

  // ----------------------------------------
  // Genereer naam en identiteit voor venture
  // ----------------------------------------
  private static async generateIdentity(venture: Venture): Promise<{ name: string; tagline: string }> {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Genereer een korte, pakkende projectnaam (2-3 woorden max) en tagline voor dit project:

"${venture.original_intent}"

Antwoord ALLEEN in JSON: {"name": "ProjectNaam", "tagline": "korte tagline"}`
      }]
    })

    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
      const clean = text.replace(/```json|```/g, '').trim()
      return JSON.parse(clean)
    } catch {
      return {
        name: `Venture-${venture.id.substring(0, 6)}`,
        tagline: venture.original_intent.substring(0, 50)
      }
    }
  }

  // ----------------------------------------
  // Marktanalyse
  // ----------------------------------------
  private static async analyzeMarket(venture: Venture): Promise<string> {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Analyseer de markt voor het volgende project in maximaal 300 woorden.
Focus op: marktgrootte, bestaande spelers, kansen, snelste weg naar eerste resultaat.

Project: "${venture.original_intent}"
Land/context: België (tenzij anders vermeld)

Wees concreet en actionable.`
      }]
    })

    return response.content[0].type === 'text' ? response.content[0].text : ''
  }

  // ----------------------------------------
  // Initiële strategie
  // ----------------------------------------
  private static async defineStrategy(
    venture: Venture,
    marketAnalysis: string
  ): Promise<{ summary: string; refinedIntent: string; firstActions: string[] }> {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Definieer een initiële strategie voor dit project.

Intentie: "${venture.original_intent}"
Budget: €${venture.budget_total}

Marktanalyse:
${marketAnalysis}

Antwoord in JSON:
{
  "summary": "strategie samenvatting in 2-3 zinnen",
  "refinedIntent": "bijgestelde intentie indien nodig, anders null",
  "firstActions": ["eerste actie", "tweede actie", "derde actie"]
}`
      }]
    })

    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
      const clean = text.replace(/```json|```/g, '').trim()
      return JSON.parse(clean)
    } catch {
      return {
        summary: 'Strategie bepaald — uitvoering gestart',
        refinedIntent: venture.original_intent,
        firstActions: ['Marktonderzoek', 'Contacten zoeken', 'Outreach starten']
      }
    }
  }
}
