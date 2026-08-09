import { describe, it, expect } from 'vitest'
import { fmt, esc, calcServiceTotal, calcHourTotal, calcMaterialsTotal } from '../helpers.js'

// ─── fmt ─────────────────────────────────────────────────────────────────────
describe('fmt', () => {
  it('formats whole numbers', () => expect(fmt(100)).toBe('$100.00'))
  it('formats decimals', () => expect(fmt(1.5)).toBe('$1.50'))
  it('formats zero', () => expect(fmt(0)).toBe('$0.00'))
  it('handles string input', () => expect(fmt('250')).toBe('$250.00'))
})

// ─── esc ─────────────────────────────────────────────────────────────────────
describe('esc', () => {
  it('escapes <script> tags', () =>
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;'))
  it('escapes ampersands', () => expect(esc('A & B')).toBe('A &amp; B'))
  it('escapes double quotes', () => expect(esc('"quoted"')).toBe('&quot;quoted&quot;'))
  it('escapes single quotes', () => expect(esc("it's")).toBe('it&#39;s'))
  it('returns empty string for null', () => expect(esc(null)).toBe(''))
  it('returns empty string for undefined', () => expect(esc(undefined)).toBe(''))
  it('passes plain text through unchanged', () => expect(esc('Hello World')).toBe('Hello World'))
})

// ─── calcServiceTotal ─────────────────────────────────────────────────────────
describe('calcServiceTotal', () => {
  it('returns 0 when no serviceId', () =>
    expect(calcServiceTotal({ serviceId: '', type: 'flat', base: 100 })).toBe(0))

  it('returns 0 for hourly type', () =>
    expect(calcServiceTotal({ serviceId: 'x', type: 'hourly', rate: 110 })).toBe(0))

  it('calculates per_unit: rate × qty', () =>
    expect(calcServiceTotal({ serviceId: 'x', type: 'per_unit', rate: 200, qty: 3 })).toBe(600))

  it('per_unit defaults qty to 1', () =>
    expect(calcServiceTotal({ serviceId: 'x', type: 'per_unit', rate: 150 })).toBe(150))

  it('calculates flat base only', () =>
    expect(calcServiceTotal({ serviceId: 'x', type: 'flat', base: 250, extraQty: 0, perUnit: 25 })).toBe(250))

  it('calculates flat base + extras', () =>
    expect(calcServiceTotal({ serviceId: 'x', type: 'flat', base: 250, extraQty: 3, perUnit: 25 })).toBe(325))

  it('returns 0 for unknown type', () =>
    expect(calcServiceTotal({ serviceId: 'x', type: 'unknown' })).toBe(0))
})

// ─── calcHourTotal ────────────────────────────────────────────────────────────
describe('calcHourTotal', () => {
  it('returns 0 for empty logs', () => expect(calcHourTotal([])).toBe(0))

  it('sums hours × rate across all entries', () =>
    expect(calcHourTotal([
      { hours: '2', rate: 110 },
      { hours: '1.5', rate: 130 },
    ])).toBe(415))

  it('handles missing hours gracefully', () =>
    expect(calcHourTotal([{ hours: '', rate: 110 }])).toBe(0))

  it('handles missing rate gracefully', () =>
    expect(calcHourTotal([{ hours: '1', rate: undefined }])).toBe(0))
})

// ─── calcMaterialsTotal ───────────────────────────────────────────────────────
describe('calcMaterialsTotal', () => {
  it('returns 0 for empty list', () => expect(calcMaterialsTotal([])).toBe(0))

  it('sums qty × unitPrice across all entries', () =>
    expect(calcMaterialsTotal([
      { qty: 2, unitPrice: 25 },
      { qty: 1, unitPrice: 15 },
    ])).toBe(65))

  it('handles missing qty gracefully', () =>
    expect(calcMaterialsTotal([{ qty: '', unitPrice: 25 }])).toBe(0))

  it('handles missing unitPrice gracefully', () =>
    expect(calcMaterialsTotal([{ qty: 2, unitPrice: undefined }])).toBe(0))
})

