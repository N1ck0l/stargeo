/**
 * Barra de navegação: menu mobile (abrir/fechar, Esc, fechar ao navegar),
 * âncoras para as seções reais da página e o atalho que abre o certificado.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Navbar } from '../src/components/Navbar'

afterEach(cleanup)

const renderNav = (props = {}) => render(<Navbar onOpenCertificate={() => {}} {...props} />)

describe('Navbar', () => {
  // === Menu mobile ===

  it('mantém o botão do menu fechado por padrão', () => {
    renderNav()
    const toggle = screen.getByLabelText('Abrir menu')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('nav-mobile')).toBeNull()
  })

  it('abre e fecha o menu no celular', () => {
    renderNav()
    fireEvent.click(screen.getByLabelText('Abrir menu'))

    expect(screen.getByLabelText('Fechar menu').getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById('nav-mobile')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Fechar menu'))
    expect(document.getElementById('nav-mobile')).toBeNull()
  })

  it('fecha o menu com a tecla Esc', () => {
    renderNav()
    fireEvent.click(screen.getByLabelText('Abrir menu'))
    // Esc fecha qualquer sobreposição aberta — atalho esperado em menu mobile.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.getElementById('nav-mobile')).toBeNull()
  })

  it('fecha o menu ao escolher um destino', () => {
    renderNav()
    fireEvent.click(screen.getByLabelText('Abrir menu'))
    // "Mapa do céu" também existe na barra de desktop: busca só dentro do menu.
    const menu = document.getElementById('nav-mobile')
    fireEvent.click(within(menu).getByText('Mapa do céu'))
    expect(document.getElementById('nav-mobile')).toBeNull()
  })

  // === Âncoras das seções e atalho do certificado ===

  it('aponta para as seções reais da página', () => {
    renderNav()
    const hrefs = [...document.querySelectorAll('header a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('#ceu')
    expect(hrefs).toContain('#estrela')
    expect(hrefs).toContain('#carta')
  })

  it('dispara onOpenCertificate ao pedir o certificado', () => {
    const onOpenCertificate = vi.fn()
    renderNav({ onOpenCertificate })
    fireEvent.click(screen.getByText('Certificado'))
    expect(onOpenCertificate).toHaveBeenCalledTimes(1)
  })
})