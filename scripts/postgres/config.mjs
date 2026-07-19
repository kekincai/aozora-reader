import pg from 'pg'

const { Client, Pool } = pg

class HttpSqlClient {
  constructor(endpoint, token) {
    this.endpoint = endpoint
    this.token = token
  }

  async connect() {}

  async query(text, values = []) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-aozora-admin-token': this.token },
      body: JSON.stringify({ text, values }),
    })
    const result = await response.json()
    if (!response.ok) {
      const error = new Error(result.error || `Remote SQL returned ${response.status}`)
      error.detail = result.detail
      throw error
    }
    return result
  }

  async end() {}
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function sslConfig() {
  if ((process.env.PGSSLMODE || 'require') === 'disable') return false
  return {
    rejectUnauthorized: process.env.PGSSLREJECTUNAUTHORIZED === 'true',
    minVersion: process.env.PGSSLMINVERSION || 'TLSv1.3',
  }
}

export function connectionConfig(database = process.env.PGDATABASE || 'aozora_reader') {
  return {
    host: required('PGHOST'),
    port: Number(process.env.PGPORT || 5432),
    database,
    user: required('PGUSER'),
    password: required('PGPASSWORD'),
    ssl: sslConfig(),
    connectionTimeoutMillis: Number(process.env.PGCONNECT_TIMEOUT_MS || 10_000),
    application_name: process.env.PGAPPNAME || 'aozora-reader-importer',
  }
}

export function createClient(database) {
  if (process.env.PGHTTP_ENDPOINT) {
    return new HttpSqlClient(process.env.PGHTTP_ENDPOINT, required('PGHTTP_TOKEN'))
  }
  return new Client(connectionConfig(database))
}

export function createPool(database) {
  return new Pool({
    ...connectionConfig(database),
    max: Number(process.env.PGPOOL_MAX || 4),
    idleTimeoutMillis: 30_000,
  })
}

export function safeIdentifier(value, label = 'identifier') {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Invalid ${label}: ${value}`)
  return `"${value}"`
}
