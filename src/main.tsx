import { StrictMode } from 'react'
import './i18n'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyStoredPalette } from '@/components/feature/themePalettes'
import { bootStoredSkin } from '@/pages/home/pageSkin'
import App from './App.tsx'
import AuthProvider from '@/components/AuthProvider'

applyStoredPalette()
/* The light/dark choice is read before the first render: the shell is already
   pale, so the home page never flashes dark before switching. */
bootStoredSkin()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
