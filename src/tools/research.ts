import axios from 'axios'
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

async function tavilySearch(query: string, maxResults: number = 5): Promise<any> {
  const cleanQuery = String(query || '').substring(0, 200).replace(/[\x00-\x1F\x7F]/g, ' ').trim()
  if (!cleanQuery) throw new Error('Lege zoekterm')

  const body = {
    api_key: String(process.env.TAVILY_API_KEY || ''),
    query: cleanQuery,
    search_depth: 'basic',
    max_results: Math.min(maxResults, 10),
    include_answer: true
  }

  const response = await axios({
    method: 'POST',
    url: 'https://api.tavily.com/search',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    timeout: 30000
  })

  return response.data
}

function extractResults(data: any): { answer: string; results: any[] } {
  const answer = String(data?.answer || 'Geen samenvatting')
  const results = Array.isArray(data?.results) ? data.results.map(function(r: any) {
    return {
      title: String(r?.title || ''),
      url: String(r?.url || ''),
      snippet: String((r?.content || '').substring(0, 300))
    }
  }) : []
  return { answer, results }
}

export class ResearchTools {

  static async researchMarket(venture: Venture, query: string, operational: any): Promise<ExecutionResult> {
    const q = String(query || venture.original_intent || '').substring(0, 200)
    logger.info('[RESEARCH] Marktonderzoek: ' + q.substring(0, 80))

    try {
      const data = await tavilySearch(q)
      const { answer, results } = extractResults(data)
      const summary = answer.substring(0, 500)
      const sources = results.slice(0, 3).map(function(s) { return s.url }).join(', ')

      await Memory.saveLearning({
        venture_id: venture.id,
        category: 'market_research',
        insight: 'Marktonderzoek: ' + summary.substring(0, 300),
        evidence: sources,
        confidence: 0.7,
        applied_count: 0
      })

      await Memory.recordMetric(venture.id, 'research_done', 1)
      await Memory.recordMetric(venture.id, 'market_research_count', 1)

      return {
        success: true,
        output: { summary: summary, sources: results.slice(0, 3), query: q },
        significance: 0.6,
        learnings: 'Marktonderzoek: ' + summary.substring(0, 150),
        metricsImpact: { research_done: 1 }
      }
    } catch (err: any) {
      const msg = String(err.message || 'Onbekende fout')
      logger.error('[RESEARCH] Tavily fout: ' + msg)
      return {
        success: false,
        error: msg,
        significance: 0.3,
        learnings: 'Web research faalde: ' + msg.substring(0, 100)
      }
    }
  }

  static async findContacts(venture: Venture, criteria: string, count: number, operational: any): Promise<ExecutionResult> {
    const c = String(criteria || venture.original_intent || '').substring(0, 150)
    logger.info('[RESEARCH] Contacten zoeken: ' + c.substring(0, 80))

    try {
      // Eenvoudige query zonder speciale parameters die 400 geven
      const searchQuery = c + ' email contact'
      const data = await tavilySearch(searchQuery, 8)
      const { results } = extractResults(data)

      let savedCount = 0
      for (const result of results.slice(0, count)) {
        const content = String(result.snippet || '')
        const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
        if (emailMatch) {
          const saved = await Memory.saveContact({
            venture_id: venture.id,
            email: emailMatch[0],
            name: null,
            company: String(result.title || '').substring(0, 100),
            status: 'discovered',
            profile: { source: String(result.url || ''), title: String(result.title || '') },
            interactions: [],
            actual_value: 0,
            discovered_via: 'web_search'
          })
          if (saved) savedCount++
        }
      }

      await Memory.recordMetric(venture.id, 'contacts_discovered', savedCount)

      return {
        success: true,
        output: { found: savedCount, criteria: c },
        significance: savedCount > 0 ? 0.6 : 0.3,
        learnings: savedCount + ' contacten gevonden voor: ' + c.substring(0, 100),
        metricsImpact: { contacts_total: savedCount }
      }
    } catch (err: any) {
      const msg = String(err.message || 'Onbekende fout')
      logger.error('[RESEARCH] findContacts fout: ' + msg)
      return {
        success: false,
        error: msg,
        significance: 0.3,
        learnings: 'Contact zoeken faalde: ' + msg.substring(0, 100)
      }
    }
  }

  static async analyzeResults(venture: Venture, operational: any): Promise<ExecutionResult> {
    logger.info('[RESEARCH] Resultaten analyseren')

    const metrics = await Memory.getLatestMetrics(venture.id)
    const learnings = await Memory.getRecentLearnings(venture.id, 10)

    const contacts_total = Number(metrics.contacts_total || 0)
    const contacts_converted = Number(metrics.contacts_converted || 0)
    const conversionRate = contacts_total > 0 ? (contacts_converted / contacts_total * 100).toFixed(1) : '0'
    const research_done = Number(metrics.research_done || 0)

    const analysis = {
      total_contacts: contacts_total,
      converted: contacts_converted,
      conversion_rate: conversionRate + '%',
      revenue: String(venture.revenue_total || 0),
      research_done: research_done,
      key_insights: learnings.slice(0, 3).map(function(l: any) {
        return String(l.insight || '').substring(0, 100)
      })
    }

    await Memory.saveLearning({
      venture_id: venture.id,
      category: 'performance_analysis',
      insight: 'Analyse: conversie ' + conversionRate + '%, research: ' + research_done + ', contacts: ' + contacts_total,
      confidence: 0.9,
      applied_count: 0
    })

    return {
      success: true,
      output: analysis,
      significance: 0.7,
      learnings: 'Analyse: conversie ' + conversionRate + '%, ' + contacts_total + ' contacten, ' + research_done + ' onderzoeken'
    }
  }
}
