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
  setActiveChannel,
  getActiveChannel,
  getChannelByModel,
  upsertChannel,
  deleteChannel,
  type ModelChannel,
} from '../../utils/profile/profiles.js';
import {
  setOpenAIProfileOverrides,
  getOpenAIProfileOverrides,
} from '../../services/api/openai/client.js';

/** Show current model channel info */
function ShowCurrentChannel({
  onDone
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}) {
  const active = getActiveChannel();
  const overrides = getOpenAIProfileOverrides();

  React.useEffect(() => {
    if (active) {
      // Mask API key for display
      const maskedKey = active.apiKey.length > 8
        ? `${active.apiKey.slice(0, 6)}...${active.apiKey.slice(-4)}`
        : '****';
      onDone(
        `Current channel: ${chalk.bold(active.label)}\n` +
        `  Model:  ${chalk.bold(active.model)}\n` +
        `  URL:    ${active.baseUrl}\n` +
        `  Key:    ${maskedKey}` +
        (overrides ? chalk.dim(' (runtime override active)') : ''),
        { display: 'system' }
      );
    } else if (overrides) {
      const maskedKey = overrides.apiKey && overrides.apiKey.length > 8
        ? `${overrides.apiKey.slice(0, 6)}...${overrides.apiKey.slice(-4)}`
        : '****';
      onDone(
        `Using custom endpoint (no named channel)\n` +
        `  URL: ${overrides.baseURL ?? '(env var)'}\n` +
        `  Key: ${maskedKey}`,
        { display: 'system' }
      );
    } else {
      onDone('No active channel. Using environment variables for API configuration.', { display: 'system' });
    }
  }, [onDone]);

  return null;
}

/** List all available model channels */
function ListChannels({
  onDone
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}) {
  const config = loadProfiles();
  const channels = config.channels || [];
  const activeModel = config.activeModel;

  React.useEffect(() => {
    if (channels.length === 0) {
      onDone('No model channels configured. Use /profile add to create one.', { display: 'system' });
      return;
    }

    let output = 'Available model channels:\n';
    for (const ch of channels) {
      const isActive = ch.model === activeModel ? chalk.green(' [active]') : '';
      const maskedKey = ch.apiKey.length > 8
        ? `${ch.apiKey.slice(0, 6)}...${ch.apiKey.slice(-4)}`
        : '****';
      output += `  ${chalk.bold(ch.model)} (${ch.label})${isActive}\n`;
      output += `    URL:   ${ch.baseUrl}\n`;
      output += `    Key:   ${maskedKey}\n`;
    }
    onDone(output.trim(), { display: 'system' });
  }, [onDone]);

  return null;
}

/**
 * Parse subcommand args.
 * Format: /profile add <model> <label> <base_url> <api_key>
 *         /profile delete <model>
 * Returns null if not a subcommand.
 */
function parseSubcommand(args: string): {
  action: string
  model: string
  rest: string[]
} | null {
  const parts = args.trim().split(/\s+/);
  if (!parts[0] || !['add', 'delete', 'del', 'rm', 'list', 'ls', 'info'].includes(parts[0])) {
    return null;
  }
  return {
    action: parts[0] === 'del' || parts[0] === 'rm' ? 'delete' : parts[0] === 'ls' ? 'list' : parts[0],
    model: parts[1] || '',
    rest: parts.slice(2),
  };
}

/**
 * Apply a model channel switch — updates both runtime overrides and AppState.
 * Shared between interactive picker and direct model name switch.
 */
function applyChannelSwitch(
  channel: ModelChannel,
  setAppState: (f: (prev: any) => any) => void,
): string {
  // 1. Persist active channel
  setActiveChannel(channel.model);

  // 2. Update OpenAI client overrides (baseURL + apiKey)
  setOpenAIProfileOverrides({
    apiKey: channel.apiKey,
    baseURL: channel.baseUrl,
  });

  // 3. Set model via environment variable (resolveOpenAIModel picks this up)
  process.env.OPENAI_MODEL = channel.model;

  // 4. Update AppState to keep model in sync
  setAppState(prev => ({
    ...prev,
    mainLoopModel: channel.model,
    mainLoopModelForSession: null,
  }));

  // Build display message
  const maskedKey = channel.apiKey.length > 8
    ? `${channel.apiKey.slice(0, 6)}...${channel.apiKey.slice(-4)}`
    : '****';

  return `Switched to channel ${chalk.bold(channel.label)}\n` +
    `  Model: ${chalk.bold(channel.model)}\n` +
    `  URL:   ${channel.baseUrl}\n` +
    `  Key:   ${maskedKey}`;
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
        const channels = config.channels || [];
        if (channels.length === 0) {
          onDone('No model channels configured. Use /profile add to create one.', { display: 'system' });
          return;
        }
        let out = 'Model channels:\n';
        for (const ch of channels) {
          const active = ch.model === config.activeModel ? chalk.green(' *') : '';
          out += `  ${ch.model} (${ch.label})${active} @ ${ch.baseUrl}\n`;
        }
        onDone(out.trim(), { display: 'system' });
        break;
      }

      case 'info':
        // Fall through - will be handled by ShowCurrentChannel via parent logic
        break;

      case 'add': {
        if (!parsed.model) {
          onDone(chalk.yellow('Usage: /profile add <model> <label> <base_url> <api_key>'), { display: 'system' });
          return;
        }
        if (parsed.rest.length < 3) {
          onDone(
            chalk.yellow('Usage: /profile add <model> <label> <base_url> <api_key>\n') +
            'Example: /profile add deepseek-r1 DeepSeek https://api.deepseek.com/v1 sk-xxx',
            { display: 'system' }
          );
          return;
        }
        const newChannel: ModelChannel = {
          model: parsed.model,
          label: parsed.rest[0],
          baseUrl: parsed.rest[1],
          apiKey: parsed.rest[2],
        };
        upsertChannel(newChannel);
        onDone(`Channel ${chalk.bold(newChannel.label)} added/updated.\n` +
          `  Model: ${newChannel.model}\n` +
          `  URL:   ${newChannel.baseUrl}\n\n` +
          `Switch with: /profile ${newChannel.model}`, { display: 'system' });
        break;
      }

      case 'delete': {
        if (!parsed.model) {
          onDone(chalk.yellow('Usage: /profile delete <model>'), { display: 'system' });
          return;
        }
        const ok = deleteChannel(parsed.model);
        if (!ok) {
          onDone(chalk.red(`Cannot delete channel "${parsed.model}" — it's the active channel or doesn't exist.`), { display: 'system' });
        } else {
          onDone(`Channel for model ${chalk.bold(parsed.model)} deleted.`, { display: 'system' });
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

/** Interactive model channel selector */
function ModelChannelPicker({
  onDone,
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}) {
  const setAppState = useSetAppState();

  const config = React.useMemo(() => loadProfiles(), []);

  const channelOptions = React.useMemo(
    () =>
      (config.channels || []).map(ch => ({
        label: `${ch.model} (${ch.label})${ch.model === config.activeModel ? ' (current)' : ''}`,
        value: ch.model,
        description: `${ch.baseUrl}`,
      })),
    [config]
  );

  function handleChange(modelName: string) {
    const channel = (config.channels || []).find(
      ch => ch.model.toLowerCase() === modelName.toLowerCase(),
    );
    if (!channel) {
      onDone(`Channel for model "${modelName}" not found.`, { display: 'system' });
      return;
    }

    const msg = applyChannelSwitch(channel, setAppState);
    onDone(msg, { display: 'system' });
  }

  if (channelOptions.length === 0) {
    React.useEffect(() => {
      onDone(
        'No model channels configured yet.\n' +
        chalk.dim('Use /profile add <model> <label> <url> <key> to add one.'),
        { display: 'system' }
      );
    }, [onDone]);
    return null;
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Select Model Channel</Text>
      <Text dimColor>Choose a model to switch its provider channel (ESC to cancel)</Text>
      <Box marginTop={1}>
        <Select
          options={channelOptions}
          onChange={handleChange}
          onCancel={() => onDone('Kept current channel.', { display: 'system' })}
          layout="compact-vertical"
        />
      </Box>
    </Box>
  );
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  args = args?.trim() || '';

  // No arguments → show interactive model channel picker
  if (!args) {
    return <ModelChannelPicker onDone={onDone} />;
  }

  // /profile info → show current channel
  if (args.toLowerCase() === 'info' || args.toLowerCase() === 'show' || args.toLowerCase() === 'current') {
    return <ShowCurrentChannel onDone={onDone} />;
  }

  // /profile list → show all channels
  if (args.toLowerCase() === 'list' || args.toLowerCase() === 'ls') {
    return <ListChannels onDone={onDone} />;
  }

  // Check if it's a subcommand (add, delete)
  const parsed = parseSubcommand(args);
  if (parsed) {
    return <HandleSubcommand args={args} onDone={onDone} />;
  }

  // Treat arg as a model name to switch to directly
  const config = loadProfiles();
  const targetChannel = (config.channels || []).find(
    ch => ch.model.toLowerCase() === args.toLowerCase() || ch.label.toLowerCase() === args.toLowerCase(),
  );

  if (targetChannel) {
    // We need setAppState for the model switch, but we're outside React.
    // Use a wrapper component to get access to setAppState.
    return <DirectChannelSwitch channel={targetChannel} onDone={onDone} />;
  } else {
    onDone(chalk.red(`Channel for model "${args}" not found. Use /profile list to see available channels.`), {
      display: 'system',
    });
    return null;
  }
};

/** Helper component for direct model-name switching (needs setAppState) */
function DirectChannelSwitch({
  channel,
  onDone,
}: {
  channel: ModelChannel;
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}) {
  const setAppState = useSetAppState();

  React.useEffect(() => {
    const msg = applyChannelSwitch(channel, setAppState);
    onDone(msg, { display: 'system' });
  }, [channel, onDone, setAppState]);

  return null;
}
