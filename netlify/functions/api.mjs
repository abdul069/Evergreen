const SB_URL = 'https://cpdlbkbbiwmzmfnqymbr.supabase.co'
const SB_KEY = process.env.SUPABASE_KEY
const AI_KEY = process.env.ANTHROPIC_API_KEY

export default async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: cors })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    // Haal Supabase data op
    if (action === 'data') {
      const table = url.searchParams.get('table') || 'ventures'
      const q = url.searchParams.get('q') || 'select=*&order=created_at.desc&limit=15'
      const r = await fetch(`${SB_URL}/rest/v1/${table}?${q}`, {
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
      })
      const data = await r.text()
      return new Response(data, { status: r.status, headers: cors })
    }

    // Update Supabase
    if (action === 'update') {
      const body = await req.json()
      const r = await fetch(`${SB_URL}/rest/v1/${body.table}?${body.filter}`, {
        method: 'PATCH',
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify(body.data)
      })
      const data = await r.text()
      return new Response(data, { status: r.status, headers: cors })
    }

    // Claude API call
    if (action === 'chat') {
      const body = await req.json()
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          system: body.system,
          messages: body.messages
        })
      })
      const data = await r.json()
      return new Response(JSON.stringify(data), { status: r.status, headers: cors })
    }

    return new Response(JSON.stringify({ error: 'Onbekende actie' }), { status: 400, headers: cors })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors })
  }
}

export const config = { path: '/api' }
