import { c as _c } from "react/compiler-runtime";
import chalk from 'chalk';
import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { Select } from '../../components/CustomSelect/index.js';
import { Box, Text } from '../../ink.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import {
  loadProfiles,
  setActiveProfile,
  getActiveProfile,
  upsertProfile,
  deleteProfile,
  type Profile as ProfileType,
} from '../../utils/profile/profiles.js';
import {
  setOpenAIProfileOverrides,
  getOpenAIProfileOverrides,
} from '../../services/api/openai/client.js';

/** Show current profile info */
function ShowCurrentProfile({
  onDone
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}) {
  const active = getActiveProfile();
  const overrides = getOpenAIProfileOverrides();

  React.useEffect(() => {
    if (active) {
      // Mask API key for display
      const maskedKey = active.apiKey.length > 8
        ? `${active.apiKey.slice(0, 6)}...${active.apiKey.slice(-4)}`
        : '****';
      onDone(
        `Active profile: ${chalk.bold(active.name)}\n` +
        `  URL:    ${active.baseUrl}\n` +
        `  Model:  ${active.model}\n` +
        `  Key:    ${maskedKey}` +
        (overrides ? chalk.dim(' (profile override)') : ''),
        { display: 'system' }
      );
    } else if (overrides) {
      const maskedKey = overrides.apiKey && overrides.apiKey.length > 8
        ? `${overrides.apiKey.slice(0, 6)}...${overrides.apiKey.slice(-4)}`
        : '****';
      onDone(
        `Using custom endpoint (no named profile)\n` +
        `  URL: ${overrides.baseURL ?? '(env var)'}\n` +
        `  Key: ${maskedKey}`,
        { display: 'system' }
      );
    } else {
      onDone('No active profile. Using environment variables for API configuration.', { display: 'system' });
    }
  }, [onDone]);

  return null;
}

/** List all available profiles */
function ListProfiles({
  onDone
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}) {
  const config = loadProfiles();
  const profiles = config.profiles || [];
  const activeName = config.activeProfile;

  React.useEffect(() => {
    if (profiles.length === 0) {
      onDone('No profiles configured. Use /profile add <name> to create one.', { display: 'system' });
      return;
    }

    let output = 'Available profiles:\n';
    for (const p of profiles) {
      const isActive = p.name === activeName ? chalk.green(' [active]') : '';
      const maskedKey = p.apiKey.length > 8
        ? `${p.apiKey.slice(0, 6)}...${p.apiKey.slice(-4)}`
        : '****';
      output += `  ${chalk.bold(p.name)}${isActive}\n`;
      output += `    URL:   ${p.baseUrl}\n`;
      output += `    Model: ${p.model}\n`;
      output += `    Key:   ${maskedKey}\n`;
    }
    onDone(output.trim(), { display: 'system' });
  }, [onDone]);

  return null;
}

/**
 * Parse add/delete subcommand args.
 * Format: /profile add name url api_key model
 *         /profile delete name
 * Returns null if not a subcommand.
 */
function parseSubcommand(args: string): {
  action: string
  name: string
  rest: string[]
} | null {
  const parts = args.trim().split(/\s+/);
  if (!parts[0] || !['add', 'delete', 'del', 'rm', 'list', 'ls', 'info'].includes(parts[0])) {
    return null;
  }
  return {
    action: parts[0] === 'del' || parts[0] === 'rm' ? 'delete' : parts[0] === 'ls' ? 'list' : parts[0],
    name: parts[1] || '',
    rest: parts.slice(2),
  };
}

/** Handle inline subcommands like /profile list, /profile add, /profile delete */
function HandleSubcommand({
  args,
  onDone,
}: {
  args: string;
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}): React.ReactNode {
  const setAppState = useSetAppState();
  const parsed = parseSubcommand(args);

  React.useEffect(() => {
    if (!parsed) return; // Not a subcommand, caller will show picker

    switch (parsed.action) {
      case 'list': {
        const config = loadProfiles();
        const profiles = config.profiles || [];
        if (profiles.length === 0) {
          onDone('No profiles configured. Use /profile add to create one.', { display: 'system' });
          return;
        }
        let out = 'Configured profiles:\n';
        for (const p of profiles) {
          const active = p.name === config.activeProfile ? chalk.green(' *') : '';
          out += `  ${p.name}${active} — ${p.model} @ ${p.baseUrl}\n`;
        }
        onDone(out.trim(), { display: 'system' });
        break;
      }

      case 'info':
        // Fall through - will be handled by ShowCurrentProfile via parent logic
        break;

      case 'add': {
        if (!parsed.name) {
          onDone(chalk.yellow('Usage: /profile add <name> <base_url> <api_key> <model>'), { display: 'system' });
          return;
        }
        if (parsed.rest.length < 3) {
          onDone(
            chalk.yellow('Usage: /profile add <name> <base_url> <api_key> <model>\n') +
            'Example: /profile add local http://localhost:11434/v1 sk-xxx llama3',
            { display: 'system' }
          );
          return;
        }
        const newProfile: ProfileType = {
          name: parsed.name,
          baseUrl: parsed.rest[0],
          apiKey: parsed.rest[1],
          model: parsed.rest[2],
        };
        upsertProfile(newProfile);
        onDone(`Profile ${chalk.bold(parsed.name)} added/updated.\n` +
          `  URL:   ${newProfile.baseUrl}\n` +
          `  Model: ${newProfile.model}\n\n` +
          `Switch with: /profile ${parsed.name}`, { display: 'system' });
        break;
      }

      case 'delete': {
        if (!parsed.name) {
          onDone(chalk.yellow('Usage: /profile delete <name>'), { display: 'system' });
          return;
        }
        const ok = deleteProfile(parsed.name);
        if (!ok) {
          onDone(chalk.red(`Cannot delete profile "${parsed.name}" — it's the active profile or doesn't exist.`), { display: 'system' });
        } else {
          onDone(`Profile ${chalk.bold(parsed.name)} deleted.`, { display: 'system' });
        }
        break;
      }
    }
  }, [args, onDone]);

  if (!parsed || parsed.action === 'info') {
    return null; // Let parent handle it
  }
  return null;
}

/** Interactive profile selector using the same style as model picker */
function ProfilePicker({
  onDone,
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}) {
  const setAppState = useSetAppState();
  const mainLoopModel = useAppState(s => s.mainLoopModel);

  const config = React.useMemo(() => loadProfiles(), []);

  const profileOptions = React.useMemo(
    () =>
      (config.profiles || []).map(p => ({
        label: `${p.name}${p.name === config.activeProfile ? ' (current)' : ''}`,
        value: p.name,
        description: `${p.model} @ ${p.baseUrl}`,
      })),
    [config]
  );

  function handleChange(profileName: string) {
    const profile = (config.profiles || []).find(p => p.name === profileName);
    if (!profile) {
      onDone(`Profile "${profileName}" not found.`, { display: 'system' });
      return;
    }

    // Apply the profile
    setActiveProfile(profileName);
    setOpenAIProfileOverrides({
      apiKey: profile.apiKey,
      baseURL: profile.baseUrl,
    });

    // Set model via environment variable (original modelMapping.ts picks this up)
    if (profile.model) {
      process.env.OPENAI_MODEL = profile.model;
    }

    // Also update the model to the profile's default
    setAppState(prev => ({
      ...prev,
      mainLoopModel: profile.model,
      mainLoopModelForSession: null,
    }));

    const maskedKey = profile.apiKey.length > 8
      ? `${profile.apiKey.slice(0, 6)}...${profile.apiKey.slice(-4)}`
      : '****';

    onDone(
      `Switched to profile ${chalk.bold(profileName)}\n` +
      `  URL:   ${profile.baseUrl}\n` +
      `  Model: ${chalk.bold(profile.model)}\n` +
      `  Key:   ${maskedKey}`,
      { display: 'system' }
    );
  }

  if (profileOptions.length === 0) {
    React.useEffect(() => {
      onDone(
        'No profiles configured yet.\n' +
        chalk.dim('Use /profile add <name> <url> <key> <model> to add one.'),
        { display: 'system' }
      );
    }, [onDone]);
    return null;
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Switch API Endpoint Profile</Text>
      <Text dimColor>Select a profile or press Escape to cancel</Text>
      <Box marginTop={1}>
        <Select
          options={profileOptions}
          onChange={handleChange}
          onCancel={() => onDone('Kept current profile.', { display: 'system' })}
          layout="compact-vertical"
        />
      </Box>
    </Box>
  );
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  args = args?.trim() || '';

  // No arguments → show interactive picker
  if (!args) {
    return <ProfilePicker onDone={onDone} />;
  }

  // /profile info → show current
  if (args.toLowerCase() === 'info' || args.toLowerCase() === 'show' || args.toLowerCase() === 'current') {
    return <ShowCurrentProfile onDone={onDone} />;
  }

  // /profile list → show all
  if (args.toLowerCase() === 'list' || args.toLowerCase() === 'ls') {
    return <ListProfiles onDone={onDone} />;
  }

  // Check if it's a direct profile name (switch by name)
  const parsed = parseSubcommand(args);
  if (!parsed) {
    // Treat arg as a profile name to switch to directly
    const config = loadProfiles();
    const targetProfile = (config.profiles || []).find(p => p.name.toLowerCase() === args.toLowerCase());

    if (targetProfile) {
      // Switch to this profile immediately
      setActiveProfile(targetProfile.name);
      setOpenAIProfileOverrides({
        apiKey: targetProfile.apiKey,
        baseURL: targetProfile.baseUrl,
      });

      // Set model via environment variable
      if (targetProfile.model) {
        process.env.OPENAI_MODEL = targetProfile.model;
      }

      // We need to update the model too, but we can't access setAppState outside of React.
      // Instead, we'll signal that the user should know about the model change.
      const maskedKey = targetProfile.apiKey.length > 8
        ? `${targetProfile.apiKey.slice(0, 6)}...${targetProfile.apiKey.slice(-4)}`
        : '****';

      onDone(
        `Switched to profile ${chalk.bold(targetProfile.name)}\n` +
        `  URL:   ${targetProfile.baseUrl}\n` +
        `  Model: ${chalk.bold(targetProfile.model)}\n` +
        `  Key:   ${maskedKey}\n\n` +
        chalk.dim(`Note: Run /model ${targetProfile.model} to also switch the model.`),
        { display: 'system' }
      );
      return null;
    } else {
      onDone(chalk.red(`Profile "${args}" not found. Use /profile list to see available profiles.`), {
        display: 'system',
      });
      return null;
    }
  }

  // Subcommands: add, delete
  return <HandleSubcommand args={args} onDone={onDone} />;
};
