import axios from 'axios'
import Anthropic from '@anthropic-ai/sdk'
import { Venture, ExecutionResult } from '../types'
import { Memory } from '../core/memory'
import winston from 'winston'
import dotenv from 'dotenv'
dotenv.config()

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
})

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_REPO = process.env.GITHUB_REPO || 'Abdul069/Evergreen'
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main'

const FIXABLE_FILES: Record<string, string> = {
  'research_market': 'src/tools/research.ts',
  'find_contacts': 'src/tools/research.ts',
  'send_outreach_email': 'src/tools/communication.ts',
  'follow_up_contacts': 'src/tools/communication.ts',
  'create_content': 'src/tools/communication.ts',
  'strategic': 'src/core/think.ts',
  'tactical': 'src/core/think.ts',
  'operational': 'src/core/think.ts',
  'json': 'src/core/think.ts',
  'memory': 'src/core/memory.ts',
  'loop': 'src/core/loop.ts',
}

async function getFileFromGitHub(filePath: string): Promise<{ content: string; sha: string } | null> {
  if (!GITHUB_TOKEN) return null
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`
    const response = await axios.get(url, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
      }
    })
    const content = Buffer.from(response.data.content, 'base64').toString('utf8')
    return { content, sha: response.data.sha }
  } catch (err: any) {
    logger.error('GitHub read fout: ' + err.message)
    return null
  }
}

async function pushFileToGitHub(filePath: string, content: string, sha: string, message: string): Promise<boolean> {
  if (!GITHUB_TOKEN) return false
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`
    await axios.put(url, {
      message: message,
      content: Buffer.from(content).toString('base64'),
      sha: sha,
      branch: GITHUB_BRANCH
    }, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
      }
    })
    return true
  } catch (err: any) {
    logger.error('GitHub push fout: ' + err.message)
    return false
  }
}

async function generateFix(
  filePath: string,
  currentCode: string,
  errorDescription: string,
  recentErrors: string[]
): Promise<string | null> {
  const prompt = `Je bent een expert TypeScript developer die bugs fixt in een autonoom AI systeem genaamd Evergreen.

== BESTAND ==
${filePath}

== HUIDIGE CODE ==
${currentCode.substring(0, 6000)}

== FOUT(EN) ==
${errorDescription}

== RECENTE ERRORS UIT LOGS ==
${recentErrors.join('\n')}

== JOUW TAAK ==
Analyseer de code en de errors. Genereer een gecorrigeerde versie van de VOLLEDIGE code.

Regels:
- Fix ALLEEN de bugs die de errors veroorzaken
- Verander de architectuur NIET
- Gebruik GEEN unicode of speciale tekens in strings die naar JSON gaan
- Alle strings moeten veilig zijn voor JSON.stringify
- Bewaar alle bestaande functionaliteit
- TypeScript strict: gebruik 'any' waar nodig om type errors te vermijden

Geef ALLEEN de volledige gecorrigeerde code terug, zonder uitleg of markdown.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    // Verwijder eventuele code blocks
    return text.replace(/^```typescript\n?|^```ts\n?|^```\n?|```$/gm, '').trim()
  } catch (err: any) {
    logger.error('Fix generatie fout: ' + err.message)
    return null
  }
}

export class SelfImprovementTools {

  static async analyzeAndFix(venture: Venture): Promise<ExecutionResult> {
    logger.info('[SELF-IMPROVE] Analyse van bugs gestart')

    if (!GITHUB_TOKEN) {
      return {
        success: false,
        error: 'GITHUB_TOKEN niet geconfigureerd',
        significance: 0.8,
        learnings: 'Zelfverbetering vereist GITHUB_TOKEN in environment variables'
      }
    }

    // Haal recente learnings op met errors
    const learnings = await Memory.getRecentLearnings(venture.id, 30)
    const decisions = await Memory.getRecentDecisions(venture.id, 20)

    // Identificeer welke bestanden errors hebben
    const errorsByFile: Record<string, string[]> = {}

    for (const learning of learnings) {
      const insight = String(learning.insight || '')
      if (!insight.toLowerCase().includes('mislukt') &&
          !insight.toLowerCase().includes('error') &&
          !insight.toLowerCase().includes('fout')) continue

      // Bepaal welk bestand gefixed moet worden
      for (const [keyword, filePath] of Object.entries(FIXABLE_FILES)) {
        if (insight.toLowerCase().includes(keyword) ||
            String(learning.category || '').toLowerCase().includes(keyword)) {
          if (!errorsByFile[filePath]) errorsByFile[filePath] = []
          errorsByFile[filePath].push(insight.substring(0, 200))
          break
        }
      }
    }

    // Voeg ook recente beslissingsfouten toe
    for (const decision of decisions) {
      if (!decision.success && decision.error_message) {
        const errorMsg = String(decision.error_message || '')
        const actionType = String(decision.action_type || '')

        for (const [keyword, filePath] of Object.entries(FIXABLE_FILES)) {
          if (actionType.toLowerCase().includes(keyword) ||
              errorMsg.toLowerCase().includes(keyword)) {
            if (!errorsByFile[filePath]) errorsByFile[filePath] = []
            errorsByFile[filePath].push(errorMsg.substring(0, 200))
            break
          }
        }
      }
    }

    if (Object.keys(errorsByFile).length === 0) {
      return {
        success: true,
        output: { message: 'Geen bugs gedetecteerd' },
        significance: 0.3,
        learnings: 'Systeem werkt correct — geen zelfverbetering nodig'
      }
    }

    logger.info('[SELF-IMPROVE] Bestanden met bugs: ' + Object.keys(errorsByFile).join(', '))

    const fixes: string[] = []
    const failed: string[] = []

    // Fix elk bestand
    for (const [filePath, errors] of Object.entries(errorsByFile)) {
      logger.info('[SELF-IMPROVE] Bezig met: ' + filePath)

      // Lees huidige code
      const file = await getFileFromGitHub(filePath)
      if (!file) {
        failed.push(filePath + ' (lezen mislukt)')
        continue
      }

      // Genereer fix
      const errorDescription = [...new Set(errors)].join('\n')
      const fixedCode = await generateFix(filePath, file.content, errorDescription, errors)

      if (!fixedCode || fixedCode.length < 100) {
        failed.push(filePath + ' (fix generatie mislukt)')
        continue
      }

      // Valideer dat het TypeScript lijkt
      if (!fixedCode.includes('export') && !fixedCode.includes('import')) {
        failed.push(filePath + ' (ongeldige code gegenereerd)')
        continue
      }

      // Push naar GitHub
      const commitMsg = `[Evergreen] Auto-fix: ${filePath.split('/').pop()} - ${errorDescription.substring(0, 60)}`
      const pushed = await pushFileToGitHub(filePath, fixedCode, file.sha, commitMsg)

      if (pushed) {
        fixes.push(filePath)
        logger.info('[SELF-IMPROVE] ✅ Fix gepusht: ' + filePath)

        await Memory.saveLearning({
          venture_id: venture.id,
          category: 'self_improvement',
          insight: 'Automatische fix gepusht voor ' + filePath + '. Errors: ' + errorDescription.substring(0, 150),
          confidence: 0.8,
          applied_count: 1
        })

        // Wacht even tussen pushes
        await new Promise(r => setTimeout(r, 3000))
      } else {
        failed.push(filePath + ' (push mislukt)')
      }
    }

    const success = fixes.length > 0

    return {
      success,
      output: {
        files_fixed: fixes,
        files_failed: failed,
        total_errors_analyzed: Object.values(errorsByFile).flat().length
      },
      significance: success ? 0.9 : 0.5,
      learnings: success
        ? `Zelfverbetering succesvol: ${fixes.length} bestanden gefixed (${fixes.join(', ')}). Railway deployt automatisch.`
        : `Zelfverbetering mislukt voor: ${failed.join(', ')}`,
      metricsImpact: { self_improvements: fixes.length }
    }
  }

  static async pushHotfix(
    venture: Venture,
    filePath: string,
    fixDescription: string
  ): Promise<ExecutionResult> {
    logger.info('[SELF-IMPROVE] Hotfix voor: ' + filePath)

    if (!GITHUB_TOKEN) {
      return { success: false, error: 'GITHUB_TOKEN ontbreekt', significance: 0.5 }
    }

    const file = await getFileFromGitHub(filePath)
    if (!file) {
      return { success: false, error: 'Bestand niet gevonden: ' + filePath, significance: 0.5 }
    }

    const fixedCode = await generateFix(filePath, file.content, fixDescription, [fixDescription])
    if (!fixedCode) {
      return { success: false, error: 'Fix generatie mislukt', significance: 0.5 }
    }

    const pushed = await pushFileToGitHub(
      filePath,
      fixedCode,
      file.sha,
      `[Evergreen] Hotfix: ${fixDescription.substring(0, 60)}`
    )

    return {
      success: pushed,
      output: { file: filePath, description: fixDescription },
      significance: 0.9,
      learnings: pushed ? 'Hotfix gepusht voor ' + filePath : 'Hotfix mislukt voor ' + filePath
    }
  }
}
