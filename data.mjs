export default async (req) => {
  const SB_URL = Netlify.env.get("SUPABASE_URL")
  const SB_KEY = Netlify.env.get("SUPABASE_KEY")

  if (!SB_URL || !SB_KEY) {
    return new Response(JSON.stringify({ error: "Supabase env vars niet ingesteld" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }

  const url = new URL(req.url)
  const table = url.searchParams.get("table")
  const query = url.searchParams.get("q") || "select=*&order=created_at.desc&limit=20"

  if (!table) {
    return new Response(JSON.stringify({ error: "Geen tabel opgegeven" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  }

  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
      headers: {
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
        "Content-Type": "application/json"
      }
    })

    const data = await res.json()

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
}

export const config = {
  path: "/api/data"
}
