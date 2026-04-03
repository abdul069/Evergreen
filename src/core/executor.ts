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

export class Executor {

  static async execute(venture: Venture, action: PlannedAction): Promise<ExecutionResult> {
    const actionType = String(action.type || '')
    logger.info('[EXECUTOR] ' + actionType)

    try {
      const operational = await ThinkEngine.operationalThink(
        venture,
        actionType,
        action.params || {},
        'Venture fase: ' + venture.phase + ', Loop: ' + venture.loop_count
      )

      switch (actionType) {

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

        case 'send_outreach_email':
          return await CommunicationTools.sendOutreachEmails(
            venture,
            action.params || {},
            operational
          )

        case 'follow_up_contacts':
          return await CommunicationTools.followUpContacts(venture, operational)

        case 'send_proposal':
          return await CommunicationTools.sendProposal(
            venture,
            String(action.params?.contact_id || ''),
            operational
          )

        case 'create_content':
          return await CommunicationTools.createAndPublishContent(
            venture,
            String(action.params?.platform || 'linkedin'),
            operational
          )

        case 'setup_infrastructure':
          return await InfrastructureTools.setupBasicInfrastructure(venture, operational)

        case 'build_feature':
          return await InfrastructureTools.buildAndDeploy(
            venture,
            String(action.params?.feature || ''),
            operational
          )

        case 'create_invoice':
          return await FinancialTools.createInvoice(
            venture,
            String(action.params?.contact_id || ''),
            Number(action.params?.amount) || 0,
            String(action.params?.description || ''),
            operational
          )

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
            output: { reasoning: String(operational.reasoning || '') },
            significance: 0.7,
            learnings: String(operational.reasoning || '').substring(0, 200)
          }

        default:
          logger.warn('Onbekend actie type: ' + actionType)
          return {
            success: false,
            error: 'Onbekend actie type: ' + actionType,
            significance: 0.1,
            learnings: 'Actie type "' + actionType + '" bestaat niet. Gebruik bekende types.'
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
