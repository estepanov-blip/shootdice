import '@fontsource/oswald/500.css'
import '@fontsource/oswald/700.css'
import '@fontsource/permanent-marker/400.css'
import '@fontsource/rubik-dirt/400.css'
import './ui/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initPlatform } from './platform/telegram'
import { App } from './ui/App'

initPlatform().then((platform) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App platform={platform} />
    </StrictMode>,
  )
})
