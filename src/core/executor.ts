import { Venture, PlannedAction, ExecutionResult } from '../types'
import { ThinkEngine } from './think'
import { CommunicationTools } from '../tools/communication'
import { ResearchTools } from '../tools/research'
import { InfrastructureTools } from '../tools/infrastructure'
import { FinancialTools } from '../tools/financial'
import { logger } from './logger'

// ============================================
// EXECUTOR — Vertaalt beslissingen naar acties
// ============================================
export class Executor {

  static async execute(venture: Venture, action: PlannedAction): Promise<ExecutionResult> {
    logger.info(`[EXECUTOR] ${action.type}`)

    try {
      // Genereer concrete uitvoering via operationeel denken
      const operational = await ThinkEngine.operationalThink(
        venture,
        action.type,
        action.params,
        `Venture fase: ${venture.phase}, Loop count: ${venture.loop_count}`
      )

      // Voer uit op basis van actie type
      switch (action.type) {

        // ----------------------------------------
        // RESEARCH
        // ----------------------------------------
        case 'research_market':
          return await ResearchTools.researchMarket(
            venture,
            action.params.query || venture.original_intent,
            operational
          )

        case 'find_contacts':
          return await ResearchTools.findContacts(
            venture,
            action.params.criteria,
            action.params.count || 10,
            operational
          )

        case 'analyze_results':
          return await ResearchTools.analyzeResults(venture, operational)

        // ----------------------------------------
        // COMMUNICATIE
        // ----------------------------------------
        case 'send_outreach_email':
          return await CommunicationTools.sendOutreachEmails(
            venture,
            action.params,
            operational
          )

        case 'follow_up_contacts':
          return await CommunicationTools.followUpContacts(venture, operational)

        case 'send_proposal':
          return await CommunicationTools.sendProposal(
            venture,
            action.params.contact_id,
            operational
          )

        case 'create_content':
          return await CommunicationTools.createAndPublishContent(
            venture,
            action.params.platform || 'linkedin',
            operational
          )

        // ----------------------------------------
        // INFRASTRUCTUUR
        // ----------------------------------------
        case 'setup_infrastructure':
          return await InfrastructureTools.setupBasicInfrastructure(venture, operational)

        case 'build_feature':
          return await InfrastructureTools.buildAndDeploy(
            venture,
            action.params.feature,
            operational
          )

        // ----------------------------------------
        // FINANCIEEL
        // ----------------------------------------
        case 'create_invoice':
          return await FinancialTools.createInvoice(
            venture,
            action.params.contact_id,
            action.params.amount,
            action.params.description,
            operational
          )

        case 'request_budget_approval':
          return {
            success: true,
            output: { message: 'Budget goedkeuring aangevraagd' },
            significance: 0.6,
            learnings: 'Budget aanvraag verstuurd naar eigenaar'
          }

        case 'update_strategy':
          return {
            success: true,
            output: { reasoning: operational.reasoning },
            significance: 0.7,
            learnings: operational.reasoning
          }

        default:
          logger.warn(`Onbekend actie type: ${action.type}`)
          return {
            success: false,
            error: `Onbekend actie type: ${action.type}`,
            significance: 0.1
          }
      }
    } catch (err: any) {
      logger.error(`Executor fout voor ${action.type}`, err)
      return {
        success: false,
        error: err.message || 'Onbekende fout',
        significance: 0.3,
        learnings: `${action.type} mislukte: ${err.message}. Aanpak herzien in volgende cyclus.`
      }
    }
  }
}
