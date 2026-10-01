#!/usr/bin/env node
// Measure a .glb model for defineFloors: its size, and (placed with --at/--rot/--scale, as in your scene's Transform)
// the rect to put in a floor's `avoid`, or the height of its top for a spot.perch.
//
//   npx dcl-cat-kit-measure assets/models/sofa.glb
//   npx dcl-cat-kit-measure assets/models/sofa.glb --at 10.5,0,7.5 --rot 180 --scale 1
//   npx dcl-cat-kit-measure assets/models/sofa.glb --at 10.5,0,7.5 --quat 0,1,0,0   (a rotation as a quaternion)
import { readFileSync } from 'fs'
import { glbBounds, placed, yawOf } from './glb-bounds.mjs'

const args = process.argv.slice(2)
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
const opt = (k) => {
  const i = args.indexOf(`--${k}`)
  return i >= 0 ? args[i + 1] : undefined
}
if (!files.length || args.includes('--help')) {
  console.log('usage: dcl-cat-kit-measure <model.glb> [--at x,y,z] [--rot degrees | --quat x,y,z,w] [--scale s | sx,sy,sz]')
  console.log('Prints the model\'s size; with --at, its footprint in the scene as a rect() for a floor\'s avoid, and its top for spot.perch.')
  process.exit(files.length ? 0 : 1)
}
const nums = (s) => s.split(',').map(Number)
const f2 = (n) => (Math.round(n * 100) / 100).toString()
for (const file of files) {
  let b
  try {
    b = glbBounds(readFileSync(file))
  } catch (e) {
    console.error(`${file}: ${e.message}`)
    process.exitCode = 1
    continue
  }
  console.log(`${file}: ${f2(b.x1 - b.x0)} m wide (x), ${f2(b.z1 - b.z0)} m deep (z), ${f2(b.y1 - b.y0)} m tall`)
  console.log(`  model box: x ${f2(b.x0)} to ${f2(b.x1)}, y ${f2(b.y0)} to ${f2(b.y1)}, z ${f2(b.z0)} to ${f2(b.z1)}`)
  if (opt('at') !== undefined) {
    const at = nums(opt('at'))
    const sc = opt('scale') ? nums(opt('scale')) : [1]
    let rot = Number(opt('rot') ?? 0)
    if (opt('quat')) {
      const y = yawOf(nums(opt('quat')))
      rot = y.deg
      if (!y.pure) console.log('  (this rotation also tilts the model: the footprint below uses only its turn about y, so check it with showFloors)')
    }
    const p = placed(b, { at, rot, scale: sc.length === 1 ? sc[0] : sc })
    const cx = (p.x0 + p.x1) / 2
    const cz = (p.z0 + p.z1) / 2
    console.log(`  placed at ${at.join(', ')}${rot ? `, turned ${f2(rot)} degrees` : ''}${opt('scale') ? `, scale ${opt('scale')}` : ''}:`)
    console.log(`    avoid it:     rect(${f2(p.x0)}, ${f2(p.z0)}, ${f2(p.x1)}, ${f2(p.z1)})`)
    console.log(`    perch on top: spot.perch(${f2(cx)}, ${f2(p.top - at[1])}, ${f2(cz)})   (height above the floor it stands on; only if its top is flat)`)
    console.log(`    walk on top:  { y: ${f2(p.top)}, walk: [rect(${f2(p.x0)}, ${f2(p.z0)}, ${f2(p.x1)}, ${f2(p.z1)})] }   (only if it's a platform)`)
  }
}
