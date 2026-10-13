/**
 * Registra o service worker, que faz o site abrir sem internet.
 *
 * Só em produção: durante o `npm run dev` um service worker antigo servindo
 * arquivos velhos atrapalharia mais do que ajudaria. Em desenvolvimento ele é
 * desregistrado de propósito.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  if (import.meta.env.DEV) {
    navigator.serviceWorker
      ?.getRegistrations()
      .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      .catch(() => {})
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        // Sem service worker o site continua funcionando normalmente —
        // só perde o modo offline. Não vale mostrar erro ao usuário.
      })
  })
}