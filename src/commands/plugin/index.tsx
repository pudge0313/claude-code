import type { Command } from '../../commands.js';
const plugin = {
  type: 'local-jsx',
  name: 'plugin',
  aliases: ['plugins', 'marketplace'],
  description: '管理Claude Code插件',
  immediate: true,
  load: () => import('./plugin.js')
} satisfies Command;
export default plugin;
