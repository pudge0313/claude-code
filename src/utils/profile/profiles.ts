/**
 * Multi-endpoint profile system for Claude Code.
 * 
 * Allows users to define multiple API endpoint profiles (each with base URL, 
 * API key, and default model) and switch between them at runtime via /profile command.
 * 
 * Config file: ~/.claude/profiles.json
 */

import { readFileSync } from '../fileRead.js'
import { writeFileSyncAndFlush_DEPRECATED } from '../file.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'
import { join } from 'path'
import { logForDebugging } from '../debug.js'

export type Profile = {
  /** Unique profile name (e.g. "codex", "local", "deepseek") */
  name: string
  /** OpenAI-compatible API base URL */
  baseUrl: string
  /** API key for this endpoint */
  apiKey: string
  /** Default model name for this profile */
  model: string
}

export type ProfilesConfig = {
  profiles: Profile[]
  /** Name of the currently active profile */
  activeProfile: string | null
}

const PROFILES_FILE_NAME = 'profiles.json'

/** Default profiles config - includes the current Codex GPT-5.4 setup */
export const DEFAULT_CONFIG: ProfilesConfig = {
  profiles: [
    {
      name: 'codex',
      baseUrl: 'https://code.ppchat.vip/v1',
      apiKey: 'sk-UinepJa4cpkfYQckBS1qKkKCAS45M5ALYi7gIL4hTutTOV5q',
      model: 'gpt-5.4',
    },
  ],
  activeProfile: 'codex',
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

/** Load profiles config from disk. Falls back to defaults if file doesn't exist. */
export function loadProfiles(): ProfilesConfig {
  const filePath = getProfilesFilePath()
  try {
    if (!fileExists(filePath)) {
      logForDebugging('profiles.json not found, creating with defaults')
      writeFileSyncAndFlush_DEPRECATED(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2))
      return DEFAULT_CONFIG
    }
    const raw = readFileSync(filePath)
    const parsed = JSON.parse(raw) as Partial<ProfilesConfig>
    // Validate and fill in defaults
    return {
      profiles: parsed.profiles ?? DEFAULT_CONFIG.profiles,
      activeProfile: parsed.activeProfile ?? DEFAULT_CONFIG.activeProfile,
    }
  } catch (err) {
    logForDebugging(`Failed to load profiles: ${err}, using defaults`)
    return DEFAULT_CONFIG
  }
}

/** Save profiles config to disk */
export function saveProfiles(config: ProfilesConfig): void {
  const filePath = getProfilesFilePath()
  writeFileSyncAndFlush_DEPRECATED(filePath, JSON.stringify(config, null, 2))
}

/** Get a specific profile by name, or undefined */
export function getProfileByName(name: string): Profile | undefined {
  const config = loadProfiles()
  return (config.profiles || []).find(p => p.name === name)
}

/** Get the currently active profile, or undefined if none set */
export function getActiveProfile(): Profile | undefined {
  const config = loadProfiles()
  if (!config.activeProfile) return undefined
  return (config.profiles || []).find(p => p.name === config.activeProfile)
}

/** Set the active profile by name */
export function setActiveProfile(profileName: string): Profile | undefined {
  const config = loadProfiles()
  const profile = (config.profiles || []).find(p => p.name === profileName)
  if (!profile) return undefined
  config.activeProfile = profileName
  saveProfiles(config)
  return profile
}

/** Add a new profile or update an existing one */
export function upsertProfile(profile: Profile): void {
  const config = loadProfiles()
  if (!config.profiles) config.profiles = []
  const existingIdx = config.profiles.findIndex(p => p.name === profile.name)
  if (existingIdx >= 0) {
    config.profiles[existingIdx] = profile
  } else {
    config.profiles.push(profile)
  }
  saveProfiles(config)
}

/** Remove a profile by name. Cannot remove the currently active one. */
export function deleteProfile(name: string): boolean {
  const config = loadProfiles()
  if (!config.profiles) config.profiles = []
  if (config.activeProfile === name) {
    return false // Cannot delete active profile
  }
  const beforeLength = config.profiles.length
  config.profiles = config.profiles.filter(p => p.name !== name)
  saveProfiles(config)
  return config.profiles.length < beforeLength
}

/** List all available profile names */
export function listProfileNames(): string[] {
  return (loadProfiles().profiles || []).map(p => p.name)
}
