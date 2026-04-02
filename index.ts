import { app } from './api/server'
import { EvergreenLoop } from './core/loop'
import { Memory } from './core/memory'
import { logger } from './core/logger'
import dotenv from 'dotenv'
dotenv.config()

// ============================================
// EVERGREEN — Entry Point
// ============================================

const PORT = process.env.PORT || 3000

async function main() {
  logger.info('🌱 Evergreen opstarten...')

  // Start API server
  app.listen(PORT, () => {
    logger.info(`🚀 API server actief op poort ${PORT}`)
  })

  // Herstel actieve ventures na herstart
  logger.info('🔄 Actieve ventures ophalen...')
  const activeVentures = await Memory.getAllActiveVentures()
  
  if (activeVentures.length === 0) {
    logger.info('📭 Geen actieve ventures. Wacht op nieuwe intenties via POST /ventures')
  } else {
    logger.info(`▶️  ${activeVentures.length} actieve ventures herstellen...`)
    
    // Start loops voor alle actieve ventures
    for (const venture of activeVentures) {
      logger.info(`  🔁 Loop starten voor: ${venture.project_name || venture.id}`)
      // Staggered start om overbelasting te vermijden
      setTimeout(() => {
        EvergreenLoop.start(venture.id)
      }, activeVentures.indexOf(venture) * 5000) // 5s tussen elke start
    }
  }

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('⛔ Shutdown signaal ontvangen...')
    process.exit(0)
  })

  process.on('SIGINT', () => {
    logger.info('⛔ Ctrl+C ontvangen...')
    process.exit(0)
  })

  logger.info('✅ Evergreen actief en klaar')
}

main().catch(err => {
  logger.error('Fatale fout bij opstarten', err)
  process.exit(1)
})
