import { BrowserRouter, Routes, Route } from "react-router";
import { Items, Menu/* , Mantenimiento */ } from "@/views";

import './App.css'
import './fonts.css'
import { useState } from "react";

function App() {
  const [cartItems, setCartItems] = useState<Array<any>>([]);

  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<Menu cartItems={cartItems} setCartItems={setCartItems} />} />
        <Route path="/menu" element={<Menu cartItems={cartItems} setCartItems={setCartItems} />} />
        <Route path="/items" element={<Items cartItems={cartItems} setCartItems={setCartItems} />} />
        {/*<Route index element={<Mantenimiento />} />*/}
      </Routes>
    </BrowserRouter>
  )
}

export default App