import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { useCallback, useEffect, useState } from 'react'

export type CloudUser = { id: string; displayName: string }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(data.error || '通信に失敗しました。')
  return data
}

export function passkeyAvailable() {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && window.isSecureContext
}

export function useAuth() {
  const [user, setUser] = useState<CloudUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ user: CloudUser | null }>('/api/me')
      setUser(result.user)
    } catch { setUser(null) } finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const register = async (displayName: string) => {
    if (!passkeyAvailable()) throw new Error('このブラウザはパスキーに対応していません。')
    const start = await api<{ challengeID: string; options: PublicKeyCredentialCreationOptionsJSON }>('/api/auth/register/options', { method: 'POST', body: JSON.stringify({ displayName }) })
    const response = await startRegistration({ optionsJSON: start.options })
    const result = await api<{ user: CloudUser }>('/api/auth/register/verify', { method: 'POST', body: JSON.stringify({ challengeID: start.challengeID, response }) })
    setUser(result.user)
    return result.user
  }

  const login = async () => {
    if (!passkeyAvailable()) throw new Error('このブラウザはパスキーに対応していません。')
    const start = await api<{ challengeID: string; options: PublicKeyCredentialRequestOptionsJSON }>('/api/auth/login/options', { method: 'POST', body: '{}' })
    const response = await startAuthentication({ optionsJSON: start.options })
    const result = await api<{ user: CloudUser }>('/api/auth/login/verify', { method: 'POST', body: JSON.stringify({ challengeID: start.challengeID, response }) })
    setUser(result.user)
    return result.user
  }

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST', body: '{}' })
    setUser(null)
  }

  return { user, loading, register, login, logout }
}

export async function loadCloudState<T>() {
  return api<{ state: T | null; updatedAt: number | null }>('/api/state')
}

export async function saveCloudState<T>(state: T) {
  return api<{ saved: true; updatedAt: number }>('/api/state', { method: 'PUT', body: JSON.stringify({ state }) })
}
