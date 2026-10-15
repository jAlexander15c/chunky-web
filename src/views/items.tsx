import { getPromoCart, getPromoLabel, hasPromoForItem, formatPromoDate, usePromos } from "@/helpers/promos";
import "../components/promos.css";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { PiArrowLeftBold, PiPlusBold, PiSlidersHorizontalBold, PiStarFourFill, PiWhatsappLogoBold } from "react-icons/pi";

import { Mascot, ProductOptions, QuantityStepper, Stamp, useCart } from "@/components";
import {
    formatPrice,
    getCategoryById,
    getCategoryImageUrl,
    isSpecialCategory,
    getCategoryName,
    getCatalogScope,
    getCategoryPresentation,
    getItemModifiers,
    getItemPrice,
    getClosedLabel,
    getWhatsAppUrl,
    hasItemAvailableForSale,
    hasItemModifiers,
    isAcceptingOrders,
    useCategories,
    useItems,
    useModifiers,
    useSettings,
    trackEvent,
    getAvailableQuantity,
    getItemCartQuantity,
    getLineMax,
    getStockNote,
    isPastaOnlyNow,
} from "@/helpers";
import type { IModifier } from "@/helpers";
import type { IItem } from "@/interfaces";

/** Texto plano de la descripcion del POS: quita etiquetas y decodifica entidades (&oacute;, &amp;...). */
const getPlainText = (html?: string) => {
    if (!html) return "";
    const text = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
    return text.replace(/\s+/g, " ").trim();
};

const ProductSkeletons = () => (
    <div className="products" aria-busy="true" aria-label="Cargando productos">
        {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="stamp-lift">
                <div className="stamp stamp--md product product--skeleton">
                    <span className="skeleton skeleton--image" />
                    <span className="skeleton skeleton--line" />
                    <span className="skeleton skeleton--line skeleton--short" />
                </div>
            </div>
        ))}
    </div>
);

interface IProductCardProps {
    item: IItem;
    index: number;
    /** Cuando vuelve a abrir, o null si hoy se puede pedir. */
    closedLabel: string | null;
    modifiers: IModifier[];
    onChooseOptions: (item: IItem) => void;
}

const ProductCard = ({ item, index, closedLabel, modifiers, onChooseOptions }: IProductCardProps) => {
    const { lines, addItem, setQuantity, getQuantity } = useCart();
    const { promos } = usePromos();
    const promo = getPromoCart([{ lineKey: item.id, item, quantity: 2 }], promos).prices[item.id]?.promo;
    const promoPrice = getPromoCart([{ lineKey: item.id, item, quantity: 1 }], promo ? [promo] : []).total;
    const quantity = getQuantity(item.id);
    const description = getPlainText(item.description);
    // Con modificadores se elige antes de agregar, asi que la tarjeta no lleva contador
    const isCustomizable = hasItemModifiers(item, modifiers);

    return (
        <Stamp
            src={item.image_url}
            alt={item.item_name}
            rotate={0}
            settle={index < 9}
            imageHeight={220}
            className="product-lift"
        >
            <div className="product">
                {promo && <span className="promo-seal">{getPromoLabel(promo)}</span>}
                <h2 className="product__name">{item.item_name}</h2>
                {description && <p className="product__desc">{description}</p>}
                {isCustomizable && (
                    <span className="product__tag"><PiSlidersHorizontalBold aria-hidden /> Personalizable</span>
                )}
                <div className="product__foot">
                    <span className="product__price">{promo?.kind === "percent" ? <><del className="promo-original">{formatPrice(getItemPrice(item))}</del>{formatPrice(promoPrice)}</> : <>{formatPrice(getItemPrice(item))}{promo && <small> · 2 por {formatPrice(getItemPrice(item))}</small>}</>}</span>
                    {closedLabel ? (
                        <span className="product__closed">{closedLabel}</span>
                    ) : isCustomizable ? (
                        <button type="button" className="button button--primary button--sm" aria-label={`Elegir opciones de ${item.item_name}`} onClick={() => {
                            trackEvent("product_open", item.id, item.item_name);
                            onChooseOptions(item);
                        }}>
                            Elegir
                        </button>
                    ) : quantity > 0 ? (
                        <QuantityStepper
                            quantity={quantity}
                            itemName={item.item_name}
                            onChange={(value) => setQuantity(item.id, value)}
                            max={getLineMax(lines, item, item.id)}
                            note={getStockNote(getAvailableQuantity(item), getItemCartQuantity(lines, item))}
                        />
                    ) : (
                        <button type="button" className="button button--primary button--sm" aria-label={`Agregar ${item.item_name}`} onClick={() => addItem(item)}>
                            <PiPlusBold aria-hidden /> Agregar
                        </button>
                    )}
                </div>
            </div>
        </Stamp>
    );
};

export const Items = () => {
    const { promos } = usePromos();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const selectedCategoryId = searchParams.get("categoryId") ?? "";
    useCategories();
    const category = getCategoryById(selectedCategoryId);
    const categoryName = (location.state as { categoryName?: string } | null)?.categoryName ?? getCategoryName(selectedCategoryId);
    const presentation = getCategoryPresentation(category);
    const isSpecial = isSpecialCategory(category);
    const { settings, isReady: isSettingsReady } = useSettings();
    const modifiers = useModifiers();
    const [optionsItem, setOptionsItem] = useState<IItem | null>(null);

    // Se cuenta aqui y no en el menu: tambien se llega desde el inicio o un enlace guardado.
    // Espera al nombre (las categorias pueden estar cargando) y cuenta una vez por categoria.
    const trackedCategoryRef = useRef("");
    useEffect(() => {
        if (!selectedCategoryId || !categoryName || trackedCategoryRef.current === selectedCategoryId) return;
        trackedCategoryRef.current = selectedCategoryId;
        trackEvent("category_open", selectedCategoryId, categoryName);
    }, [selectedCategoryId, categoryName]);
    // Con solo pasta y bebidas aqui solo se venden bebidas; la pasta se arma en su propia hoja
    const isBlockedToday = isPastaOnlyNow(settings) && selectedCategoryId !== settings.beveragesCategoryId;
    const { items, loading: isLoadingItems, error } = useItems(
        isSettingsReady && !isBlockedToday ? selectedCategoryId : "",
        getCatalogScope(settings.pastaMode, settings.pastaFullMenu)
    );
    const loading = isLoadingItems || !isSettingsReady;
    const isOpen = isAcceptingOrders(settings);

    const availableItems = items.filter(
        (item) => item.category_id === selectedCategoryId && item.id !== settings.pasta?.itemId && hasItemAvailableForSale(item)
    );

    return (
        <main className="section page-items">
            <div className="section__inner">
                {isSpecial ? (
                    // Especial: portada mora con su foto en estampilla, para venderla
                    <header className="category-band category-band--special">
                        <div className="category-band__copy">
                            <Link to="/menu" className="category-band__back">
                                <PiArrowLeftBold aria-hidden /> Volver al tablero
                            </Link>
                            <span className="category-band__pill">
                                <PiStarFourFill aria-hidden /> Especial · por tiempo limitado
                            </span>
                            <h1 className="category-band__title">{categoryName}</h1>
                            <p className="category-band__desc">{presentation.description}</p>
                        </div>
                        <Stamp
                            src={getCategoryImageUrl(category)}
                            alt={`Foto de ${categoryName}`}
                            caption="Especial"
                            code="★"
                            rotate={5}
                            loading="eager"
                            className="category-band__stamp"
                        />
                    </header>
                ) : (
                    <header className={`category-band category-band--${presentation.tone}`}>
                        <div>
                            <Link to="/menu" className="category-band__back">
                                <PiArrowLeftBold aria-hidden /> Volver al tablero
                            </Link>
                            <h1 className="category-band__title">{categoryName}</h1>
                            {category && <p className="category-band__desc">{presentation.description}</p>}
                        </div>
                        {presentation.origin && <span className="category-band__origin">{presentation.origin}</span>}
                        {presentation.schedule && <span className="category-band__origin">{presentation.schedule}</span>}
                    </header>
                )}

                {!selectedCategoryId && (
                    <p className="empty-note">Elige una categoría en el <Link to="/menu" className="text-link">tablero</Link>.</p>
                )}

                {selectedCategoryId && isSettingsReady && isBlockedToday && (
                    <p className="empty-note">
                        Hoy es día de pasta: solo vendemos pasta y bebidas. <Link to="/menu" className="text-link">Ver el tablero de hoy</Link>.
                    </p>
                )}

                {selectedCategoryId && !isBlockedToday && loading && <ProductSkeletons />}

                {selectedCategoryId && !isBlockedToday && !loading && error && (
                    <div className="empty-note">
                        <p>No pudimos cargar los productos. Intenta de nuevo en un momento o pídenos directo.</p>
                        <a className="text-link" href={getWhatsAppUrl()} target="_blank" rel="noreferrer" onClick={() => trackEvent("whatsapp_click", "categoria-pronto")}>
                            <PiWhatsappLogoBold aria-hidden /> Escríbenos por WhatsApp
                        </a>
                    </div>
                )}

                {selectedCategoryId && !isBlockedToday && !loading && !error && availableItems.length === 0 && isSpecial && (
                    <div className="soon-note">
                        <Mascot className="soon-note__mascot" />
                        <p>
                            <b>Muy pronto en la barra.</b> Estamos preparando {categoryName}. Vuelve en unos días.{" "}
                            <Link to="/menu" className="text-link">Mira el resto del tablero</Link>.
                        </p>
                    </div>
                )}

                {selectedCategoryId && !isBlockedToday && !loading && !error && availableItems.length === 0 && !isSpecial && (
                    <p className="empty-note">
                        Por ahora no hay productos disponibles en esta categoría. <Link to="/menu" className="text-link">Mira el resto del tablero</Link>.
                    </p>
                )}

                {selectedCategoryId && !isBlockedToday && !loading && !error && availableItems.length > 0 && (
                    <>
                    {promos.filter((promo) => availableItems.some((item) => hasPromoForItem(promo, item))).map((promo) => <p className="promo-banner" key={promo.id}><b>{promo.name}</b> · {promo.kind === "two_for_one" ? "Llévate 2 y paga 1" : getPromoLabel(promo)}{promo.endsOn && <small>Hasta el {formatPromoDate(promo.endsOn)}</small>}</p>)}
                    <div className="products">
                        {availableItems.map((item, index) => (
                            <ProductCard
                                key={item.id}
                                item={item}
                                index={index}
                                closedLabel={isOpen ? null : getClosedLabel(settings)}
                                modifiers={modifiers}
                                onChooseOptions={setOptionsItem}
                            />
                        ))}
                    </div>
                    </>
                )}

                <ProductOptions
                    item={optionsItem}
                    modifiers={optionsItem ? getItemModifiers(optionsItem, modifiers) : []}
                    onClose={() => setOptionsItem(null)}
                />
            </div>
        </main>
    );
};
