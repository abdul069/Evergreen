export default async (req) => {
  const SB_URL = process.env.SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_KEY

  if (!SB_URL || !SB_KEY) {
    return new Response(JSON.stringify({ 
      error: "env vars ontbreken",
      has_url: !!SB_URL,
      has_key: !!SB_KEY
    }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } })
  }

  const url = new URL(req.url)
  const table = url.searchParams.get("table")
  const q = url.searchParams.get("q") || "select=*&order=created_at.desc&limit=20"

  if (!table) {
    return new Response(JSON.stringify({ error: "geen tabel" }), { 
      status: 400, 
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
    })
  }

  const supabaseUrl = `${SB_URL}/rest/v1/${table}?${q}`
  
  try {
    const res = await fetch(supabaseUrl, {
      method: "GET",
      headers: { 
        "apikey": SB_KEY, 
        "Authorization": `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    })
    
    const text = await res.text()
    
    return new Response(text, {
      status: res.status,
      headers: { 
        "Content-Type": "application/json", 
        "Access-Control-Allow-Origin": "*" 
      }
    })
  } catch (err) {
    return new Response(JSON.stringify({ 
      error: err.message,
      url: supabaseUrl,
      type: err.constructor.name
    }), { 
      status: 500, 
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    })
  }
}

export const config = { path: "/api/data" }
