import express from 'express'
import fs from 'fs'
import path from 'path'
import { Memory } from '../core/memory'
import { EvergreenLoop } from '../core/loop'
import { BootstrapProtocol } from '../bootstrap/protocol'
import { logger } from '../core/logger'
import dotenv from 'dotenv'
dotenv.config()

const app = express()

app.use((req: any, res: any, next: any) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.use(express.json())

app.get('/', (req: any, res: any) => {
  const origin = req.protocol + '://' + req.get('host')
  const htmlPath = path.join(__dirname, 'dashboard.html')
  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8')
    html = html.replace('__SERVER_URL__', origin)
    res.send(html)
  } else {
    res.send('<html><body><h1>Evergreen</h1><p>Dashboard niet gevonden. Voeg dashboard.html toe aan src/api/</p><p><a href="/health">Health check</a></p></body></html>')
  }
})

app.get('/health', (req: any, res: any) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() })
})

app.post('/ventures', async (req: any, res: any) => {
  const { intent, budget, owner_email, approval_threshold } = req.body
  if (!intent || !owner_email) return res.status(400).json({ error: 'intent en owner_email zijn verplicht' })
  try {
    const venture = await Memory.createVenture({
      original_intent: intent, budget_total: budget || 500,
      owner_email, approval_threshold: approval_threshold || 50
    })
    if (!venture) return res.status(500).json({ error: 'Venture aanmaken mislukt' })
    logger.info('Nieuwe venture: ' + venture.id)
    BootstrapProtocol.run(venture).then(() => EvergreenLoop.start(venture.id)).catch((err: any) => logger.error('Bootstrap fout', err))
    res.json({ success: true, venture_id: venture.id, message: 'Venture aangemaakt.' })
  } catch (err: any) { res.status(500).json({ error: err.message }) }
})

app.get('/ventures', async (req: any, res: any) => {
  const ventures = await Memory.getAllActiveVentures()
  res.json({ ventures, count: ventures.length })
})

app.get('/ventures/:id', async (req: any, res: any) => {
  const venture = await Memory.getVenture(req.params.id)
  if (!venture) return res.status(404).json({ error: 'Niet gevonden' })
  const [metrics, recentDecisions, recentLearnings, budget_remaining] = await Promise.all([
    Memory.getLatestMetrics(venture.id),
    Memory.getRecentDecisions(venture.id, 10),
    Memory.getRecentLearnings(venture.id, 10),
    Memory.getBudgetRemaining(venture.id)
  ])
  res.json({ venture, metrics, recent_decisions: recentDecisions, recent_learnings: recentLearnings, budget_remaining })
})

app.get('/approve/:token', async (req: any, res: any) => {
  const notif = await Memory.handleApprovalResponse(req.params.token, 'approved')
  if (!notif) return res.status(404).send('<html><body><h2>Token niet gevonden</h2></body></html>')
  await Memory.cacheSet('approval_' + notif.id, { response: 'approved' }, 3600)
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h1 style="color:#2ecc71">Goedgekeurd!</h1></body></html>')
})

app.get('/reject/:token', async (req: any, res: any) => {
  const notif = await Memory.handleApprovalResponse(req.params.token, 'rejected')
  await Memory.cacheSet('approval_' + (notif ? notif.id : req.params.token), { response: 'rejected' }, 3600)
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h1 style="color:#e74c3c">Geweigerd</h1></body></html>')
})

app.post('/ventures/:id/pause', async (req: any, res: any) => {
  await Memory.updateVenture(req.params.id, { status: 'paused' })
  res.json({ success: true })
})

app.post('/ventures/:id/resume', async (req: any, res: any) => {
  await Memory.updateVenture(req.params.id, { status: 'active' })
  EvergreenLoop.start(req.params.id)
  res.json({ success: true })
})

app.post('/webhook/email', async (req: any, res: any) => {
  const { recipient, body_plain } = req.body
  const ventures = await Memory.getAllActiveVentures()
  const venture = ventures.find((v: any) => v.project_email === recipient)
  if (!venture) return res.json({ success: false })
  await Memory.saveLearning({
    venture_id: venture.id, category: 'owner_instruction',
    insight: 'Eigenaar instructie: ' + (body_plain || '').substring(0, 500),
    confidence: 1.0, applied_count: 0
  })
  res.json({ success: true })
})

export { app }
