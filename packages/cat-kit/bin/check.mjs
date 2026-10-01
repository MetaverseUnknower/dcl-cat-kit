#!/usr/bin/env node
// Check a scene's cats without opening it: runs the built scene (scene.json's "main", made by `npm run build`) in Node
// with a stand-in for the Decentraland runtime, and reports what the kit says: mistakes in defineFloors, cats without
// their model files, too few spots, and so on. Run it in the scene folder after `npm run build`:
//
//   npm run build && npx dcl-cat-kit-check
//
// It can't see how things look (the floor view is still for a person), but it catches every mistake the kit reports.
import Module, { createRequire } from 'module'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative, resolve } from 'path'
import { verdict } from './check-lib.mjs'

const dir = process.cwd()
const fail = (m) => {
  console.error(`dcl-cat-kit-check: ${m}`)
  process.exit(1)
}
if (!existsSync(join(dir, 'scene.json'))) fail('no scene.json here: run this in your scene folder.')
const scene = JSON.parse(readFileSync(join(dir, 'scene.json'), 'utf8'))
const main = resolve(dir, scene.main ?? 'bin/index.js')
if (!existsSync(main)) fail(`${relative(dir, main)} doesn't exist: run \`npm run build\` first.`)

// The scene's files, as the runtime lists them (to check the cats' models are there)
const files = []
const walk = (d) => {
  for (const f of readdirSync(d)) {
    if (f === 'node_modules' || f.startsWith('.')) continue
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else files.push(relative(dir, p).split('\\').join('/'))
  }
}
walk(dir)

const sent = []
const user = { userId: '0x0000000000000000000000000000000000c47c47', displayName: 'check', publicKey: '0x0000000000000000000000000000000000c47c47', hasConnectedWeb3: true, avatar: { bodyShape: '', skinColor: '', hairColor: '', eyeColor: '', wearables: [], snapshots: {} } }
const stubs = {
  '~system/EngineApi': {
    crdtSendToRenderer: async (m) => { sent.push(Buffer.from(m.data).toString('latin1')); return { data: [] } },
    crdtGetState: async () => ({ data: [], hasEntities: false }),
    sendBatch: async () => ({ events: [] }),
    subscribe: async () => ({}),
    isServer: async () => ({ isServer: false })
  },
  '~system/Runtime': {
    getSceneInformation: async () => ({ content: files.map((file) => ({ file, hash: file })), metadataJson: JSON.stringify(scene), baseUrl: '' }),
    getRealm: async () => ({ realmInfo: { baseUrl: '', realmName: 'check', networkId: 0, commsAdapter: '', isPreview: true } }),
    getExplorerInformation: async () => ({ agent: 'dcl-cat-kit-check', platform: 'node', configurations: {} })
  },
  '~system/UserIdentity': { getUserData: async () => ({ data: user }), getUserPublicKey: async () => ({ address: user.userId }) },
  '~system/CommunicationsController': { sendBinary: async () => ({ data: [] }), send: async () => ({}) }
}
// Anything else answers with empty lists, so code that reads a reply finds nothing rather than crashing.
const noop = new Proxy({}, { get: () => async () => ({ data: [], events: [], messages: [] }) })
const load = Module._load
Module._load = function (req, ...rest) {
  if (stubs[req]) return stubs[req]
  if (req.startsWith('~system/')) return noop
  return load.call(this, req, ...rest)
}

const logged = []
const keep = (args) => args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' ')
console.error = (...a) => logged.push(keep(a))
const say = console.log
console.log = (...a) => { const s = keep(a); if (s.includes('dcl-cat-kit:')) logged.push(s) }
process.on('unhandledRejection', (e) => logged.push(keep([e])))

const tick = () => new Promise((r) => setTimeout(r, 0))
try {
  const s = createRequire(main)(main)
  await s.onStart?.()
  for (let i = 0; i < 30; i++) {
    await s.onUpdate?.(0.1)
    await tick()
  }
} catch (e) {
  logged.push(keep([e]))
}
await new Promise((r) => setTimeout(r, 200))

const v = verdict({ logged, sent: sent.join('') })
if (v.ok) say(`dcl-cat-kit-check: OK. ${v.cats.length} cat(s) started: ${v.cats.join(', ')}. (Ask a person to look at the floor view too: this can't see how things line up.)`)
else {
  say('dcl-cat-kit-check: problems found:')
  for (const p of v.problems) say(`  - ${p}`)
}
if (v.other.length) {
  say('Other errors the scene logged (these may come from running outside Decentraland, so they don\'t fail the check):')
  for (const o of v.other.slice(0, 10)) say(`  - ${o.slice(0, 300)}`)
}
process.exit(v.ok ? 0 : 1)
