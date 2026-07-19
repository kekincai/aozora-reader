import pg from 'pg'

const { Client } = pg

export default {
  async fetch(request, env) {
    if (request.method !== 'POST' || request.headers.get('x-aozora-admin-token') !== env.ADMIN_TOKEN) {
      return new Response('Not found', { status: 404 })
    }
    let client
    try {
      const body = await request.json()
      if (typeof body.text !== 'string' || !Array.isArray(body.values)) return Response.json({ error: 'Invalid SQL request' }, { status: 400 })
      client = new Client({ connectionString: env.HYPERDRIVE.connectionString })
      await client.connect()
      const result = await client.query(body.text, body.values)
      return Response.json({ rows: result.rows || [], rowCount: result.rowCount ?? 0, command: result.command })
    } catch (error) {
      return Response.json({ error: error.message, detail: error.detail, code: error.code }, { status: 500 })
    } finally {
      if (client) await client.end().catch(() => {})
    }
  },
}

