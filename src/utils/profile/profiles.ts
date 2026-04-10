/**
 * Model-channel mapping system for Claude Code.
 *
 * Allows users to define multiple model channels (each model bound to a
 * specific provider/base_url/apiKey) and switch between them at runtime
 * via /profile command.
 *
 * The primary key is the model name — selecting a model automatically
 * switches to the bound provider channel (base_url + apiKey).
 *
 * Config file: ~/.claude/profiles.json
 */

import { readFileSync } from '../fileRead.js'
import { writeFileSyncAndFlush_DEPRECATED } from '../file.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'
import { join } from 'path'
import { logForDebugging } from '../debug.js'

/**
 * A single model channel: binds a model name to a specific provider endpoint.
 */
export type ModelChannel = {
  /** Model name used as primary key (e.g. "gpt-5.4", "deepseek-r1", "claude-sonnet-4-6") */
  model: string
  /** Display label for this channel (e.g. "Codex", "DeepSeek", "本地Ollama") */
  label: string
  /** OpenAI-compatible API base URL */
  baseUrl: string
  /** API key for this endpoint */
  apiKey: string
}

export type ChannelsConfig = {
  channels: ModelChannel[]
  /** Model name of the currently active channel */
  activeModel: string | null
}

const PROFILES_FILE_NAME = 'profiles.json'

/** Default channels config - includes the current Codex GPT-5.4 setup */
export const DEFAULT_CONFIG: ChannelsConfig = {
  channels: [
    {
      model: 'gpt-5.4',
      label: 'Codex',
      baseUrl: 'https://code.ppchat.vip/v1',
      apiKey: 'sk-UinepJa4cpkfYQckBS1qKkKCAS45M5ALYi7gIL4hTutTOV5q',
    },
  ],
  activeModel: 'gpt-5.4',
}

/**
 * Legacy Profile type for migration from old profiles.json format.
 * @deprecated Use ModelChannel instead.
 */
export type Profile = {
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

/**
 * Legacy ProfilesConfig type for migration.
 * @deprecated Use ChannelsConfig instead.
 */
export type ProfilesConfig = {
  profiles: Profile[]
  activeProfile: string | null
}

function getProfilesFilePath(): string {
  return join(getClaudeConfigHomeDir(), PROFILES_FILE_NAME)
}

/** Check if a file exists (using sync fs) */
function fileExists(filePath: string): boolean {
  try {
    require('fs').accessSync(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Migrate old profiles.json format to new channels format.
 * Old: { profiles: [{name, baseUrl, apiKey, model}], activeProfile: "codex" }
 * New: { channels: [{model, label, baseUrl, apiKey}], activeModel: "gpt-5.4" }
 */
function migrateFromLegacyFormat(raw: any): ChannelsConfig {
  // If it already has channels, return as-is
  if (raw.channels && Array.isArray(raw.channels)) {
    return {
      channels: raw.channels,
      activeModel: raw.activeModel ?? null,
    }
  }

  // Migrate from old profiles format
  if (raw.profiles && Array.isArray(raw.profiles)) {
    const channels: ModelChannel[] = raw.profiles.map((p: Profile) => ({
      model: p.model,
      label: p.name, // Use old profile name as label
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
    }))

    // Find active model from activeProfile name
    let activeModel: string | null = null
    if (raw.activeProfile) {
      const activeProfile = raw.profiles.find(
        (p: Profile) => p.name === raw.activeProfile,
      )
      if (activeProfile) {
        activeModel = activeProfile.model
      }
    }

    return { channels, activeModel }
  }

  return DEFAULT_CONFIG
}

/** Load channels config from disk. Falls back to defaults if file doesn't exist. */
export function loadProfiles(): ChannelsConfig {
  const filePath = getProfilesFilePath()
  try {
    if (!fileExists(filePath)) {
      logForDebugging('profiles.json not found, creating with defaults')
      writeFileSyncAndFlush_DEPRECATED(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2))
      return DEFAULT_CONFIG
    }
    const raw = JSON.parse(readFileSync(filePath))

    // Migrate from legacy format if needed
    const config = migrateFromLegacyFormat(raw)

    // Validate and fill in defaults
    return {
      channels: config.channels ?? DEFAULT_CONFIG.channels,
      activeModel: config.activeModel ?? DEFAULT_CONFIG.activeModel,
    }
  } catch (err) {
    logForDebugging(`Failed to load profiles: ${err}, using defaults`)
    return DEFAULT_CONFIG
  }
}

/** Save channels config to disk */
export function saveProfiles(config: ChannelsConfig): void {
  const filePath = getProfilesFilePath()
  writeFileSyncAndFlush_DEPRECATED(filePath, JSON.stringify(config, null, 2))
}

/** Get a specific channel by model name, or undefined */
export function getChannelByModel(model: string): ModelChannel | undefined {
  const config = loadProfiles()
  return (config.channels || []).find(
    ch => ch.model.toLowerCase() === model.toLowerCase(),
  )
}

/** Get the currently active channel, or undefined if none set */
export function getActiveChannel(): ModelChannel | undefined {
  const config = loadProfiles()
  if (!config.activeModel) return undefined
  return (config.channels || []).find(
    ch => ch.model.toLowerCase() === config.activeModel!.toLowerCase(),
  )
}

/** Set the active channel by model name */
export function setActiveChannel(modelName: string): ModelChannel | undefined {
  const config = loadProfiles()
  const channel = (config.channels || []).find(
    ch => ch.model.toLowerCase() === modelName.toLowerCase(),
  )
  if (!channel) return undefined
  config.activeModel = channel.model
  saveProfiles(config)
  return channel
}

/** Add a new channel or update an existing one (keyed by model name) */
export function upsertChannel(channel: ModelChannel): void {
  const config = loadProfiles()
  if (!config.channels) config.channels = []
  const existingIdx = config.channels.findIndex(
    ch => ch.model.toLowerCase() === channel.model.toLowerCase(),
  )
  if (existingIdx >= 0) {
    config.channels[existingIdx] = channel
  } else {
    config.channels.push(channel)
  }
  saveProfiles(config)
}

/** Remove a channel by model name. Cannot remove the currently active one. */
export function deleteChannel(modelName: string): boolean {
  const config = loadProfiles()
  if (!config.channels) config.channels = []
  if (config.activeModel && config.activeModel.toLowerCase() === modelName.toLowerCase()) {
    return false // Cannot delete active channel
  }
  const beforeLength = config.channels.length
  config.channels = config.channels.filter(
    ch => ch.model.toLowerCase() !== modelName.toLowerCase(),
  )
  saveProfiles(config)
  return config.channels.length < beforeLength
}

/** List all available model names */
export function listModelNames(): string[] {
  return (loadProfiles().channels || []).map(ch => ch.model)
}

// ============================================================================
// Legacy compatibility functions (for gradual migration)
// ============================================================================

/** @deprecated Use getActiveChannel() instead */
export function getActiveProfile(): ModelChannel | undefined {
  return getActiveChannel()
}

/** @deprecated Use setActiveChannel() instead */
export function setActiveProfile(profileName: string): ModelChannel | undefined {
  return setActiveChannel(profileName)
}

/** @deprecated Use getChannelByModel() instead */
export function getProfileByName(name: string): ModelChannel | undefined {
  // Try model name first, then label
  const config = loadProfiles()
  return (
    (config.channels || []).find(ch => ch.model.toLowerCase() === name.toLowerCase()) ??
    (config.channels || []).find(ch => ch.label.toLowerCase() === name.toLowerCase())
  )
}

/** @deprecated Use upsertChannel() instead */
export function upsertProfile(profile: Profile): void {
  upsertChannel({
    model: profile.model,
    label: profile.name,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
  })
}

/** @deprecated Use deleteChannel() instead */
export function deleteProfile(name: string): boolean {
  return deleteChannel(name)
}

/** @deprecated Use listModelNames() instead */
export function listProfileNames(): string[] {
  return listModelNames()
}

/** @deprecated Re-export ModelChannel as Profile for compatibility */
export type { ModelChannel as ProfileType }
