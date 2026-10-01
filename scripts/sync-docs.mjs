#!/usr/bin/env node
// The docs live in packages/cat-kit (README.md, AGENTS.md: what npm shows and ships). This writes the copies made from
// them: the repo's README.md (plus a section on the repo) and the agent skill, skills/dcl-cat-kit/SKILL.md.
//   node scripts/sync-docs.mjs          write the copies
//   node scripts/sync-docs.mjs --check  exit 1 if any copy is out of date (the tests run this)
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const REPO = `## In this repository

- \`packages/cat-kit\`: the package (code, cats, voices, tests, and the \`copy-assets\` and \`measure\` commands). Its README.md and AGENTS.md are the docs; \`node scripts/sync-docs.mjs\` copies them here and into the skill.
- \`example\`: a cosy cat room with three cats, a platform with steps and a cat tree, and a sofa from dcl-sittables. Run \`npm run copy-assets\` and then \`npm run start\` there.
- \`skills/dcl-cat-kit\`: the agent guide as a skill (\`npx skills add MetaverseUnknower/dcl-cat-kit\`).
- Working on the kit? Read the repo's [AGENTS.md](./AGENTS.md) and [CONTRIBUTING.md](./CONTRIBUTING.md).

`

/** Every generated file and what it should contain. */
export function expected() {
  const readme = read('packages/cat-kit/README.md')
  const agents = read('packages/cat-kit/AGENTS.md')
  const at = readme.indexOf('## For AI agents')
  if (at < 0) throw new Error('packages/cat-kit/README.md has no "## For AI agents" section to put the repo section before')
  const skill = `---
name: dcl-cat-kit
description: Add living cats to a Decentraland SDK7 scene with dcl-cat-kit (defineFloors, addCats, CAFE_CATS). Use when a scene should have cats or pets, or when setting up its floors, links and spots for them.
---

` + agents.replace('[`AGENTS.md`](./AGENTS.md)', 'this guide')
  return {
    'README.md': readme.slice(0, at) + REPO + readme.slice(at).replace('[`AGENTS.md`](./AGENTS.md)', '[`packages/cat-kit/AGENTS.md`](./packages/cat-kit/AGENTS.md)'),
    'skills/dcl-cat-kit/SKILL.md': skill
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const stale = []
  for (const [p, text] of Object.entries(expected())) {
    let now = ''
    try { now = read(p) } catch {}
    if (now === text) continue
    if (process.argv.includes('--check')) stale.push(p)
    else {
      mkdirSync(dirname(join(root, p)), { recursive: true })
      writeFileSync(join(root, p), text)
      console.log(`wrote ${p}`)
    }
  }
  if (stale.length) {
    console.error(`out of date: ${stale.join(', ')}. Run: node scripts/sync-docs.mjs`)
    process.exit(1)
  }
}
