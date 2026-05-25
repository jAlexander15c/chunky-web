import icon from "@/assets/logos/icon.png";

export const Mantenimiento = () => {
    return (
        <div className="mantenimiento">
            <img src={icon} alt="Icono de mantenimiento" />
            <h1>Estamos en mantenimiento</h1>
            <p>Lo sentimos, el sitio está temporalmente fuera de servicio mientras realizamos mejoras.</p>
            <p>Por favor vuelve más tarde.</p>
        </div>
    )
}