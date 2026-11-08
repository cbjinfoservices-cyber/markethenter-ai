import { useEffect, useRef, useState } from 'react';

/** DÉPOSER LA SAUVEGARDE SUR LA PAGE — un fichier glissé n'importe où dans
 *  le carnet ouvre son aperçu, exactement comme le bouton « Restaurer ».
 *  Rien n'est reposé avant le clic de confirmation. */

function carriesFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

export function useBackupDrop(onFile: (file: File) => void): boolean {
  const [over, setOver] = useState(false);
  /* Le survol compte les entrées et sorties : passer au-dessus d'un enfant
     ne doit pas éteindre l'invite une fraction de seconde. */
  const depth = useRef(0);
  const handler = useRef(onFile);

  useEffect(() => {
    handler.current = onFile;
  }, [onFile]);

  useEffect(() => {
    let alive = true;

    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      if (alive) setOver(true);
    };

    const overHandler = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      /* Sans cette ligne, le navigateur refuse le dépôt. */
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      if (alive) setOver(true);
    };

    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0 && alive) setOver(false);
    };

    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      if (alive) setOver(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) handler.current(file);
    };

    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', overHandler);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      alive = false;
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', overHandler);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return over;
}