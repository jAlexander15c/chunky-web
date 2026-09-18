import { MenuBoard } from "@/components";

export const Menu = () => {
    return (
        <main className="section page-menu">
            <div className="section__inner page-menu__inner">
                <h1 className="section__title">
                    Hoy en la <span className="script section__script">barra</span>
                </h1>
                <p className="section__lede">
                    El tablero muestra solo lo disponible ahora mismo. Toca una categoría para ver productos y precios.
                </p>
                <MenuBoard />
            </div>
        </main>
    );
};
