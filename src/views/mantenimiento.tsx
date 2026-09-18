import { Mascot } from "@/components";

export const Mantenimiento = () => {
    return (
        <main className="maintenance">
            <Mascot className="maintenance__mascot" bob alt="Mascota de Chunky Bites" loading="eager" />
            <h1 className="section__title">
                Volvemos <span className="script section__script">en un momento.</span>
            </h1>
            <p className="section__lede">Estamos haciendo mejoras en el sitio. Por favor vuelve más tarde.</p>
        </main>
    );
};
