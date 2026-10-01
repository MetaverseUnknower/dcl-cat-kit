import { it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
// @ts-ignore: a plain JS script
import { expected } from '../../../scripts/sync-docs.mjs'

// The repo README and the agent skill are made from the package's README.md and AGENTS.md: they must never drift.
it('the docs copied from the package are up to date (run: node scripts/sync-docs.mjs)', () => {
  for (const [p, text] of Object.entries(expected() as Record<string, string>)) expect(readFileSync(join(__dirname, '../../..', p), 'utf8'), p).toBe(text)
})
