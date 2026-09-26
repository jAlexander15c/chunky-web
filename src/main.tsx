import { Provider } from "@/components/ui/provider.tsx";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './fonts.css'
import App from './App.tsx'
import { removeLegacyPrivacyPhones } from "@/helpers/privacy";

removeLegacyPrivacyPhones();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider>
      <App />
    </Provider>
  </StrictMode>,
)
