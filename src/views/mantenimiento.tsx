import icon from "@/assets/logos/icon.png";

export const Mantenimiento = () => {


    return (
        <div className="mantenimiento">
            <img src={icon} alt="Icono de error" />
            <h1>En mantenimiento</h1>
            <p>Estamos trabajando para mejorar nuestro sitio. Por favor, vuelva más tarde.</p>
        </div>
    )
}