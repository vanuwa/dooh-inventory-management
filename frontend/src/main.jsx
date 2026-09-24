import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { migrateLegacyKeys } from './utils/apiEnvironment.js'

// Must run at module scope, before the first render: AuthContext reads the tokens
// in a useState initialiser, which fires during that render — a mount effect would
// migrate them too late to prevent the logout this exists to prevent.
migrateLegacyKeys()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
