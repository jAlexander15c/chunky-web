import { useMemo, useState } from "react";
import { Drawer, Portal, useBreakpointValue } from "@chakra-ui/react";
import { PiCaretUpBold, PiCheckBold, PiMinusBold, PiPlusBold, PiXBold } from "react-icons/pi";

import { AnimatedPrice } from "./animated-price";
import { QuantityStepper } from "./quantity-stepper";
import { Stamp } from "./stamp";
import { useCart } from "./use-cart";
import { usePastaBuilder } from "./use-pasta-builder";

import {
    PASTA_STEPS,
    buildPastaItem,
    formatPastaOptions,
    formatPrice,
    getCatalogScope,
    getItemPrice,
    hasItemAvailableForSale,
    isPastaOptionsComplete,
    useItems,
    useSettings,
} from "@/helpers";
import type { IPastaOptions, IPastaSettings } from "@/helpers";

const MAX_QUANTITY = 9;

// Pequeño punto de color junto a cada salsa; las que no estan aqui se muestran sin punto
const SAUCE_SWATCH: Record<string, string> = {
    "Aglio e Olio": "var(--mantequilla)",
    "Pomodoro Chunky": "#e59a7c",
    "Pesto Genovese": "#9db24a",
};

const MAX_DRINK_QUANTITY = 9;

interface IPastaBuilderFormProps {
    pasta: IPastaSettings;
    /** Categoria de bebidas; sin ella el armador no ofrece bebidas. */
    beveragesCategoryId: string | null;
    onDone: () => void;
}

const PastaBuilderForm = ({ pasta, beveragesCategoryId, onDone }: IPastaBuilderFormProps) => {
    const { addItem, setIsOpen } = useCart();
    const [selection, setSelection] = useState<Partial<IPastaOptions>>({});
    const [quantity, setQuantity] = useState(1);
    const [isDrinksOpen, setIsDrinksOpen] = useState(false);
    // Las bebidas se piden la primera vez que se abre la lista y se conservan al cerrarla
    const [hasOpenedDrinks, setHasOpenedDrinks] = useState(false);
    const [drinkQuantities, setDrinkQuantities] = useState<Record<string, number>>({});

    const { items: drinkItems, loading: isLoadingDrinks, error: drinksError } = useItems(
        hasOpenedDrinks && beveragesCategoryId ? beveragesCategoryId : "",
        getCatalogScope(true)
    );
    const drinks = useMemo(
        () => drinkItems.filter((item) => item.category_id === beveragesCategoryId && hasItemAvailableForSale(item)),
        [drinkItems, beveragesCategoryId]
    );
    const pickedDrinks = drinks.filter((item) => drinkQuantities[item.id] > 0);
    const pickedCount = pickedDrinks.reduce((sum, item) => sum + drinkQuantities[item.id], 0);
    const drinksTotal = pickedDrinks.reduce((sum, item) => sum + getItemPrice(item) * drinkQuantities[item.id], 0);

    const isComplete = isPastaOptionsComplete(selection);
    const summary = PASTA_STEPS.every((step) => !selection[step.key])
        ? "Elige la pasta, la salsa y la proteína"
        : PASTA_STEPS.map((step) => selection[step.key] ?? "…").join(" · ");

    const chooseOption = (key: keyof IPastaOptions, value: string) => setSelection((current) => ({ ...current, [key]: value }));

    const openDrinks = () => {
        setHasOpenedDrinks(true);
        setIsDrinksOpen(true);
    };

    const changeDrink = (itemId: string, nextQuantity: number) => setDrinkQuantities((current) => {
        const next = { ...current };
        if (nextQuantity <= 0) delete next[itemId];
        else next[itemId] = Math.min(nextQuantity, MAX_DRINK_QUANTITY);
        return next;
    });

    const addToCart = () => {
        if (!isPastaOptionsComplete(selection)) return;

        const item = buildPastaItem(pasta);
        for (let count = 0; count < quantity; count++) addItem(item, selection);
        // Las bebidas elegidas entran al carrito junto con la pasta
        for (const drink of pickedDrinks) {
            for (let count = 0; count < drinkQuantities[drink.id]; count++) addItem(drink);
        }
        onDone();
        // El carrito se abre para seguir con la entrega; ahi mismo se ve lo que armo
        setIsOpen(true);
    };

    return (
        <>
            <div className="pasta__intro">
                {pasta.imageUrl && <Stamp src={pasta.imageUrl} alt={pasta.itemName} size="sm" rotate={-4} className="pasta__thumb" />}
                <div>
                    <p className="pasta__lede">Elige cómo la quieres armar.</p>
                    <span className="pasta__price">{`$${pasta.price.toFixed(2)}`}</span>
                </div>
            </div>

            {PASTA_STEPS.map((step, index) => (
                <fieldset key={step.key} className="pasta__group">
                    <legend className="pasta__legend">
                        {step.label}
                        <span>{index + 1} de {PASTA_STEPS.length}</span>
                    </legend>
                    <div className="pasta__chips">
                        {pasta.options[step.key].map((option) => {
                            const isChecked = selection[step.key] === option;
                            return (
                                <label key={option} className={`pasta-chip ${isChecked ? "pasta-chip--on" : ""}`}>
                                    <input
                                        type="radio"
                                        name={`pasta-${step.key}`}
                                        value={option}
                                        checked={isChecked}
                                        onChange={() => chooseOption(step.key, option)}
                                    />
                                    {isChecked
                                        ? <PiCheckBold aria-hidden />
                                        : step.key === "sauce" && SAUCE_SWATCH[option] && <i className="pasta-chip__swatch" style={{ background: SAUCE_SWATCH[option] }} aria-hidden />}
                                    {option}
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
            ))}

            <div className="pasta__summary" aria-live="polite">
                <b>Tu plato</b>
                <span>{isComplete ? formatPastaOptions(selection) : summary}</span>
                {pickedCount > 0 && (
                    <span className="pasta__summary-extra">
                        + {pickedDrinks.map((item) => `${drinkQuantities[item.id]}× ${item.item_name}`).join(", ")}
                    </span>
                )}
            </div>

            {beveragesCategoryId && (isDrinksOpen ? (
                <section className="pasta__drinks" aria-label="Bebidas">
                    <div className="pasta__drinks-head">
                        <b>Bebidas <span>(opcional)</span></b>
                        <button type="button" className="pasta__drinks-close" onClick={() => setIsDrinksOpen(false)}>
                            Cerrar <PiCaretUpBold aria-hidden />
                        </button>
                    </div>

                    {isLoadingDrinks ? (
                        <p className="pasta__hint">Cargando bebidas…</p>
                    ) : drinksError || drinks.length === 0 ? (
                        <p className="pasta__hint">No hay bebidas disponibles ahora.</p>
                    ) : (
                        <ul className="pasta__drink-list">
                            {drinks.map((item) => {
                                const drinkQuantity = drinkQuantities[item.id] ?? 0;
                                return (
                                    <li key={item.id} className="pasta__drink">
                                        <span className="pasta__drink-name">{item.item_name}</span>
                                        <span className="pasta__drink-price">{formatPrice(getItemPrice(item))}</span>
                                        {drinkQuantity > 0 ? (
                                            <QuantityStepper
                                                size="sm"
                                                quantity={drinkQuantity}
                                                itemName={item.item_name}
                                                onChange={(value) => changeDrink(item.id, value)}
                                            />
                                        ) : (
                                            <button
                                                type="button"
                                                className="icon-button pasta__drink-add"
                                                aria-label={`Agregar ${item.item_name}`}
                                                onClick={() => changeDrink(item.id, 1)}
                                            >
                                                <PiPlusBold aria-hidden />
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            ) : (
                <button type="button" className="button button--ghost button--block pasta__drinks-open" onClick={openDrinks}>
                    <PiPlusBold aria-hidden />
                    {pickedCount > 0
                        ? `Bebidas: ${pickedCount} elegida${pickedCount === 1 ? "" : "s"} · cambiar`
                        : "Agregar una bebida (opcional)"}
                </button>
            ))}

            {!isComplete && <p className="pasta__hint">Elige las tres opciones para agregarla.</p>}

            <div className="pasta__buy">
                <div className="stepper stepper--md" role="group" aria-label="Cantidad de platos">
                    <button
                        type="button"
                        className="stepper__button"
                        onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                        disabled={quantity === 1}
                        aria-label="Quitar un plato"
                    >
                        <PiMinusBold aria-hidden />
                    </button>
                    <span className="stepper__value" aria-live="polite">{quantity}</span>
                    <button
                        type="button"
                        className="stepper__button"
                        onClick={() => setQuantity((current) => Math.min(MAX_QUANTITY, current + 1))}
                        disabled={quantity === MAX_QUANTITY}
                        aria-label="Agregar otro plato"
                    >
                        <PiPlusBold aria-hidden />
                    </button>
                </div>

                <button type="button" className="button button--primary pasta__add" onClick={addToCart} disabled={!isComplete}>
                    Agregar · <AnimatedPrice value={pasta.price * quantity + drinksTotal} />
                </button>
            </div>
        </>
    );
};

/** Hoja del armador de pasta: inferior en movil, lateral desde tablet (igual que el carrito). */
export const PastaBuilder = () => {
    const { isOpen, close } = usePastaBuilder();
    const { settings } = useSettings();
    const isSheet = useBreakpointValue({ base: true, md: false }) ?? true;
    const pasta = settings.pasta;

    return (
        <Drawer.Root
            open={isOpen && Boolean(pasta)}
            onOpenChange={(event) => { if (!event.open) close(); }}
            placement={isSheet ? "bottom" : "end"}
            size={isSheet ? "full" : "sm"}
            lazyMount
            unmountOnExit
        >
            <Portal>
                <Drawer.Backdrop bg="rgba(38, 48, 92, 0.45)" />
                <Drawer.Positioner>
                    <Drawer.Content
                        className="carrito pasta"
                        bg="#fffef6"
                        color="#26305c"
                        boxShadow="none"
                        roundedTop={isSheet ? "24px" : "0"}
                        maxW={isSheet ? "100vw" : "470px"}
                        h={isSheet ? "auto" : "100dvh"}
                        maxH={isSheet ? "88dvh" : "100dvh"}
                    >
                        <header className="carrito__head">
                            <span className="carrito__grip" aria-hidden />
                            <Drawer.Title asChild>
                                <h2 className="carrito__title">Arma tu pasta</h2>
                            </Drawer.Title>
                            <Drawer.CloseTrigger asChild>
                                <button type="button" className="icon-button carrito__close" aria-label="Cerrar el armador">
                                    <PiXBold aria-hidden />
                                </button>
                            </Drawer.CloseTrigger>
                        </header>

                        <Drawer.Body className="carrito__body pasta__body">
                            {pasta && <PastaBuilderForm pasta={pasta} beveragesCategoryId={settings.beveragesCategoryId} onDone={close} />}
                        </Drawer.Body>
                    </Drawer.Content>
                </Drawer.Positioner>
            </Portal>
        </Drawer.Root>
    );
};
