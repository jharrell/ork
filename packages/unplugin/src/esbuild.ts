/**
 * esbuild plugin for unplugin-ork
 */

import type { EsbuildPlugin } from 'unplugin'

import { unpluginOrk } from './core.js'
import type { OrkPluginOptions } from './types.js'

export default unpluginOrk.esbuild
export const orkEsbuildPlugin = unpluginOrk.esbuild

// Named export for explicit usage
export function defineOrkEsbuildPlugin(options: OrkPluginOptions = {}): EsbuildPlugin {
  return unpluginOrk.esbuild(options)
}
