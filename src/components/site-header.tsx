import { Link, NavLink } from "react-router";
import { PiReceiptBold } from "react-icons/pi";

import { useCart } from "./use-cart";

import logo from "@/assets/logos/Mora Azul.png";

export const SiteHeader = () => {
    const { count, setIsOpen } = useCart();

    return (
        <>
        <header className="site-header">
            <div className="site-header__inner">
                <Link to="/" className="site-header__logo" aria-label="Chunky Bites Bakery, inicio">
                    <img src={logo} alt="Chunky Bites Bakery" width={4501} height={1336} />
                </Link>

                <nav className="site-header__nav" aria-label="Principal">
                    <NavLink to="/menu" className="site-header__link">Menú</NavLink>
                    {/* En el celular solo cabe "Cotiza": el resto aparece desde tablet, como la etiqueta del carrito */}
                    <NavLink to="/cotizador" className="site-header__link" aria-label="Cotiza tu cake">
                        Cotiza<span className="site-header__cart-label"> tu cake</span>
                    </NavLink>
                    <Link to="/#pasaporte" className="site-header__link site-header__link--secondary">Nuestra carta</Link>
                    <Link to="/#como-pedir" className="site-header__link site-header__link--secondary">Cómo pedir</Link>
                </nav>

                <button
                    type="button"
                    className="site-header__cart"
                    onClick={() => setIsOpen(true)}
                    disabled={count === 0}
                    aria-label={count === 0 ? "Tu carrito está vacío" : `Ver carrito, ${count} productos`}
                >
                    <PiReceiptBold aria-hidden />
                    <span className="site-header__cart-label">Carrito</span>
                    {count > 0 && <span className="site-header__badge">{count}</span>}
                </button>
            </div>
        </header>
        <div className="awning" aria-hidden />
        </>
    );
};
