import { it, expect } from 'vitest'
import { VERSION } from '../src/index'
it('builds and loads', () => expect(VERSION).toBe('0.1.0'))
