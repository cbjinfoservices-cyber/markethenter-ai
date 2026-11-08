import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import './film.css';
/* La couche de lisibilité du thème clair, posée après le film : elle ne
   touche qu'au papier, jamais aux images. */
import './lightSkin.css';
/* « Lecture confort » : la citation et les petits libellés seulement. */
import './comfort.css';
import Nav from './components/Nav';
import Chapter from './components/Chapter';
import Panels from './components/Panels';
import Contact from './components/Contact';
import Footer from './components/Footer';
import { initReveal, initScrub, initPanels, refreshCopy } from './scrub';
/* La même préférence clair/sombre que les quatre pages de travail : la page
   d'accueil se lit désormais de la même façon, y compris en pleine journée. */
import { persistSkin, readSkin } from './pageSkin';
import type { PageSkin } from './pageSkin';
import { persistVeil, readVeil, veilCssValue } from './veilPref';
import { persistComfort, readComfort } from './comfortPref';

export default function Home() {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  const [skin, setSkin] = useState<PageSkin>(() => readSkin());
  /* Le voile des photos, gardé d'une visite à l'autre : c'est le seul réglage
     qui arbitre entre la photo et la lisibilité du texte. */
  const [veil, setVeil] = useState<number>(() => readVeil());
  /* La lecture confort, gardée elle aussi : citation et petits libellés plus
     grands, sans déplacer un seul titre ni un seul chiffre. */
  const [comfort, setComfort] = useState<boolean>(() => readComfort());

  useEffect(() => {
    persistSkin(skin);
  }, [skin]);

  useEffect(() => {
    persistVeil(veil);
  }, [veil]);

  useEffect(() => {
    persistComfort(comfort);
  }, [comfort]);

  /* The page base itself follows the choice: the shell is marked in main.tsx
     before the first paint, then kept in sync here on every toggle. */

  useEffect(() => {
    initScrub();
    initPanels();
    initReveal();
    const target = window.location.hash.replace('#', '');
    if (!target) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ block: 'start' });
    }, 320);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    refreshCopy();
  }, [lang]);

  return (
    <div
      className="home-skin"
      data-home-skin={skin}
      data-comfort={comfort ? 'on' : 'off'}
      style={{ '--veil-base': veilCssValue(veil) } as CSSProperties}
    >
      <Nav
        skin={skin}
        onToggleSkin={() => setSkin((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onSkin={setSkin}
        veil={veil}
        onVeil={setVeil}
        comfort={comfort}
        onComfort={setComfort}
      />
      <main>
        <Chapter />
        <Panels />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}