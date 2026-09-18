import mascota from "@/assets/logos/mascota.png";

interface IMascotProps {
    className?: string;
    /** Balanceo continuo; se apaga con reducir movimiento. */
    bob?: boolean;
    alt?: string;
    loading?: "lazy" | "eager";
}

/** Mascota con contorno crema tipo sticker para que no se pierda sobre fondos de color. */
export const Mascot = ({ className, bob = false, alt = "", loading = "lazy" }: IMascotProps) => (
    <img
        className={`mascot ${bob ? "mascot--bob" : ""} ${className ?? ""}`}
        src={mascota}
        alt={alt}
        width={1000}
        height={1000}
        loading={loading}
        fetchPriority={loading === "eager" ? "high" : undefined}
    />
);
