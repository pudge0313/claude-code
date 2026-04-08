/**
 * Copy command - minimal metadata only.
 * Implementation is lazy-loaded from copy.tsx to reduce startup time.
 */
import type { Command } from '../../commands.js'

const copy = {
  type: 'local-jsx',
  name: 'copy',
  description:
    "将Claude的上一条回复复制到剪贴板（或使用/copy N复制倒数第N条）",
  load: () => import('./copy.js'),
} satisfies Command

export default copy
