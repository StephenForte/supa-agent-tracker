import type { MouseEvent } from 'react';

/** Keep a link inside a clickable card from also activating the card. */
export function stopCardActivation(event: MouseEvent) {
  event.stopPropagation();
}
