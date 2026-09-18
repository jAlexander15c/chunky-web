import { useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { PiArrowLeftBold, PiPlusBold, PiWhatsappLogoBold } from "react-icons/pi";

import { QuantityStepper, Stamp, useCart } from "@/components";
import {
    formatPrice,
    getCategoryById,
    getCategoryName,
    getCategoryPresentation,
    getItemPrice,
    getNextOpeningLabel,
    getWhatsAppUrl,
    hasItemAvailableForSale,
    isWithinOperatingHours,
    useCategories,
    useItems,
} from "@/helpers";
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
    isOpen: boolean;
}

const ProductCard = ({ item, index, isOpen }: IProductCardProps) => {
    const { addItem, setQuantity, getQuantity } = useCart();
    const quantity = getQuantity(item.id);
    const description = getPlainText(item.description);

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
                <h2 className="product__name">{item.item_name}</h2>
                {description && <p className="product__desc">{description}</p>}
                <div className="product__foot">
                    <span className="product__price">{formatPrice(getItemPrice(item))}</span>
                    {!isOpen ? (
                        <span className="product__closed">{getNextOpeningLabel()}</span>
                    ) : quantity > 0 ? (
                        <QuantityStepper quantity={quantity} itemName={item.item_name} onChange={(value) => setQuantity(item.id, value)} />
                    ) : (
                        <button type="button" className="button button--primary button--sm" onClick={() => addItem(item)}>
                            <PiPlusBold aria-hidden /> Agregar
                        </button>
                    )}
                </div>
            </div>
        </Stamp>
    );
};

export const Items = () => {
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const selectedCategoryId = searchParams.get("categoryId") ?? "";
    useCategories();
    const category = getCategoryById(selectedCategoryId);
    const categoryName = (location.state as { categoryName?: string } | null)?.categoryName ?? getCategoryName(selectedCategoryId);
    const presentation = getCategoryPresentation(category);
    const { items, loading, error } = useItems(selectedCategoryId);
    const isOpen = isWithinOperatingHours();

    const availableItems = useMemo(
        () => items.filter((item) => item.category_id === selectedCategoryId && hasItemAvailableForSale(item)),
        [items, selectedCategoryId]
    );

    return (
        <main className="section page-items">
            <div className="section__inner">
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

                {!selectedCategoryId && (
                    <p className="empty-note">Elige una categoría en el <Link to="/menu" className="text-link">tablero</Link>.</p>
                )}

                {selectedCategoryId && loading && <ProductSkeletons />}

                {selectedCategoryId && !loading && error && (
                    <div className="empty-note">
                        <p>No pudimos cargar los productos. Intenta de nuevo en un momento o pídenos directo.</p>
                        <a className="text-link" href={getWhatsAppUrl()} target="_blank" rel="noreferrer">
                            <PiWhatsappLogoBold aria-hidden /> Escríbenos por WhatsApp
                        </a>
                    </div>
                )}

                {selectedCategoryId && !loading && !error && availableItems.length === 0 && (
                    <p className="empty-note">
                        Por ahora no hay productos disponibles en esta categoría. <Link to="/menu" className="text-link">Mira el resto del tablero</Link>.
                    </p>
                )}

                {selectedCategoryId && !loading && !error && availableItems.length > 0 && (
                    <div className="products">
                        {availableItems.map((item, index) => (
                            <ProductCard key={item.id} item={item} index={index} isOpen={isOpen} />
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
};
