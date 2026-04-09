import OpenAI from 'openai'
import { getProxyFetchOptions } from 'src/utils/proxy.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

/**
 * Environment variables:
 *
 * OPENAI_API_KEY: Required. API key for the OpenAI-compatible endpoint.
 * OPENAI_BASE_URL: Recommended. Base URL for the endpoint (e.g. http://localhost:11434/v1).
 * OPENAI_ORG_ID: Optional. Organization ID.
 * OPENAI_PROJECT_ID: Optional. Project ID.
 */

let cachedClient: OpenAI | null = null

/** Runtime overrides from /profile command, takes priority over env vars */
let profileOverrides: {
  apiKey?: string
  baseURL?: string
} | null = null

export function getOpenAIClient(options?: {
  maxRetries?: number
  fetchOverride?: typeof fetch
  source?: string
}): OpenAI {
  if (cachedClient) return cachedClient

  // Profile overrides take priority over environment variables
  const apiKey = (profileOverrides && profileOverrides.apiKey) ? profileOverrides.apiKey : (process.env.OPENAI_API_KEY || '')
  const baseURL = (profileOverrides && profileOverrides.baseURL) ? profileOverrides.baseURL : process.env.OPENAI_BASE_URL

  const client = new OpenAI({
    apiKey,
    ...(baseURL && { baseURL }),
    maxRetries: options?.maxRetries ?? 0,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10),
    dangerouslyAllowBrowser: true,
    ...(process.env.OPENAI_ORG_ID && { organization: process.env.OPENAI_ORG_ID }),
    ...(process.env.OPENAI_PROJECT_ID && { project: process.env.OPENAI_PROJECT_ID }),
    fetchOptions: getProxyFetchOptions({ forAnthropicAPI: false }) as RequestInit,
    ...(options?.fetchOverride && { fetch: options.fetchOverride }),
  })

  if (!options?.fetchOverride) {
    cachedClient = client
  }

  return client
}

/** Clear the cached client (useful when env vars change). */
export function clearOpenAIClientCache(): void {
  cachedClient = null
}

/**
 * Set profile-level overrides for base URL and API key.
 * Call this before clearing cache to switch endpoints at runtime.
 */
export function setOpenAIProfileOverrides(overrides: {
  apiKey?: string
  baseURL?: string
} | null): void {
  profileOverrides = overrides
  clearOpenAIClientCache()
}

/** Get current profile override info (for display purposes) */
export function getOpenAIProfileOverrides() {
  return profileOverrides
}
