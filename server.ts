import express from 'express'
import { Memory } from '../core/memory'
import { EvergreenLoop } from '../core/loop'
import { BootstrapProtocol } from '../bootstrap/protocol'
import { logger } from '../core/logger'
import dotenv from 'dotenv'
dotenv.config()

const app = express()
app.use(express.json())

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() })
})

// ----------------------------------------
// Nieuwe venture aanmaken
// ----------------------------------------
app.post('/ventures', async (req, res) => {
  const { intent, budget, owner_email, approval_threshold } = req.body

  if (!intent || !owner_email) {
    return res.status(400).json({ error: 'intent en owner_email zijn verplicht' })
  }

  try {
    const venture = await Memory.createVenture({
      original_intent: intent,
      budget_total: budget || 500,
      owner_email,
      approval_threshold: approval_threshold || 50,
    })

    if (!venture) {
      return res.status(500).json({ error: 'Venture aanmaken mislukt' })
    }

    logger.info(`🌱 Nieuwe venture aangemaakt: ${venture.id}`)

    // Start bootstrap in background
    BootstrapProtocol.run(venture).then(() => {
      EvergreenLoop.start(venture.id)
    }).catch(err => {
      logger.error('Bootstrap fout', err)
    })

    res.json({ 
      success: true, 
      venture_id: venture.id,
      message: 'Venture aangemaakt. Bootstrap gestart.'
    })
  } catch (err: any) {
    logger.error('POST /ventures fout', err)
    res.status(500).json({ error: err.message })
  }
})

// ----------------------------------------
// Venture status opvragen
// ----------------------------------------
app.get('/ventures/:id', async (req, res) => {
  const venture = await Memory.getVenture(req.params.id)
  if (!venture) return res.status(404).json({ error: 'Niet gevonden' })

  const metrics = await Memory.getLatestMetrics(venture.id)
  const recentDecisions = await Memory.getRecentDecisions(venture.id, 5)
  const recentLearnings = await Memory.getRecentLearnings(venture.id, 5)

  res.json({
    venture,
    metrics,
    recent_decisions: recentDecisions,
    recent_learnings: recentLearnings,
    budget_remaining: venture.budget_total - venture.budget_spent
  })
})

// ----------------------------------------
// Alle actieve ventures
// ----------------------------------------
app.get('/ventures', async (req, res) => {
  const ventures = await Memory.getAllActiveVentures()
  res.json({ ventures, count: ventures.length })
})

// ----------------------------------------
// Goedkeuring via email link
// ----------------------------------------
app.get('/approve/:token', async (req, res) => {
  const notif = await Memory.handleApprovalResponse(req.params.token, 'approved')
  
  if (!notif) {
    return res.status(404).send(`
      <html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>❌ Token niet gevonden of reeds gebruikt</h2>
      </body></html>
    `)
  }

  // Cache het antwoord zodat de loop het kan oppikken
  await Memory.cacheSet(`approval_${notif.id}`, { response: 'approved' }, 3600)

  res.send(`
    <html><body style="font-family: sans-serif; text-align: center; padding: 40px; background: #f0fff4;">
      <h1 style="color: #2ecc71;">✅ Goedgekeurd!</h1>
      <p>De actie wordt uitgevoerd in de volgende loop cyclus.</p>
      <p style="color: #999; font-size: 14px;">Je kan dit venster sluiten.</p>
    </body></html>
  `)
})

app.get('/reject/:token', async (req, res) => {
  const notif = await Memory.handleApprovalResponse(req.params.token, 'rejected')
  
  await Memory.cacheSet(`approval_${notif?.id || req.params.token}`, { response: 'rejected' }, 3600)

  res.send(`
    <html><body style="font-family: sans-serif; text-align: center; padding: 40px; background: #fff5f5;">
      <h1 style="color: #e74c3c;">❌ Geweigerd</h1>
      <p>De actie wordt niet uitgevoerd.</p>
      <p style="color: #999; font-size: 14px;">Je kan dit venster sluiten.</p>
    </body></html>
  `)
})

// ----------------------------------------
// Venture pauzeren / hervatten
// ----------------------------------------
app.post('/ventures/:id/pause', async (req, res) => {
  await Memory.updateVenture(req.params.id, { status: 'paused' })
  res.json({ success: true, message: 'Venture gepauzeerd' })
})

app.post('/ventures/:id/resume', async (req, res) => {
  await Memory.updateVenture(req.params.id, { status: 'active' })
  // Herstart loop als niet actief
  EvergreenLoop.start(req.params.id)
  res.json({ success: true, message: 'Venture hervat' })
})

// ----------------------------------------
// Eigenaar stuurt instructie via email webhook
// ----------------------------------------
app.post('/webhook/email', async (req, res) => {
  const { recipient, sender, subject, body_plain } = req.body

  // Bepaal venture op basis van ontvanger email
  const ventures = await Memory.getAllActiveVentures()
  const venture = ventures.find(v => v.project_email === recipient)

  if (!venture) {
    logger.warn(`Email ontvangen voor onbekende venture: ${recipient}`)
    return res.json({ success: false })
  }

  // Sla instructie op als learning/update
  await Memory.saveLearning({
    venture_id: venture.id,
    category: 'owner_instruction',
    insight: `Eigenaar instructie: ${body_plain?.substring(0, 500)}`,
    confidence: 1.0, // Eigenaar instructies zijn absoluut
    applied_count: 0
  })

  logger.info(`📩 Eigenaar instructie ontvangen voor ${venture.project_name}: ${subject}`)
  res.json({ success: true })
})

export { app }
