import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** DÉPOSER UN FICHIER DE VUES SUR LA RANGÉE D'OUTILS — le fichier CSV ou JSON
 *  glissé sur la barre ouvre exactement le même aperçu que le bouton
 *  « Importer ». Le dépôt s'arrête ici : ce n'est pas la sauvegarde du
 *  carnet, la page entière n'a pas à l'attraper. */

function carriesFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

export function useViewsDrop(
  rootRef: RefObject<HTMLElement | null>,
  onFile: (file: File) => void,
): boolean {
  const [over, setOver] = useState(false);
  /* Le survol compte les entrées et sorties : passer au-dessus d'un enfant
     ne doit pas éteindre l'invite une fraction de seconde. */
  const depth = useRef(0);
  const handler = useRef(onFile);

  useEffect(() => {
    handler.current = onFile;
  }, [onFile]);

  useEffect(() => {
    const anchor = rootRef.current;
    if (!anchor) return undefined;
    /* La zone visée est la barre d'outils qui porte la rangée de pastilles. */
    const zone: Element = anchor.closest('.sup-tools') ?? anchor;
    let alive = true;

    const enter = (event: Event) => {
      const drag = event as DragEvent;
      if (!carriesFiles(drag)) return;
      drag.preventDefault();
      drag.stopPropagation();
      depth.current += 1;
      if (alive) setOver(true);
    };

    const overHandler = (event: Event) => {
      const drag = event as DragEvent;
      if (!carriesFiles(drag)) return;
      /* Sans cette ligne, le navigateur refuse le dépôt. */
      drag.preventDefault();
      drag.stopPropagation();
      if (drag.dataTransfer) drag.dataTransfer.dropEffect = 'copy';
      if (alive) setOver(true);
    };

    const leave = (event: Event) => {
      const drag = event as DragEvent;
      if (!carriesFiles(drag)) return;
      drag.stopPropagation();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0 && alive) setOver(false);
    };

    const drop = (event: Event) => {
      const drag = event as DragEvent;
      if (!carriesFiles(drag)) return;
      drag.preventDefault();
      drag.stopPropagation();
      depth.current = 0;
      if (alive) setOver(false);
      const file = drag.dataTransfer?.files?.[0];
      if (file) handler.current(file);
    };

    zone.addEventListener('dragenter', enter);
    zone.addEventListener('dragover', overHandler);
    zone.addEventListener('dragleave', leave);
    zone.addEventListener('drop', drop);
    return () => {
      alive = false;
      zone.removeEventListener('dragenter', enter);
      zone.removeEventListener('dragover', overHandler);
      zone.removeEventListener('dragleave', leave);
      zone.removeEventListener('drop', drop);
    };
  }, [rootRef]);

  return over;
}