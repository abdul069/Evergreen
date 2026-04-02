import { Resend } from 'resend'
import { Venture, PlannedAction } from '../types'
import { Memory } from '../core/memory'
import { logger } from '../core/logger'
import crypto from 'crypto'
import dotenv from 'dotenv'
dotenv.config()

const resend = new Resend(process.env.RESEND_API_KEY)

// ============================================
// NOTIFICATION SERVICE — Communicatie met eigenaar
// ============================================
export class NotificationService {

  // ----------------------------------------
  // Info melding
  // ----------------------------------------
  static async sendInfo(venture: Venture, subject: string, body: string): Promise<void> {
    await this.send(venture, 'info', subject, body)
  }

  // ----------------------------------------
  // Milestone bereikt
  // ----------------------------------------
  static async sendMilestone(venture: Venture, subject: string, body: string): Promise<void> {
    await this.send(venture, 'milestone', subject, body)
  }

  // ----------------------------------------
  // Strategie wijziging
  // ----------------------------------------
  static async sendStrategyChange(
    venture: Venture,
    subject: string,
    body: string,
    newIntent: string
  ): Promise<void> {
    const notif = await Memory.saveNotification({
      venture_id: venture.id,
      type: 'strategy_change',
      subject,
      body,
      sent: false,
      read: false,
    })

    if (notif) {
      await this.sendEmail(
        venture.owner_email,
        `🔄 [${venture.project_name || 'Evergreen'}] ${subject}`,
        this.wrapEmail(subject, body, venture, [
          { label: 'Goedkeuren & Doorgaan', url: `${process.env.APP_URL}/approve/${notif.id}`, color: '#2ecc71' },
          { label: 'Huidige strategie behouden', url: `${process.env.APP_URL}/reject/${notif.id}`, color: '#e74c3c' }
        ])
      )

      await Memory.updateNotification(notif.id, { sent: true })
    }
  }

  // ----------------------------------------
  // Budget goedkeuring vragen
  // ----------------------------------------
  static async sendApprovalRequest(
    venture: Venture,
    amount: number,
    actionType: string,
    reasoning: string,
    action: PlannedAction
  ): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex')

    const notif = await Memory.saveNotification({
      venture_id: venture.id,
      type: 'approval_request',
      subject: `Budget goedkeuring: €${amount} voor ${actionType}`,
      body: reasoning,
      approval_token: token,
      approval_amount: amount,
      approval_action: action as any,
      sent: false,
      read: false,
    })

    if (!notif) return

    const approveUrl = `${process.env.APP_URL}/approve/${token}`
    const rejectUrl = `${process.env.APP_URL}/reject/${token}`

    const body = `
Evergreen wil een aankoop doen voor venture "${venture.project_name || venture.id.substring(0, 8)}":

💰 Bedrag: €${amount}
📋 Actie: ${actionType}
💭 Redenering: ${reasoning}

Budget resterend: €${venture.budget_total - venture.budget_spent}
    `.trim()

    await this.sendEmail(
      venture.owner_email,
      `💰 [Goedkeuring nodig] €${amount} voor ${actionType}`,
      this.wrapEmail(
        `Goedkeuring nodig: €${amount}`,
        body,
        venture,
        [
          { label: `✅ Goedkeuren (€${amount})`, url: approveUrl, color: '#2ecc71' },
          { label: '❌ Weigeren', url: rejectUrl, color: '#e74c3c' }
        ]
      )
    )

    await Memory.updateNotification(notif.id, { sent: true })
    logger.info(`💌 Goedkeuringsverzoek verstuurd naar ${venture.owner_email}`)
  }

  // ----------------------------------------
  // Fout melding
  // ----------------------------------------
  static async sendError(venture: Venture, error: string, context: string): Promise<void> {
    await this.send(
      venture,
      'error',
      `⚠️ Fout in venture ${venture.project_name || venture.id.substring(0, 8)}`,
      `Er is een fout opgetreden:\n\n${error}\n\nContext: ${context}`
    )
  }

  // ----------------------------------------
  // Basis send
  // ----------------------------------------
  private static async send(
    venture: Venture,
    type: 'info' | 'milestone' | 'error',
    subject: string,
    body: string
  ): Promise<void> {
    const notif = await Memory.saveNotification({
      venture_id: venture.id,
      type,
      subject,
      body,
      sent: false,
      read: false,
    })

    const emoji = type === 'milestone' ? '🏆' : type === 'error' ? '⚠️' : 'ℹ️'

    await this.sendEmail(
      venture.owner_email,
      `${emoji} [${venture.project_name || 'Evergreen'}] ${subject}`,
      this.wrapEmail(subject, body, venture)
    )

    if (notif) {
      await Memory.updateNotification(notif.id, { sent: true })
    }
  }

  // ----------------------------------------
  // Email versturen via Resend
  // ----------------------------------------
  private static async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await resend.emails.send({
        from: `Evergreen <noreply@${process.env.MAILGUN_DOMAIN || 'evergreen.ai'}>`,
        to,
        subject,
        html
      })
      logger.info(`📬 Email verstuurd naar ${to}: ${subject}`)
    } catch (err) {
      logger.error('Email verzending mislukt', err)
    }
  }

  // ----------------------------------------
  // Email template
  // ----------------------------------------
  private static wrapEmail(
    title: string,
    body: string,
    venture: Venture,
    buttons?: { label: string; url: string; color: string }[]
  ): string {
    const buttonsHtml = buttons ? `
      <div style="margin-top: 32px; display: flex; gap: 12px;">
        ${buttons.map(b => `
          <a href="${b.url}" style="
            display: inline-block;
            padding: 12px 24px;
            background: ${b.color};
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin-right: 12px;
          ">${b.label}</a>
        `).join('')}
      </div>
    ` : ''

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #333; background: #f9f9f9;">
  
  <div style="background: #0a0a0a; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <span style="color: #c8a96e; font-weight: 700; font-size: 18px;">🌱 Evergreen</span>
    <span style="color: #555; margin-left: 8px; font-size: 13px;">${venture.project_name || venture.id.substring(0, 8)}</span>
  </div>
  
  <div style="background: white; padding: 32px 24px; border-radius: 0 0 8px 8px; border: 1px solid #e8e8e8;">
    <h2 style="margin: 0 0 20px 0; color: #111; font-size: 20px;">${title}</h2>
    
    <div style="color: #555; line-height: 1.7; white-space: pre-line;">${body}</div>
    
    ${buttonsHtml}
    
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      Loop #${venture.loop_count} • Budget resterend: €${(venture.budget_total - venture.budget_spent).toFixed(2)} • 
      <a href="${process.env.APP_URL}/ventures/${venture.id}" style="color: #c8a96e;">Dashboard bekijken</a>
    </div>
  </div>

</body>
</html>
    `
  }
}

// Voeg updateNotification toe aan Memory class
declare module '../core/memory' {
  interface Memory {
    updateNotification(id: string, updates: any): Promise<void>
  }
}
