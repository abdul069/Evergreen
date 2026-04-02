import { Resend } from 'resend'
import { Venture, PlannedAction } from '../types'
import { Memory } from '../core/memory'
import { logger } from '../core/logger'
import crypto from 'crypto'
import dotenv from 'dotenv'
dotenv.config()

const resend = new Resend(process.env.RESEND_API_KEY)

export class NotificationService {

  static async sendInfo(venture: Venture, subject: string, body: string): Promise<void> {
    await this.send(venture, 'info', subject, body)
  }

  static async sendMilestone(venture: Venture, subject: string, body: string): Promise<void> {
    await this.send(venture, 'milestone', subject, body)
  }

  static async sendStrategyChange(venture: Venture, subject: string, body: string, newIntent: string): Promise<void> {
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
        `[${venture.project_name || 'Evergreen'}] ${subject}`,
        this.wrapEmail(subject, body, venture, [
          { label: 'Goedkeuren', url: `${process.env.APP_URL}/approve/${notif.id}`, color: '#2ecc71' },
          { label: 'Weigeren', url: `${process.env.APP_URL}/reject/${notif.id}`, color: '#e74c3c' }
        ])
      )
      await Memory.updateNotification(notif.id, { sent: true })
    }
  }

  static async sendApprovalRequest(venture: Venture, amount: number, actionType: string, reasoning: string, action: PlannedAction): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex')

    const notif = await Memory.saveNotification({
      venture_id: venture.id,
      type: 'approval_request',
      subject: `Budget goedkeuring: EUR${amount} voor ${actionType}`,
      body: reasoning,
      approval_token: token,
      approval_amount: amount,
      approval_action: action,
      sent: false,
      read: false,
    })

    if (!notif) return

    const body = `Evergreen wil een aankoop doen:\n\nBedrag: EUR${amount}\nActie: ${actionType}\nRedenering: ${reasoning}\n\nBudget resterend: EUR${venture.budget_total - venture.budget_spent}`

    await this.sendEmail(
      venture.owner_email,
      `[Goedkeuring nodig] EUR${amount} voor ${actionType}`,
      this.wrapEmail(`Goedkeuring nodig: EUR${amount}`, body, venture, [
        { label: 'Goedkeuren', url: `${process.env.APP_URL}/approve/${token}`, color: '#2ecc71' },
        { label: 'Weigeren', url: `${process.env.APP_URL}/reject/${token}`, color: '#e74c3c' }
      ])
    )

    await Memory.updateNotification(notif.id, { sent: true })
    logger.info(`Goedkeuringsverzoek verstuurd naar ${venture.owner_email}`)
  }

  static async sendError(venture: Venture, error: string, context: string): Promise<void> {
    await this.send(venture, 'error', `Fout in venture ${venture.project_name || venture.id.substring(0, 8)}`, `${error}\n\nContext: ${context}`)
  }

  private static async send(venture: Venture, type: string, subject: string, body: string): Promise<void> {
    const notif = await Memory.saveNotification({
      venture_id: venture.id,
      type,
      subject,
      body,
      sent: false,
      read: false,
    })

    await this.sendEmail(
      venture.owner_email,
      `[${venture.project_name || 'Evergreen'}] ${subject}`,
      this.wrapEmail(subject, body, venture)
    )

    if (notif) {
      await Memory.updateNotification(notif.id, { sent: true })
    }
  }

  private static async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await resend.emails.send({
        from: `Evergreen <noreply@${process.env.MAILGUN_DOMAIN || 'evergreen.ai'}>`,
        to,
        subject,
        html
      })
      logger.info(`Email verstuurd naar ${to}`)
    } catch (err) {
      logger.error('Email verzending mislukt')
    }
  }

  private static wrapEmail(title: string, body: string, venture: Venture, buttons?: { label: string; url: string; color: string }[]): string {
    const buttonsHtml = buttons ? buttons.map(b => `<a href="${b.url}" style="display:inline-block;padding:12px 24px;background:${b.color};color:white;text-decoration:none;border-radius:6px;font-weight:bold;margin-right:12px;">${b.label}</a>`).join('') : ''

    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#333;">
<div style="background:#0a0a0a;padding:20px 24px;border-radius:8px 8px 0 0;">
<span style="color:#c8a96e;font-weight:700;font-size:18px;">Evergreen</span>
<span style="color:#555;margin-left:8px;font-size:13px;">${venture.project_name || venture.id.substring(0, 8)}</span>
</div>
<div style="background:white;padding:32px 24px;border-radius:0 0 8px 8px;border:1px solid #e8e8e8;">
<h2 style="margin:0 0 20px 0;">${title}</h2>
<div style="color:#555;line-height:1.7;white-space:pre-line;">${body}</div>
${buttonsHtml ? `<div style="margin-top:32px;">${buttonsHtml}</div>` : ''}
<div style="margin-top:40px;padding-top:20px;border-top:1px solid #eee;color:#999;font-size:12px;">Loop #${venture.loop_count} | Budget resterend: EUR${(venture.budget_total - venture.budget_spent).toFixed(2)}</div>
</div>
</body></html>`
  }
}
