import axios from 'axios'
import { Venture, ExecutionResult } from '../types'
import { Memory } from '../core/memory'
import { logger } from '../core/logger'
import dotenv from 'dotenv'
dotenv.config()

// ============================================
// INFRASTRUCTUUR TOOLS
// ============================================
export class InfrastructureTools {

  // ----------------------------------------
  // Basis infrastructuur opzetten voor nieuwe venture
  // ----------------------------------------
  static async setupBasicInfrastructure(
    venture: Venture,
    operational: { reasoning: string; steps: string[] }
  ): Promise<ExecutionResult> {
    logger.info(`[INFRA] Infrastructuur opzetten voor venture ${venture.id}`)

    const results: Record<string, any> = {}

    // Stap 1: Project email aanmaken via Mailgun
    if (!venture.project_email) {
      const email = await this.createProjectEmail(venture)
      if (email) {
        results.email = email
        await Memory.updateVenture(venture.id, { project_email: email })
        await Memory.saveAccount({
          venture_id: venture.id,
          service: 'mailgun',
          account_email: email,
          credentials: {},
          status: 'active'
        } as any)
        logger.info(`  ✉️  Project email: ${email}`)
      }
    }

    // Stap 2: Supabase project aanmaken voor venture data
    const dbProject = await this.createSupabaseProject(venture)
    if (dbProject) {
      results.database = dbProject
      await Memory.saveAccount({
        venture_id: venture.id,
        service: 'supabase',
        api_keys: { url: dbProject.url, key: dbProject.anon_key },
        status: 'active'
      } as any)
      logger.info(`  🗄️  Database aangemaakt`)
    }

    // Stap 3: GitHub repo aanmaken
    const repo = await this.createGitHubRepo(venture)
    if (repo) {
      results.repository = repo
      logger.info(`  📁 GitHub repo: ${repo.url}`)
    }

    // Update venture status naar active
    await Memory.updateVenture(venture.id, {
      status: 'active',
      phase: 'understand'
    })

    return {
      success: true,
      output: results,
      significance: 0.9,
      learnings: 'Basis infrastructuur opgezet. Venture klaar voor uitvoering.',
      metricsImpact: { infrastructure_setup: 1 }
    }
  }

  // ----------------------------------------
  // Feature bouwen en deployen
  // ----------------------------------------
  static async buildAndDeploy(
    venture: Venture,
    featureSpec: string,
    operational: { content?: string; reasoning: string; steps: string[] }
  ): Promise<ExecutionResult> {
    logger.info(`[INFRA] Feature bouwen: ${featureSpec}`)

    // In productie: gebruik Claude API om code te genereren
    // dan GitHub push + Vercel deploy

    const mockDeployment = {
      feature: featureSpec,
      status: 'planned',
      reasoning: operational.reasoning,
      steps: operational.steps,
      note: 'Volledige code generatie + deploy pipeline in volgende fase'
    }

    return {
      success: true,
      output: mockDeployment,
      significance: 0.8,
      learnings: `Feature spec aangemaakt voor: ${featureSpec}. Code generatie + deploy in Fase 3.`
    }
  }

  // ----------------------------------------
  // Project email aanmaken via Mailgun
  // ----------------------------------------
  private static async createProjectEmail(venture: Venture): Promise<string | null> {
    const projectName = venture.project_name || `venture-${venture.id.substring(0, 8)}`
    const emailAddress = `${projectName.toLowerCase().replace(/\s+/g, '-')}@${process.env.MAILGUN_DOMAIN || 'evergreen.ai'}`

    try {
      // Mailgun mailbox aanmaken
      await axios.post(
        `https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/mailboxes`,
        {
          mailbox: emailAddress.split('@')[0],
          password: this.generateSecurePassword()
        },
        {
          auth: {
            username: 'api',
            password: process.env.MAILGUN_API_KEY || ''
          }
        }
      )
      return emailAddress
    } catch (err) {
      logger.warn('Mailgun mailbox aanmaken gefaald — gebruik fallback email')
      return `${projectName.toLowerCase().replace(/\s+/g, '-')}@${process.env.MAILGUN_DOMAIN || 'evergreen.ai'}`
    }
  }

  // ----------------------------------------
  // Supabase project aanmaken
  // ----------------------------------------
  private static async createSupabaseProject(venture: Venture): Promise<any | null> {
    // Supabase Management API
    // In productie: echte API call naar api.supabase.com
    logger.info('  [INFRA] Supabase project simulatie (API key nodig)')
    return {
      url: `https://${venture.id.substring(0, 8)}.supabase.co`,
      anon_key: 'placeholder_key',
      note: 'Echte Supabase Management API integratie nodig'
    }
  }

  // ----------------------------------------
  // GitHub repo aanmaken
  // ----------------------------------------
  private static async createGitHubRepo(venture: Venture): Promise<any | null> {
    const repoName = `${venture.project_name || 'venture'}-${venture.id.substring(0, 6)}`
      .toLowerCase()
      .replace(/\s+/g, '-')

    try {
      const response = await axios.post(
        'https://api.github.com/user/repos',
        {
          name: repoName,
          private: true,
          description: `Evergreen venture: ${venture.original_intent.substring(0, 100)}`,
          auto_init: true
        },
        {
          headers: {
            Authorization: `token ${process.env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json'
          }
        }
      )

      return {
        url: response.data.html_url,
        clone_url: response.data.clone_url,
        name: repoName
      }
    } catch (err) {
      logger.warn('GitHub repo aanmaken gefaald — GitHub token nodig')
      return null
    }
  }

  private static generateSecurePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%'
    return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }
}
