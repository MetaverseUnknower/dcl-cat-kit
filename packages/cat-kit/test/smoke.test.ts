import { it, expect } from 'vitest'
import { VERSION } from '../src/version'
it('has a version (the API itself needs the scene runtime, so it loads only in a scene)', () => expect(VERSION).toBe('0.1.0'))
