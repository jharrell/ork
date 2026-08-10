/**
 * Rollup plugin for unplugin-ork
 */

import type { RollupPlugin } from 'unplugin'

import { unpluginOrk } from './core.js'
import type { OrkPluginOptions } from './types.js'

export default unpluginOrk.rollup
export const orkRollupPlugin = unpluginOrk.rollup

// Named export for explicit usage
export function defineOrkRollupPlugin(options: OrkPluginOptions = {}): RollupPlugin {
  return unpluginOrk.rollup(options)
}
