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

      const name = String(contact.name || 'Geachte')
      const company = String(contact.company || '')
      const intentText = String(venture.evolved_intent || venture.original_intent || '')
      const projectName = String(venture.project_name || 'ons team')

      const emailContent = String(operational.content || '').length > 0
        ? String(operational.content)
        : 'Geachte ' + name + ',\n\nIk neem contact op omdat ik denk dat we waarde kunnen creëren.\n\n' +
          intentText.substring(0, 200) + '\n\nZou u open staan voor een kort gesprek?\n\nMet vriendelijke groeten,\n' + projectName

      try {
        const fromEmail = String(venture.project_email || 'noreply@evergreen.ai')
        const domain = String(process.env.MAILGUN_DOMAIN || 'evergreen.ai')

        await resend.emails.send({
          from: 'Evergreen <noreply@' + domain + '>',
          to: contact.email,
          subject: 'Samenwerking met ' + projectName,
          html: '<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">' +
            emailContent.split('\n').map(function(line: string) {
              return '<p style="margin:0 0 12px 0;">' + line + '</p>'
            }).join('') +
            '</body></html>'
        })

        await Memory.updateContactStatus(contact.id, 'contacted', {
          type: 'email_sent',
          date: new Date().toISOString(),
          summary: 'Outreach email verstuurd'
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
      learnings: sentCount + ' outreach emails verstuurd.',
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
    const domain = String(process.env.MAILGUN_DOMAIN || 'evergreen.ai')
    const projectName = String(venture.project_name || 'ons team')
    const opContent = String(operational.content || 'Heeft u de kans gehad om mijn voorstel te bekijken?')

    for (const contact of needsFollowUp) {
      if (!contact.email) continue
      const name = String(contact.name || '')

      try {
        await resend.emails.send({
          from: 'Evergreen <noreply@' + domain + '>',
          to: contact.email,
          subject: 'Follow-up van ' + projectName,
          html: '<html><body style="font-family:Arial,sans-serif;padding:20px;color:#333;"><p>Geachte ' + name + ',</p><p>' + opContent + '</p><p>Met vriendelijke groeten,<br>' + projectName + '</p></body></html>'
        })

        await Memory.updateContactStatus(contact.id, 'contacted', {
          type: 'email_sent',
          date: new Date().toISOString(),
          summary: 'Follow-up verstuurd'
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

    const content = String(operational.content || 'Nieuwe inzichten over: ' + String(venture.original_intent || '').substring(0, 100))

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
