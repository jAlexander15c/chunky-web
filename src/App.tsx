import { BrowserRouter, Routes, Route } from "react-router";
import { Mantenimiento } from "@/views";

import './App.css'
import './fonts.css'
import { useWwwRedirect } from "@/hooks/useWwwRedirect";

function App() {
  useWwwRedirect();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<Mantenimiento />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App