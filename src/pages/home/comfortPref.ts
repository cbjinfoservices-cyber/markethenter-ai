/* « Lecture confort » : un seul interrupteur, gardé d'une visite à l'autre.
   Il n'agrandit que la citation et les petits libellés — le reste de la page
   garde exactement sa taille. */
const COMFORT_KEY = 'mh:comfort';

export function readComfort(): boolean {
  try {
    return window.localStorage.getItem(COMFORT_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistComfort(on: boolean): void {
  try {
    window.localStorage.setItem(COMFORT_KEY, on ? '1' : '0');
  } catch {
    /* stockage bloqué — le réglage vaut pour cette visite */
  }
}