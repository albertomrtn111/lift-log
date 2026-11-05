/** Al abrir un panel en una pantalla táctil, no pone el foco en un campo: taparía el panel con el teclado. */
export function keepKeyboardClosed(event: Event) {
    if (window.matchMedia('(pointer: coarse)').matches) event.preventDefault()
}
