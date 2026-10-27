import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { hydrateRoot } from 'react-dom/client'

import App from './App'
import './index.css'

const app = (
  <StrictMode>
    <App />
  </StrictMode>
)
const root = document.getElementById('root')!

if (root.childElementCount > 0) {
  hydrateRoot(root, app)
} else {
  createRoot(root).render(app)
}
