import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
// @ts-ignore: plain JS module shipped with a command
import { verdict } from '../bin/check-lib.mjs'

describe('checking a scene without opening it', () => {
  it('cats started and nothing wrong: OK, naming the cats', () => {
    const v = verdict({ logged: ['hello'], sent: 'x assets/dcl-cat-kit/cats/faith-body.glb y assets/dcl-cat-kit/cats/haze-body.glb' })
    expect(v.ok).toBe(true)
    expect(v.cats).toEqual(['faith', 'haze'])
  })
  it("the kit's own messages are problems, each one listed", () => {
    const v = verdict({ logged: ['Error: dcl-cat-kit: spot 2 (40, 4) isn\'t on floor "ground". Fix: move it'], sent: '' })
    expect(v.ok).toBe(false)
    expect(v.problems[0]).toMatch(/^dcl-cat-kit: spot 2/)
  })
  it('no cats and no message: still a problem (addCats never ran?)', () => {
    const v = verdict({ logged: [], sent: '' })
    expect(v.ok).toBe(false)
    expect(v.problems.join()).toMatch(/no cats started/)
  })
  it('other errors are reported separately, as they may come from running outside Decentraland', () => {
    const v = verdict({ logged: ['TypeError: something else'], sent: 'assets/dcl-cat-kit/cats/faith-body.glb' })
    expect(v.ok).toBe(true)
    expect(v.other).toEqual(['TypeError: something else'])
  })
})

const example = join(__dirname, '../../../example')
describe.skipIf(!existsSync(join(example, 'bin/index.js')))('on the example scene (built)', () => {
  it('passes, with its three cats', () => {
    const out = execFileSync(process.execPath, [join(__dirname, '../bin/check.mjs')], { cwd: example, encoding: 'utf8' })
    expect(out).toMatch(/OK/)
    expect(out).toMatch(/faith.*haze.*tigger/)
  })
})
