import { describe, expect, it } from 'vitest'
import { zh } from '../src/client/locales.ts'

describe('Chinese product messages', () => {
  it('keeps author verification notes and reassurance out of user prompts', () => {
    const editorial = /真实值|真实设备|真实消耗|仍可|仍待|待本机验证|待验证|验证可用后|实测费用|以保证/
    const hits = Object.entries(zh).filter(([, text]) => editorial.test(text))
    expect(hits).toEqual([])
  })
})
