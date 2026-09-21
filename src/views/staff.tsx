import { useEffect } from "react";
import { Link } from "react-router";

import "./gestion.css";
import "./staff.css";

const useStaffHead = () => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = "Staff · Chunky Bites";
        return () => {
            document.title = previousTitle;
        };
    }, []);
};

/** Acceso del equipo a los paneles: solo redirige, cada panel pide su propio PIN. */
export const StaffView = () => {
    useStaffHead();

    return (
        <main className="ges ges-gate">
            <div className="ges-gate__panel">
                <span className="ges-gate__mark script">Staff</span>
                <h1>¿A dónde vas?</h1>
                <p>Cada panel te pide su PIN al entrar.</p>

                <nav className="staff-links" aria-label="Paneles">
                    <Link to="/admin" className="staff-link staff-link--main">
                        <strong>Administrador</strong>
                        <span>Ventas, inventario y movimientos</span>
                    </Link>
                    <Link to="/gestion" className="staff-link">
                        <strong>Gestión</strong>
                        <span>Caja, turno e inventario</span>
                    </Link>
                </nav>
            </div>
        </main>
    );
};
