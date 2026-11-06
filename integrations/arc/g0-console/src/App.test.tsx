// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

vi.mock('./lib/reader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/reader')>()
  // Never resolves: the test must not touch the network.
  return { ...actual, readSnapshot: vi.fn(() => new Promise(() => {})) }
})

import App from './App'

afterEach(cleanup)

describe('App layout', () => {
  it('has an in-flow Arc Studio footer link that opens safely', () => {
    const { container } = render(<App />)
    const link = container.querySelector('footer a')
    expect(link?.getAttribute('href')).toBe('https://studio.arc.io')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toContain('noopener')
  })

  it('has no fixed or sticky overlays', () => {
    const { container } = render(<App />)
    expect(container.querySelectorAll('.fixed, .sticky, .absolute').length).toBe(0)
    for (const el of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(el.style.position).not.toBe('fixed')
    }
  })

  it('shows the permanent play-money label', () => {
    const { getByTestId } = render(<App />)
    expect(getByTestId('play-money-label').textContent).toBe('PLAY MONEY · ARC TESTNET')
  })
})
