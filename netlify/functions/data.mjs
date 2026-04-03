export default async (req) => {
  const SB_URL = process.env.SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_KEY

  if (!SB_URL || !SB_KEY) {
    return new Response(JSON.stringify({ error: "env vars ontbreken" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    })
  }

  const url = new URL(req.url)
  const table = url.searchParams.get("table")
  const q = url.searchParams.get("q") || "select=*&order=created_at.desc&limit=20"

  if (!table) return new Response(JSON.stringify({ error: "geen tabel" }), { status: 400 })

  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${q}`, {
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }
    })
    const data = await res.json()
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}

export const config = { path: "/api/data" }
