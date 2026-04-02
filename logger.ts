import winston from 'winston'

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
      return `${timestamp} ${level}: ${message}${metaStr}`
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      format: winston.format.uncolorize()
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      format: winston.format.uncolorize()
    })
  ]
})
