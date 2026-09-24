import { Link } from "react-router";
import { PiArrowRightBold, PiStarFourFill } from "react-icons/pi";

import { Stamp } from "./stamp";

import { formatPrice, useSpecialCategories } from "@/helpers";
import type { ISpecialCategory } from "@/helpers";

const getProductCountLabel = (count: number) => (count === 1 ? "1 producto" : `${count} productos`);

/** Un pase de abordar por especial: la foto va en el talon, como estampilla. */
const SpecialTicket = ({ special }: { special: ISpecialCategory }) => {
    const { category, photo, isComingSoon, productCount, fromPrice } = special;

    return (
        <article className={`pass${isComingSoon ? " pass--soon" : ""}`}>
            <div className="pass__main">
                <span className="pass__eyebrow">
                    <PiStarFourFill className="pass__star" aria-hidden />
                    {isComingSoon ? "Muy pronto en la barra" : "Edición especial · por tiempo limitado"}
                </span>
                <h3 className="pass__name">{category.name}</h3>
                <p className="pass__pitch">
                    {isComingSoon
                        ? "Estamos preparando algo especial. Vuelve en unos días para probarlo."
                        : "Solo por unos días en la barra. Pídelo antes de que se acabe."}
                </p>
                {!isComingSoon && productCount > 0 && (
                    <p className="pass__meta">
                        <span><b>{productCount}</b> {productCount === 1 ? "producto" : "productos"}</span>
                        {fromPrice !== null && <span>desde <b>{formatPrice(fromPrice)}</b></span>}
                    </p>
                )}
                <div className="pass__actions">
                    {isComingSoon ? (
                        <span className="pass__soon">Muy pronto</span>
                    ) : (
                        <Link
                            to={`/items?categoryId=${category.id}`}
                            state={{ categoryName: category.name }}
                            className="pass__cta"
                            aria-label={`Pedir ${category.name}${productCount > 0 ? `, ${getProductCountLabel(productCount)}` : ""}`}
                        >
                            Pídelo ya <PiArrowRightBold aria-hidden />
                        </Link>
                    )}
                </div>
            </div>
            <div className="pass__stub">
                <Stamp
                    src={photo}
                    alt={`Foto de ${category.name}`}
                    caption="Especial"
                    code="★"
                    rotate={6}
                    settle
                    className="pass__stamp"
                />
                <span className="pass__stubline">Parada<b>Especial</b></span>
            </div>
        </article>
    );
};

/**
 * Franja del inicio para las categorias especiales. No aparece si no hay ninguna (ni mientras
 * cargan sus productos: no se anuncia "Muy pronto" sin saberlo).
 */
export const SpecialSpotlight = () => {
    const specials = useSpecialCategories().filter((special) => !special.isLoading);
    if (specials.length === 0) return null;

    return (
        <section className="section spotlight" aria-labelledby="spotlight-title">
            <div className="section__inner">
                <div className="spotlight__head">
                    <h2 id="spotlight-title" className="section__title">
                        Parada <span className="script section__script">especial</span>
                    </h2>
                    <p className="spotlight__sub">Por tiempo limitado en la barra. Cuando se acaban, se acaban.</p>
                </div>
                <div className={`spotlight__tickets${specials.length === 1 ? " spotlight__tickets--one" : ""}`}>
                    {specials.map((special) => (
                        <SpecialTicket key={special.category.id} special={special} />
                    ))}
                </div>
            </div>
        </section>
    );
};
