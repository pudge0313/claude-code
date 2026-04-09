import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'profile',
  description: 'Switch between different API endpoint profiles',
  argumentHint: '[name|list|add|delete|info]',
  load: () => import('./profile.js'),
} satisfies Command
