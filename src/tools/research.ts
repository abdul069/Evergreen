import axios from 'axios'
import { Venture, ExecutionResult } from '../types'
import { Memory } from '../core/memory'
import { logger } from '../core/logger'
import dotenv from 'dotenv'
dotenv.config()

// ============================================
// RESEARCH TOOLS
// ============================================
export class ResearchTools {

  // ----------------------------------------
  // Marktonderzoek via Tavily
  // ----------------------------------------
  static async researchMarket(
    venture: Venture,
    query: string,
    operational: { reasoning: string; content?: string }
  ): Promise<ExecutionResult> {
    logger.info(`[RESEARCH] Marktonderzoek: ${query}`)

    try {
      const response = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: process.env.TAVILY_API_KEY,
          query: query,
          search_depth: 'advanced',
          max_results: 10,
          include_answer: true,
        },
        { timeout: 30000 }
      )

      const results = response.data
      const summary = results.answer || 'Geen directe samenvatting beschikbaar'
      const sources = results.results?.map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.substring(0, 200)
      })) || []

      // Sla bevindingen op als learning
      await Memory.saveLearning({
        venture_id: venture.id,
        category: 'market_research',
        insight: summary,
        evidence: sources.slice(0, 3).map((s: any) => s.url).join(', '),
        confidence: 0.7,
        applied_count: 0
      })

      await Memory.recordMetric(venture.id, 'market_research_count', 1)

      return {
        success: true,
        output: { summary, sources: sources.slice(0, 5), query },
        significance: 0.6,
        learnings: `Marktonderzoek voltooid: ${summary.substring(0, 200)}`,
        metricsImpact: { research_done: 1 }
      }

    } catch (err: any) {
      logger.error('Tavily research fout', err)
      return {
        success: false,
        error: err.message,
        significance: 0.3,
        learnings: 'Web research faalde — check Tavily API key'
      }
    }
  }

  // ----------------------------------------
  // Contacten vinden
  // ----------------------------------------
  static async findContacts(
    venture: Venture,
    criteria: string,
    count: number,
    operational: { reasoning: string; content?: string }
  ): Promise<ExecutionResult> {
    logger.info(`[RESEARCH] Contacten zoeken: ${criteria}`)

    // In productie: Apollo.io API, Hunter.io, LinkedIn Sales Navigator
    // Voor MVP: web research om profielen te vinden

    try {
      const searchQuery = `${criteria} email contact België`
      const response = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: process.env.TAVILY_API_KEY,
          query: searchQuery,
          max_results: 10,
        },
        { timeout: 30000 }
      )

      // Parse resultaten naar contact profielen
      const contacts = this.parseContactsFromResults(
        response.data.results || [],
        venture.id
      )

      let savedCount = 0
      for (const contact of contacts.slice(0, count)) {
        const saved = await Memory.saveContact(contact)
        if (saved) savedCount++
      }

      await Memory.recordMetric(venture.id, 'contacts_discovered', savedCount)

      return {
        success: true,
        output: { found: contacts.length, saved: savedCount, criteria },
        significance: 0.6,
        learnings: `${savedCount} nieuwe contacten gevonden voor criteria: ${criteria}`,
        metricsImpact: { contacts_total: savedCount }
      }

    } catch (err: any) {
      logger.error('findContacts fout', err)
      return {
        success: false,
        error: err.message,
        significance: 0.3,
        learnings: 'Contact search faalde — alternatieve bronnen overwegen'
      }
    }
  }

  // ----------------------------------------
  // Resultaten analyseren
  // ----------------------------------------
  static async analyzeResults(
    venture: Venture,
    operational: { reasoning: string }
  ): Promise<ExecutionResult> {
    logger.info(`[RESEARCH] Resultaten analyseren`)

    const metrics = await Memory.getLatestMetrics(venture.id)
    const learnings = await Memory.getRecentLearnings(venture.id, 20)

    // Bereken key performance indicators
    const conversionRate = metrics.contacts_total > 0
      ? (metrics.contacts_converted || 0) / metrics.contacts_total
      : 0

    const emailOpenRate = metrics.emails_sent > 0
      ? (metrics.emails_opened || 0) / metrics.emails_sent
      : 0

    const analysis = {
      total_contacts: metrics.contacts_total || 0,
      converted: metrics.contacts_converted || 0,
      conversion_rate: `${(conversionRate * 100).toFixed(1)}%`,
      emails_sent: metrics.emails_sent_total || 0,
      email_open_rate: `${(emailOpenRate * 100).toFixed(1)}%`,
      revenue: venture.revenue_total,
      budget_efficiency: venture.revenue_total / Math.max(venture.budget_spent, 1),
      key_insights: learnings.slice(0, 5).map(l => l.insight)
    }

    await Memory.saveLearning({
      venture_id: venture.id,
      category: 'performance_analysis',
      insight: `Conversie: ${analysis.conversion_rate}, Omzet: €${venture.revenue_total}`,
      confidence: 0.9,
      applied_count: 0
    })

    return {
      success: true,
      output: analysis,
      significance: 0.7,
      learnings: `Analyse voltooid. Conversie rate: ${analysis.conversion_rate}. ${conversionRate < 0.02 ? 'Aanpak bijsturen nodig.' : 'Goede richting.'}`
    }
  }

  // ----------------------------------------
  // Helper: parse web resultaten naar contacten
  // ----------------------------------------
  private static parseContactsFromResults(results: any[], ventureId: string): any[] {
    const contacts = []

    for (const result of results) {
      // Zoek email patronen in de tekst
      const emailMatch = result.content?.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
      const nameMatch = result.title?.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/)

      if (emailMatch) {
        contacts.push({
          venture_id: ventureId,
          email: emailMatch[0],
          name: nameMatch?.[1] || null,
          company: null,
          status: 'discovered',
          profile: { source: result.url, title: result.title },
          interactions: [],
          actual_value: 0,
          discovered_via: 'web_search'
        })
      }
    }

    return contacts
  }
}
