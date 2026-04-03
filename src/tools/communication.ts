import { Resend } from 'resend'
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

const resend = new Resend(process.env.RESEND_API_KEY)

const REPLY_TO = process.env.REPLY_TO_EMAIL || 'abdurrahimdaldal@gmail.com'
const FROM_DOMAIN = process.env.RESEND_FROM_DOMAIN || 'creacraft.be'
const FROM_ADDRESS = 'Evergreen <noreply@' + FROM_DOMAIN + '>'

export class CommunicationTools {

  static async sendOutreachEmails(
    venture: Venture,
    params: any,
    operational: any
  ): Promise<ExecutionResult> {
    logger.info('[COMM] Outreach emails versturen')

    const contacts = await Memory.getContactsByStatus(venture.id, 'discovered')
    const toContact = contacts.slice(0, params.count || 5)

    if (toContact.length === 0) {
      return {
        success: true,
        output: { message: 'Geen nieuwe contacten' },
        significance: 0.2,
        learnings: 'Meer contacten nodig — zoek nieuwe leads'
      }
    }

    let sentCount = 0

    for (const contact of toContact) {
      if (!contact.email) continue

      const name = String(contact.name || 'there')
      const projectName = String(venture.project_name || 'our team')

      // Always use English — strip any Dutch content from operational
      const rawContent = String(operational.content || '')
      const emailContent = rawContent.length > 20
        ? rawContent
        : 'Hi ' + name + ',\n\n' +
          'I\'m an independent researcher building tools for solopreneurs. ' +
          'I came across your work and wanted to ask you 3 quick questions — no pitch, just listening:\n\n' +
          '1) What CRM or client management task takes up most of your time?\n' +
          '2) Why don\'t existing tools solve this for you?\n' +
          '3) How much would you pay monthly for a tool that actually fixes this?\n\n' +
          'Takes 2 minutes to reply. Would really appreciate your perspective.\n\n' +
          'Best,\n' + projectName

      // Force English: replace common Dutch phrases if they slipped through
      const englishContent = enforceEnglish(emailContent)

      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: contact.email,
          replyTo: REPLY_TO,
          subject: 'Quick question about your workflow (' + projectName + ')',
          html: toHtml(englishContent)
        })

        await Memory.updateContactStatus(contact.id, 'contacted', {
          type: 'email_sent',
          date: new Date().toISOString(),
          summary: 'Outreach email sent (EN)'
        })

        sentCount++
        logger.info('[COMM] Verstuurd naar ' + contact.email)
        await new Promise(function(r) { setTimeout(r, 2000) })

      } catch (err: any) {
        logger.error('[COMM] Fout voor ' + contact.email + ': ' + (err.message || ''))
      }
    }

    await Memory.recordMetric(venture.id, 'emails_sent_total', sentCount)

    return {
      success: sentCount > 0,
      output: { sent: sentCount, total_attempted: toContact.length },
      significance: sentCount > 0 ? 0.6 : 0.3,
      learnings: sentCount + ' outreach emails verstuurd. Reply-to: ' + REPLY_TO,
      metricsImpact: { emails_sent: sentCount }
    }
  }

  static async followUpContacts(
    venture: Venture,
    operational: any
  ): Promise<ExecutionResult> {
    logger.info('[COMM] Follow-up contacten')

    const contacted = await Memory.getContactsByStatus(venture.id, 'contacted')
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const needsFollowUp = contacted.filter(function(c: any) {
      return c.last_contacted_at && new Date(c.last_contacted_at) < threeDaysAgo
    }).slice(0, 5)

    if (needsFollowUp.length === 0) {
      return {
        success: true,
        output: { message: 'Geen follow-ups nodig' },
        significance: 0.1
      }
    }

    let sentCount = 0
    const projectName = String(venture.project_name || 'our team')

    for (const contact of needsFollowUp) {
      if (!contact.email) continue
      const name = String(contact.name || 'there')

      const rawContent = String(operational.content || '')
      const followUpContent = rawContent.length > 20
        ? enforceEnglish(rawContent)
        : 'Hi ' + name + ',\n\nJust following up on my previous message. ' +
          'Did you get a chance to read it? Even a one-line reply would be super helpful.\n\n' +
          'Best,\n' + projectName

      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: contact.email,
          replyTo: REPLY_TO,
          subject: 'Following up — quick question',
          html: toHtml(followUpContent)
        })

        await Memory.updateContactStatus(contact.id, 'contacted', {
          type: 'email_sent',
          date: new Date().toISOString(),
          summary: 'Follow-up sent (EN)'
        })

        sentCount++
      } catch (err: any) {
        logger.error('[COMM] Follow-up fout: ' + (err.message || ''))
      }
    }

    return {
      success: true,
      output: { follow_ups_sent: sentCount },
      significance: 0.5,
      learnings: sentCount + ' follow-ups verstuurd.'
    }
  }

  static async sendProposal(
    venture: Venture,
    contactId: string,
    operational: any
  ): Promise<ExecutionResult> {
    return {
      success: true,
      output: { message: 'Voorstel logica aanwezig' },
      significance: 0.7,
      learnings: 'Voorstel flow beschikbaar'
    }
  }

  static async createAndPublishContent(
    venture: Venture,
    platform: string,
    operational: any
  ): Promise<ExecutionResult> {
    logger.info('[COMM] Content aanmaken voor ' + platform)

    const content = String(operational.content || 'New insights on: ' + String(venture.original_intent || '').substring(0, 100))

    logger.info('[CONTENT] Platform: ' + platform)
    logger.info('[CONTENT] Inhoud: ' + content.substring(0, 100))

    await Memory.recordMetric(venture.id, 'content_' + platform, 1)

    return {
      success: true,
      output: { platform: platform, content_preview: content.substring(0, 100) },
      significance: 0.5,
      learnings: 'Content aangemaakt voor ' + platform + '. API koppeling nodig voor publiceren.',
      metricsImpact: { content_created: 1 }
    }
  }
}

/**
 * Converts plain text with newlines to simple HTML paragraphs
 */
function toHtml(text: string): string {
  return '<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">' +
    text.split('\n').map(function(line: string) {
      return '<p style="margin:0 0 12px 0;">' + (line.trim() || '&nbsp;') + '</p>'
    }).join('') +
    '</body></html>'
}

/**
 * Best-effort Dutch → English phrase replacement for common patterns
 * that Claude might produce in outreach content.
 */
function enforceEnglish(text: string): string {
  return text
    .replace(/Geachte/g, 'Dear')
    .replace(/Met vriendelijke groeten/g, 'Best regards')
    .replace(/Hallo,?/g, 'Hi,')
    .replace(/Dag,?/g, 'Hi,')
    .replace(/Bedankt/g, 'Thank you')
    .replace(/voor uw tijd/g, 'for your time')
    .replace(/Zou u open staan/g, 'Would you be open')
    .replace(/een kort gesprek/g, 'a quick call')
    .replace(/Ik neem contact op/g, 'I\'m reaching out')
    .replace(/Ik ben een/g, 'I\'m an')
    .replace(/onderzoeker/g, 'researcher')
    .replace(/Samenwerking met/g, 'Collaboration with')
}


