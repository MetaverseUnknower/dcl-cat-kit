#!/usr/bin/env node
// Copy dcl-cat-kit's cats (models, coats, voices) into this scene's assets/dcl-cat-kit/, where a scene can load them.
import { cpSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
const from = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const to = join(process.cwd(), 'assets', 'dcl-cat-kit')
mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
console.log(`dcl-cat-kit: copied the cats into ${to}`)
