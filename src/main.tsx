import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { guideByPath } from './guides/registry'
import { toolByPath } from './tools/registry'

// fetch the first page's chunk before rendering, so React replaces the prerendered
// HTML with the finished page in one step rather than an empty shell (layout shift)
const path = window.location.pathname.replace(/(.)\/$/, '$1')
const first = (toolByPath(path) ?? guideByPath(path))?.component.preload() ?? Promise.resolve()

first
  .catch(() => {}) // a failed fetch is retried by the lazy route and shown by its error boundary
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
