import { Link } from "react-router";
import { PiArrowRightBold, PiStarFourFill } from "react-icons/pi";

import { Mascot, MenuBoard, Stamp } from "@/components";
import {
    OPENING_HOURS,
    getCategoryByName,
    getCategoryImageUrl,
    getOpeningStatusLabel,
    isWithinOperatingHours,
    useCategories,
} from "@/helpers";

// Fotos de categoria del bucket de R2
const cookiesPhoto = getCategoryImageUrl("galletas");
const savoryPhoto = getCategoryImageUrl("salados");
const drinksPhoto = getCategoryImageUrl("bebidas");

const MARQUEE_WORDS = ["Galletas estilo New York", "Focaccias", "Pasta", "Tostadas", "Matcha", "Desayunos"];

const ORDER_STEPS = [
    { title: "Elige en el tablero", text: "Agrega lo que se te antoje." },
    { title: "Revisa tu carrito", text: "Suma, resta y mira el total." },
    { title: "Envíalo por WhatsApp", text: "Sale escrito. Te respondemos para confirmar." },
];

/** Enlace a una categoria por nombre, o al menu completo si aun no cargan las categorias. */
const useCategoryLink = () => {
    const { categories } = useCategories();

    return (name: string) => {
        const category = getCategoryByName(categories, name);
        return category
            ? { to: `/items?categoryId=${category.id}`, state: { categoryName: category.name } }
            : { to: "/menu", state: undefined };
    };
};

const Marquee = () => (
    <div className="marquee" aria-hidden>
        <div className="marquee__track">
            {[0, 1].map((copy) => (
                <span key={copy} className="marquee__group">
                    {MARQUEE_WORDS.map((word) => (
                        <span key={word} className="marquee__item">
                            {word} <PiStarFourFill className="marquee__star" />
                        </span>
                    ))}
                </span>
            ))}
        </div>
    </div>
);

export const Home = () => {
    const getCategoryLink = useCategoryLink();
    const isOpen = isWithinOperatingHours();
    const cookies = getCategoryLink("galletas");
    const savory = getCategoryLink("salados");
    const drinks = getCategoryLink("bebidas");

    return (
        <main className="home">
            <section className="hero">
                <div className="hero__copy">
                    <h1 className="hero__title">
                        <span className="hero__title-block">De New York a Kioto,</span>
                        <span className="script hero__title-script">con escala en Italia.</span>
                    </h1>
                    <p className="hero__sub">
                        Galletas estilo New York, focaccias con pesto y matcha, nuestra bebida estrella. Arma tu pedido y envíalo por WhatsApp.
                    </p>
                    <div className="hero__actions">
                        <Link to="/menu" className="button button--primary button--lg">
                            Ver el menú <PiArrowRightBold aria-hidden />
                        </Link>
                        <span className="hero__status">{getOpeningStatusLabel(isOpen)}</span>
                    </div>
                </div>

                <div className="hero__stage" aria-hidden>
                    <div className="hero__disc" />
                    <div className="hero__ring" />
                    <Stamp src={cookiesPhoto} alt="" caption="New York" code="galletas" rotate={-9} className="hero__stamp hero__stamp--ny stamp-lift--cloud" imagePosition="45% 45%" loading="eager" />
                    <Stamp src={savoryPhoto} alt="" caption="Italia" code="salados" rotate={7} className="hero__stamp hero__stamp--it stamp-lift--cloud" imagePosition="85% 20%" loading="eager" />
                    <Stamp src={drinksPhoto} alt="" caption="Japón" code="matcha" rotate={6} className="hero__stamp hero__stamp--jp stamp-lift--cloud" imagePosition="28% 55%" loading="eager" />
                    <Mascot bob className="hero__mascot" loading="eager" />
                </div>
            </section>

            <Marquee />

            <section id="pasaporte" className="section passport">
                <div className="section__inner">
                    <h2 className="section__title">
                        Un menú con <span className="script section__script">pasaporte</span>
                    </h2>
                    <p className="section__lede">
                        Tres paradas en una misma barra: la galleta de New York, los salados de Italia y el matcha de Japón.
                    </p>

                    <div className="passport__grid">
                        <article className="passport__cell passport__cell--jp">
                            <span className="passport__seal" lang="ja" aria-label="Matcha, en japonés">抹茶</span>
                            <p className="passport__origin">Japón</p>
                            <h3 className="passport__title">Matcha, la estrella de la casa</h3>
                            <p className="passport__text">Frío o caliente, cremoso y del mismo verde que nuestra mascota.</p>
                            <Link to={drinks.to} state={drinks.state} className="text-link">Ver bebidas</Link>
                            <div className="passport__stamps passport__stamps--jp">
                                <Stamp src={drinksPhoto} alt="Matcha y bebidas de Chunky Bites" caption="Bebidas" code="JP" rotate={-4} settle imagePosition="30% 55%" className="passport__stamp-a stamp-lift--cloud" />
                                <Mascot className="passport__mascot" />
                            </div>
                        </article>

                        <article className="passport__cell passport__cell--ny">
                            <Stamp src={cookiesPhoto} alt="Galletas estilo New York" caption="Galletas" code="NY" rotate={-5} settle imagePosition="45% 45%" className="passport__stamp-single stamp-lift--cloud" />
                            <div>
                                <p className="passport__origin">New York</p>
                                <h3 className="passport__title passport__title--sm">Galletas estilo New York</h3>
                                <p className="passport__text">Gruesas, crujientes por fuera y suaves por dentro.</p>
                                <Link to={cookies.to} state={cookies.state} className="text-link">Ver galletas</Link>
                            </div>
                        </article>

                        <article className="passport__cell passport__cell--it">
                            <div>
                                <p className="passport__origin">Italia</p>
                                <h3 className="passport__title passport__title--sm">Salados con acento italiano</h3>
                                <p className="passport__text">Focaccias, tostadas y pasta, para cualquier hora.</p>
                                <Link to={savory.to} state={savory.state} className="text-link">Ver salados</Link>
                            </div>
                            <Stamp src={savoryPhoto} alt="Tostadas de Chunky Bites" caption="Salados" code="IT" rotate={5} settle imagePosition="85% 20%" className="passport__stamp-single stamp-lift--cloud" />
                        </article>
                    </div>
                </div>
            </section>

            <section id="menu" className="section counter">
                <div className="section__inner counter__grid">
                    <div>
                        <h2 className="section__title">
                            Hoy en la <span className="script section__script">barra</span>
                        </h2>
                        <p className="section__lede">
                            El tablero muestra solo lo disponible ahora mismo. Toca una categoría para ver productos y precios.
                        </p>
                        <MenuBoard />
                    </div>

                    <div id="como-pedir" className="counter__aside">
                        <div className="ticket">
                            <div className="ticket__head">
                                <span>Así se pide</span>
                                <span>Chunky Bites</span>
                            </div>
                            <ol className="ticket__lines">
                                {ORDER_STEPS.map((step, index) => (
                                    <li key={step.title} className="ticket__line">
                                        <span className="script ticket__number">{index + 1}</span>
                                        <div>
                                            <h3 className="ticket__title">{step.title}</h3>
                                            <p className="ticket__text">{step.text}</p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </div>

                        <div className="hours">
                            <span className={`hours__stamp ${isOpen ? "" : "hours__stamp--closed"}`}>
                                {isOpen ? "Abierto ahora" : "Cerrado ahora"}
                            </span>
                            <h3 className="hours__title">Horario de barra</h3>
                            <dl className="hours__list">
                                {OPENING_HOURS.map((row) => (
                                    <div key={row.days} className="hours__row">
                                        <dt>{row.days}</dt>
                                        <dd>{row.hours}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    </div>
                </div>
            </section>

            <section className="closing">
                <div className="closing__inner">
                    <Mascot className="closing__mascot" />
                    <h2 className="closing__title">
                        Próxima parada: <span className="script closing__script">tu antojo.</span>
                    </h2>
                    <Link to="/menu" className="button button--primary button--lg">
                        Ver el menú <PiArrowRightBold aria-hidden />
                    </Link>
                </div>
            </section>
        </main>
    );
};
