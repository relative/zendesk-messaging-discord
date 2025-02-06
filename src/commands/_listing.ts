import fs from 'node:fs/promises'
import path from 'node:path'
import type { ZdmdButtonCallback, ZdmdCommand } from './index.ts'
import { pathToFileURL } from 'node:url'

const entries = await fs.readdir(path.join(import.meta.dirname), {
  withFileTypes: true,
})

const EXCLUDED_NAMES = ['index.ts', '_listing.ts', 'index.js', '_listing.js', 'index.mjs', '_listing.mjs']

export const CommandMap = new Map<string, ZdmdCommand>()
export const ButtonMap = new Map<string, ZdmdButtonCallback>()
for (const entry of entries) {
  if (!entry.isFile()) continue
  if (!entry.name.endsWith('ts')) continue
  if (EXCLUDED_NAMES.includes(entry.name)) continue

  const { default: command } = await import(pathToFileURL(path.join(entry.parentPath, entry.name)).toString())
  const typedCommand = command as ZdmdCommand
  CommandMap.set(typedCommand.command.name, typedCommand)

  if (typedCommand.buttons) {
    for (const key in typedCommand.buttons) {
      ButtonMap.set(key, typedCommand.buttons[key])
    }
  }
}
