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

export class ResearchTools {

  static async researchMarket(
    venture: Venture,
    query: string,
    operational: any
  ): Promise<ExecutionResult> {
    logger.info('[RESEARCH] Marktonderzoek: ' + query.substring(0, 80))

    try {
      const response = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: process.env.TAVILY_API_KEY,
          query: query,
          search_depth: 'basic',
          max_results: 5,
          include_answer: true,
        },
        { timeout: 30000 }
      )

      // Extract alleen de data die we nodig hebben — geen circular refs
      const answer = String(response.data?.answer || 'Geen samenvatting beschikbaar')
      const results = (response.data?.results || []).map(function(r: any) {
        return {
          title: String(r.title || ''),
          url: String(r.url || ''),
          snippet: String((r.content || '').substring(0, 200))
        }
      })

      const summary = answer.substring(0, 500)
      const sources = results.slice(0, 3).map(function(s: any) { return s.url }).join(', ')

      await Memory.saveLearning({
        venture_id: venture.id,
        category: 'market_research',
        insight: 'Marktonderzoek voltooid: ' + summary,
        evidence: sources,
        confidence: 0.7,
        applied_count: 0
      })

      await Memory.recordMetric(venture.id, 'research_done', 1)
      await Memory.recordMetric(venture.id, 'market_research_count', 1)

      return {
        success: true,
        output: { summary: summary, sources: results.slice(0, 3), query: query },
        significance: 0.6,
        learnings: 'Marktonderzoek voltooid: ' + summary.substring(0, 150),
        metricsImpact: { research_done: 1 }
      }

    } catch (err: any) {
      const msg = err.message || 'Onbekende fout'
      logger.error('[RESEARCH] Tavily fout: ' + msg)
      return {
        success: false,
        error: msg,
        significance: 0.3,
        learnings: 'Web research faalde: ' + msg + '. Volgende cyclus opnieuw proberen.'
      }
    }
  }

  static async findContacts(
    venture: Venture,
    criteria: string,
    count: number,
    operational: any
  ): Promise<ExecutionResult> {
    logger.info('[RESEARCH] Contacten zoeken: ' + (criteria || '').substring(0, 80))

    try {
      const searchQuery = (criteria || venture.original_intent) + ' contact email België'
      const response = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: process.env.TAVILY_API_KEY,
          query: searchQuery,
          max_results: 8,
        },
        { timeout: 30000 }
      )

      const results = response.data?.results || []
      let savedCount = 0

      for (const result of results.slice(0, count)) {
        const content = String(result.content || '')
        const title = String(result.title || '')
        const url = String(result.url || '')

        // Zoek email in content
        const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
        if (emailMatch) {
          const saved = await Memory.saveContact({
            venture_id: venture.id,
            email: emailMatch[0],
            name: null,
            company: title.substring(0, 100),
            status: 'discovered',
            profile: { source: url, title: title },
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
        output: { found: savedCount, criteria: criteria },
        significance: 0.6,
        learnings: savedCount + ' nieuwe contacten gevonden voor: ' + (criteria || '').substring(0, 100),
        metricsImpact: { contacts_total: savedCount }
      }

    } catch (err: any) {
      const msg = err.message || 'Onbekende fout'
      logger.error('[RESEARCH] findContacts fout: ' + msg)
      return {
        success: false,
        error: msg,
        significance: 0.3,
        learnings: 'Contact zoeken faalde: ' + msg
      }
    }
  }

  static async analyzeResults(
    venture: Venture,
    operational: any
  ): Promise<ExecutionResult> {
    logger.info('[RESEARCH] Resultaten analyseren')

    const metrics = await Memory.getLatestMetrics(venture.id)
    const learnings = await Memory.getRecentLearnings(venture.id, 20)

    const contacts_total = metrics.contacts_total || 0
    const contacts_converted = metrics.contacts_converted || 0
    const conversionRate = contacts_total > 0 ? (contacts_converted / contacts_total * 100).toFixed(1) : '0'

    const analysis = {
      total_contacts: contacts_total,
      converted: contacts_converted,
      conversion_rate: conversionRate + '%',
      revenue: venture.revenue_total,
      key_insights: learnings.slice(0, 5).map(function(l: any) { return l.insight })
    }

    await Memory.saveLearning({
      venture_id: venture.id,
      category: 'performance_analysis',
      insight: 'Analyse: conversie ' + conversionRate + '%, omzet EUR' + venture.revenue_total,
      confidence: 0.9,
      applied_count: 0
    })

    return {
      success: true,
      output: analysis,
      significance: 0.7,
      learnings: 'Analyse voltooid. Conversie: ' + conversionRate + '%'
    }
  }
}
