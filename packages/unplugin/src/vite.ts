/**
 * Vite plugin for unplugin-ork
 */

import type { VitePlugin } from 'unplugin'

import { unpluginOrk } from './core.js'
import type { OrkPluginOptions } from './types.js'

export default unpluginOrk.vite
export const orkPlugin = unpluginOrk.vite

// Named export for explicit usage
export function defineOrkPlugin(options: OrkPluginOptions = {}): VitePlugin {
  return unpluginOrk.vite(options)
}
