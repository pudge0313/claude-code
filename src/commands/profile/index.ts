import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'profile',
  description: 'Switch model channel (select model to switch provider/base_url)',
  argumentHint: '[model|list|add|delete|info]',
  load: () => import('./profile.js'),
} satisfies Command
