import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ComponentType } from 'react'

const params = new URLSearchParams(window.location.search)
const rootElement = document.getElementById('root')!

async function loadRootComponent(): Promise<ComponentType> {
  if (params.get('tool') === 'sprout-frame-export') {
    const { SproutFrameExport } = await import('./tools/SproutFrameExport.tsx')
    return SproutFrameExport
  }

  const { default: App } = await import('./App.tsx')
  return App
}

loadRootComponent().then((RootComponent) => {
  createRoot(rootElement).render(
    <StrictMode>
      <RootComponent />
    </StrictMode>,
  )
})
