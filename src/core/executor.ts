import { Venture, PlannedAction, ExecutionResult } from '../types'
import { ThinkEngine } from './think'
import { CommunicationTools } from '../tools/communication'
import { ResearchTools } from '../tools/research'
import { InfrastructureTools } from '../tools/infrastructure'
import { FinancialTools } from '../tools/financial'
import { SelfImprovementTools } from '../tools/selfimprove'
import winston from 'winston'
import dotenv from 'dotenv'
dotenv.config()

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
})

// Acties die NOOIT uitgevoerd mogen worden
const BLOCKED_ACTIONS = [
  'send_outreach_email',
  'follow_up_contacts',
  'send_proposal',
  'send_email',
  'email_contacts',
  'cold_email',
]

export class Executor {

  static async execute(venture: Venture, action: PlannedAction): Promise<ExecutionResult> {
    const actionType = String(action.type || '')
    logger.info('[EXECUTOR] ' + actionType)

    // Blokkeer e-mail acties volledig
    if (BLOCKED_ACTIONS.includes(actionType)) {
      logger.warn('[EXECUTOR] Geblokkeerde actie: ' + actionType + ' — geen e-mails toegestaan')
      return {
        success: false,
        error: 'Actie geblokkeerd: e-mails sturen naar mensen is niet toegestaan in deze venture.',
        significance: 0.1,
        learnings: 'Gebruik publieke platformen (Reddit, IndieHackers, ProductHunt) voor validatie. Geen directe e-mails.'
      }
    }

    try {
      const operational = await ThinkEngine.operationalThink(
        venture,
        actionType,
        action.params || {},
        'Venture fase: ' + venture.phase + ', Loop: ' + venture.loop_count
      )

      switch (actionType) {

        // ── Onderzoek ──────────────────────────────────
        case 'research_market':
          return await ResearchTools.researchMarket(
            venture,
            String(action.params?.query || venture.original_intent || ''),
            operational
          )

        case 'find_contacts':
          return await ResearchTools.findContacts(
            venture,
            String(action.params?.criteria || action.params?.query || venture.original_intent || ''),
            Number(action.params?.count) || 10,
            operational
          )

        case 'analyze_results':
          return await ResearchTools.analyzeResults(venture, operational)

        // ── Validatie via publieke platformen ──────────
        case 'validate_idea':
        case 'post_on_reddit':
        case 'post_on_indiehackers':
        case 'post_on_producthunt':
        case 'publish_on_platform':
          return await CommunicationTools.createAndPublishContent(
            venture,
            String(action.params?.platform || 'reddit'),
            operational
          )

        case 'create_content':
          return await CommunicationTools.createAndPublishContent(
            venture,
            String(action.params?.platform || 'reddit'),
            operational
          )

        // ── Bouwen ────────────────────────────────────
        case 'setup_infrastructure':
        case 'create_account':
        case 'setup_service':
          return await InfrastructureTools.setupBasicInfrastructure(venture, operational)

        case 'build_feature':
        case 'build_product':
        case 'build_mvp':
        case 'create_landing_page':
          return await InfrastructureTools.buildAndDeploy(
            venture,
            String(action.params?.feature || action.params?.description || 'MVP'),
            operational
          )

        // ── Monetisatie ───────────────────────────────
        case 'setup_payment':
        case 'create_invoice':
          return await FinancialTools.createInvoice(
            venture,
            String(action.params?.contact_id || ''),
            Number(action.params?.amount) || 0,
            String(action.params?.description || ''),
            operational
          )

        // ── Zelfverbetering ───────────────────────────
        case 'self_improve':
        case 'fix_bugs':
        case 'improve_code':
          return await SelfImprovementTools.analyzeAndFix(venture)

        case 'hotfix':
          return await SelfImprovementTools.pushHotfix(
            venture,
            String(action.params?.file || ''),
            String(action.params?.description || operational.reasoning)
          )

        // ── Strategie ─────────────────────────────────
        case 'update_strategy':
        case 'pivot':
          return {
            success: true,
            output: { reasoning: String(operational.reasoning || '') },
            significance: 0.7,
            learnings: String(operational.reasoning || '').substring(0, 200)
          }

        case 'request_budget_approval':
          return {
            success: true,
            output: { message: 'Budget goedkeuring aangevraagd' },
            significance: 0.6,
            learnings: 'Budget aanvraag verstuurd naar eigenaar'
          }

        default:
          logger.warn('Onbekend actie type: ' + actionType)
          return {
            success: false,
            error: 'Onbekend actie type: ' + actionType,
            significance: 0.1,
            learnings: 'Actie type "' + actionType + '" bestaat niet. Beschikbare types: research_market, validate_idea, build_product, create_landing_page, setup_payment, analyze_results, update_strategy, self_improve.'
          }
      }
    } catch (err: any) {
      const msg = String(err.message || 'Onbekende fout')
      logger.error('Executor fout voor ' + actionType + ': ' + msg)
      return {
        success: false,
        error: msg,
        significance: 0.3,
        learnings: actionType + ' mislukte: ' + msg.substring(0, 150) + '. Aanpak herzien in volgende cyclus.'
      }
    }
  }
}
