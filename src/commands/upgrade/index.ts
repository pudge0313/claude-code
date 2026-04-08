import type { Command } from '../../commands.js'
import { getSubscriptionType } from '../../utils/auth.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

const upgrade = {
  type: 'local-jsx',
  name: 'upgrade',
  description: '升级到Max以获得更高的速率限制和更多Opus额度',
  availability: ['claude-ai'],
  isEnabled: () =>
    !isEnvTruthy(process.env.DISABLE_UPGRADE_COMMAND) &&
    getSubscriptionType() !== 'enterprise',
  load: () => import('./upgrade.js'),
} satisfies Command

export default upgrade
