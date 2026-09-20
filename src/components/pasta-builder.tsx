import { useState } from "react";
import { Drawer, Portal, useBreakpointValue } from "@chakra-ui/react";
import { PiCheckBold, PiMinusBold, PiPlusBold, PiXBold } from "react-icons/pi";

import { AnimatedPrice } from "./animated-price";
import { Stamp } from "./stamp";
import { useCart } from "./use-cart";
import { usePastaBuilder } from "./use-pasta-builder";

import {
    PASTA_STEPS,
    buildPastaItem,
    formatPastaOptions,
    isPastaOptionsComplete,
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

const PastaBuilderForm = ({ pasta, onDone }: { pasta: IPastaSettings; onDone: () => void }) => {
    const { addItem, setIsOpen } = useCart();
    const [selection, setSelection] = useState<Partial<IPastaOptions>>({});
    const [quantity, setQuantity] = useState(1);

    const isComplete = isPastaOptionsComplete(selection);
    const summary = PASTA_STEPS.every((step) => !selection[step.key])
        ? "Elige la pasta, la salsa y la proteína"
        : PASTA_STEPS.map((step) => selection[step.key] ?? "…").join(" · ");

    const chooseOption = (key: keyof IPastaOptions, value: string) => setSelection((current) => ({ ...current, [key]: value }));

    const addToCart = () => {
        if (!isPastaOptionsComplete(selection)) return;

        const item = buildPastaItem(pasta);
        for (let count = 0; count < quantity; count++) addItem(item, selection);
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
            </div>

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
                    Agregar · <AnimatedPrice value={pasta.price * quantity} />
                </button>
            </div>
            {!isComplete && <p className="pasta__hint">Elige las tres opciones para agregarla.</p>}
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
                            {pasta && <PastaBuilderForm pasta={pasta} onDone={close} />}
                        </Drawer.Body>
                    </Drawer.Content>
                </Drawer.Positioner>
            </Portal>
        </Drawer.Root>
    );
};
