import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isPractice } from './tutorial/runtime'
const App = lazy(() => isPractice ? import('./tutorial/PracticeApp') : import('./App'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="h-full bg-slate-950" role="status" aria-label="Loading game" />}><App /></Suspense>
  </StrictMode>,
)
