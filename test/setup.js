import { vi } from 'vitest'

/**
 * jsdom não implementa o contexto 2D de canvas. Os componentes desenham de
 * verdade em produção, mas nos testes só precisamos que as chamadas existam e
 * não quebrem a renderização.
 */
const noop = () => {}

const contextStub = new Proxy(
  {},
  {
    get(target, prop) {
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
        return () => ({ addColorStop: noop })
      }
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
      return typeof prop === 'string' ? noop : undefined
    },
    set: () => true,
  },
)

HTMLCanvasElement.prototype.getContext = vi.fn(() => contextStub)
HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,')

/**
 * O jsdom não expõe `matchMedia`, usado para checar movimento reduzido.
 *
 * Reportamos `true` para `prefers-reduced-motion`: assim os testes exercitam
 * o caminho sem animação — o conteúdo aparece de imediato, sem depender de
 * temporizadores e sem instabilidade de timing.
 */
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: /prefers-reduced-motion:\s*reduce/.test(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/**
 * O jsdom também não tem `IntersectionObserver`, usado pelas animações de
 * entrada. O stub é passivo de propósito: disparar o callback de dentro do
 * construtor causaria setState durante a renderização.
 */
if (typeof window.IntersectionObserver === 'undefined') {
  window.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
}