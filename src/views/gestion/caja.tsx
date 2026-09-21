import { useCallback, useEffect, useMemo, useState } from "react";

import { ModifierPicker } from "@/components";
import {
    HttpError,
    PAYMENT_LABEL,
    addTicketLine,
    changeTicketLine,
    fetchTables,
    formatCash,
    formatQuantity,
    getItemModifiers,
    getItemPrice,
    hasItemModifiers,
    openTable,
    payTicket,
    sendTicketToKitchen,
    useCategories,
    useItems,
    useModifiers,
    voidTicket,
} from "@/helpers";
import type { ICartModifier, IShiftDetail, ITableSummary, ITicket, ITicketPayment, PaymentMethod } from "@/helpers";
import type { IItem } from "@/interfaces";

/** El mapa de mesas se relee solo: dos dispositivos tienen que ver lo mismo. */
const TABLES_REFRESH_MS = 8000;

const PAYMENT_METHODS: PaymentMethod[] = ["efectivo", "tarjeta", "yappy"];

const getMinutesSince = (value: string) => Math.floor((Date.now() - new Date(value).getTime()) / 60000);

/** "hace 5 min" o "hace 1 h 10", que es como se mira si una mesa lleva rato esperando. */
const formatWaiting = (value: string) => {
    const minutes = getMinutesSince(value);
    if (minutes < 1) return "recién";
    if (minutes < 60) return `hace ${minutes} min`;
    return `hace ${Math.floor(minutes / 60)} h ${minutes % 60}`;
};

/** "Galleta New York" -> "GN". Va en lugar de la foto cuando el producto no tiene una en Loyverse. */
const getItemInitials = (name: string) => {
    const words = name.split(/\s+/).filter((word) => word.length > 2);
    return (words.length ? words : [name]).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
};

const roundMoney =(value: number) => Math.round(value * 100) / 100;

const parseAmount = (value: string) => {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
};

/* ============ Cobro ============ */

interface IPayDialogProps {
    ticket: ITicket;
    onPay: (payments: ITicketPayment[]) => Promise<void>;
    onClose: () => void;
}

const PayDialog = ({ ticket, onPay, onClose }: IPayDialogProps) => {
    const [isMixed, setIsMixed] = useState(false);
    const [method, setMethod] = useState<PaymentMethod>("efectivo");
    const [received, setReceived] = useState("");
    const [mix, setMix] = useState<{ method: PaymentMethod; amount: string }[]>([
        { method: "efectivo", amount: "" },
        { method: "tarjeta", amount: "" },
    ]);
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const total = ticket.total;
    const mixTotal = roundMoney(mix.reduce((sum, row) => sum + parseAmount(row.amount), 0));
    const missing = roundMoney(total - mixTotal);
    const change = roundMoney(parseAmount(received) - total);

    const canPay = isMixed
        ? Math.abs(missing) < 0.005 && mix.every((row) => parseAmount(row.amount) > 0)
        : method !== "efectivo" || parseAmount(received) >= total - 0.005;

    const submit = async () => {
        const payments: ITicketPayment[] = isMixed
            ? mix.map((row) => ({ method: row.method, amount: roundMoney(parseAmount(row.amount)) }))
            : [{ method, amount: total }];

        setIsSending(true);
        setError("");

        try {
            await onPay(payments);
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo cobrar.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Cobrar la cuenta">
            <div className="ges-modal__panel">
                <h3 className="script">Cobrar {ticket.tableNumber === null ? "para llevar" : `mesa ${ticket.tableNumber}`}</h3>

                <div className="ges-total">
                    <span>Total a cobrar</span>
                    <b>{formatCash(total)}</b>
                </div>

                <div className="ges-pays" role="group" aria-label="Medio de pago">
                    {PAYMENT_METHODS.map((option) => (
                        <button
                            key={option}
                            type="button"
                            className="ges-pay"
                            aria-pressed={!isMixed && method === option}
                            onClick={() => { setIsMixed(false); setMethod(option); setError(""); }}
                        >
                            {PAYMENT_LABEL[option]}
                        </button>
                    ))}
                    <button
                        type="button"
                        className="ges-pay"
                        aria-pressed={isMixed}
                        onClick={() => { setIsMixed(true); setError(""); }}
                    >
                        Mixto
                    </button>
                </div>

                {isMixed ? (
                    <div className="ges-mix">
                        {mix.map((row, index) => (
                            <div className="ges-mix__row" key={index}>
                                <select
                                    value={row.method}
                                    aria-label={`Medio del pago ${index + 1}`}
                                    onChange={(event) =>
                                        setMix((current) =>
                                            current.map((one, i) =>
                                                i === index ? { ...one, method: event.target.value as PaymentMethod } : one
                                            )
                                        )
                                    }
                                >
                                    {PAYMENT_METHODS.map((option) => (
                                        <option key={option} value={option}>{PAYMENT_LABEL[option]}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={row.amount}
                                    placeholder="0.00"
                                    aria-label={`Monto del pago ${index + 1}`}
                                    onChange={(event) =>
                                        setMix((current) =>
                                            current.map((one, i) => (i === index ? { ...one, amount: event.target.value } : one))
                                        )
                                    }
                                />
                                {mix.length > 2 ? (
                                    <button
                                        type="button"
                                        className="ges-mix__drop"
                                        aria-label="Quitar este pago"
                                        onClick={() => setMix((current) => current.filter((_one, i) => i !== index))}
                                    >
                                        ×
                                    </button>
                                ) : (
                                    <span />
                                )}
                            </div>
                        ))}

                        <div className={`ges-mix__sum${Math.abs(missing) < 0.005 ? " is-ok" : " is-bad"}`}>
                            <span>
                                {Math.abs(missing) < 0.005
                                    ? "Suma exacta"
                                    : missing > 0
                                      ? `Falta ${formatCash(missing)}`
                                      : `Sobra ${formatCash(-missing)}`}
                            </span>
                            <span>{formatCash(mixTotal)} de {formatCash(total)}</span>
                        </div>

                        {mix.length < 3 ? (
                            <button
                                type="button"
                                className="ges-btn ges-btn--sm"
                                onClick={() => setMix((current) => [...current, { method: "yappy", amount: "" }])}
                            >
                                Agregar otro medio
                            </button>
                        ) : null}

                        <p className="ges-note">
                            En Loyverse el recibo va con el tipo «Mixto» y el desglose en la nota. El detalle
                            exacto queda aquí, que es lo que cuadra la caja.
                        </p>
                    </div>
                ) : method === "efectivo" ? (
                    <>
                        <label className="ges-field">
                            <span>Con cuánto paga</span>
                            <input
                                id="caja-recibido"
                                type="text"
                                inputMode="decimal"
                                autoFocus
                                value={received}
                                placeholder="0.00"
                                onChange={(event) => setReceived(event.target.value)}
                            />
                        </label>
                        <div className="ges-quick">
                            {[total, 20, 50, 100].map((value, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    onClick={() => setReceived(value.toFixed(2))}
                                >
                                    {index === 0 ? `Justo ${formatCash(value)}` : formatCash(value)}
                                </button>
                            ))}
                        </div>
                        <div className={`ges-change${received && change < -0.005 ? " is-short" : ""}`}>
                            <span>{received && change < -0.005 ? "Falta" : "Vuelto"}</span>
                            <b>{formatCash(received ? Math.abs(change) : 0)}</b>
                        </div>
                    </>
                ) : method === "yappy" ? (
                    <p className="ges-note">
                        El cliente paga por su app al comercio. Confirma solo cuando te llegue el aviso:
                        desde aquí no hay forma de verificarlo.
                    </p>
                ) : (
                    <p className="ges-note">Se cobra en el datáfono. Aquí solo se registra que fue con tarjeta.</p>
                )}

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button
                        type="button"
                        className="ges-btn ges-btn--solid"
                        onClick={() => void submit()}
                        disabled={!canPay || isSending}
                    >
                        {isSending
                            ? "Cobrando…"
                            : !isMixed && method === "efectivo" && change >= 0 && received
                              ? `Cobrar y dar ${formatCash(change)}`
                              : `Cobrar ${formatCash(total)}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ============ Anular ============ */

interface IVoidDialogProps {
    label: string;
    onVoid: (reason: string) => Promise<void>;
    onClose: () => void;
}

/** Anular queda registrado con motivo y con quién lo hizo: es dinero que no se cobra. */
const VoidDialog = ({ label, onVoid, onClose }: IVoidDialogProps) => {
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async () => {
        if (reason.trim().length < 3) {
            setError("Escribe por qué se anula.");
            return;
        }

        setIsSending(true);
        setError("");

        try {
            await onVoid(reason.trim());
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo anular.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Anular la cuenta">
            <div className="ges-modal__panel">
                <h3 className="script">Anular {label.toLowerCase()}</h3>
                <p className="ges-note">
                    La cuenta se cierra sin cobrar y queda registrada con tu nombre. Si algo ya salió de
                    cocina, se pierde.
                </p>
                <label className="ges-field">
                    <span>Por qué</span>
                    <input
                        id="caja-motivo"
                        type="text"
                        autoFocus
                        value={reason}
                        placeholder="El cliente se fue"
                        onChange={(event) => setReason(event.target.value)}
                    />
                </label>
                {error ? <p className="ges-error" role="alert">{error}</p> : null}
                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Volver</button>
                    <button type="button" className="ges-btn ges-btn--solid" onClick={() => void submit()} disabled={isSending}>
                        {isSending ? "Anulando…" : "Anular la cuenta"}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ============ Elegir opciones antes de agregar ============ */

interface IOptionsDialogProps {
    item: IItem;
    onAdd: (modifierOptionIds: string[]) => Promise<void>;
    onClose: () => void;
}

const OptionsDialog = ({ item, onAdd, onClose }: IOptionsDialogProps) => {
    const modifiers = useModifiers();
    const [chosen, setChosen] = useState<ICartModifier[]>([]);
    const [isSending, setIsSending] = useState(false);

    const itemModifiers = getItemModifiers(item, modifiers);

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Opciones de ${item.item_name}`}>
            <div className="ges-modal__panel">
                <h3 className="script">{item.item_name}</h3>
                <ModifierPicker modifiers={itemModifiers} chosen={chosen} onChange={setChosen} />
                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button
                        type="button"
                        className="ges-btn ges-btn--solid"
                        disabled={isSending}
                        onClick={async () => {
                            setIsSending(true);
                            await onAdd(chosen.map((one) => one.modifierOptionId));
                        }}
                    >
                        Agregar
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ============ Caja ============ */

interface IGestionCajaProps {
    token: string;
    onSessionExpired: () => void;
    onShiftChange: (shift: IShiftDetail | null) => void;
}

export const GestionCaja = ({ token, onSessionExpired, onShiftChange }: IGestionCajaProps) => {
    const [tables, setTables] = useState<ITableSummary[]>([]);
    const [ticket, setTicket] = useState<ITicket | null>(null);
    const [hasShift, setHasShift] = useState(false);
    // El catálogo se pide por categoría, así que siempre hay una elegida
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [options, setOptions] = useState<IItem | null>(null);
    const [isPaying, setIsPaying] = useState(false);
    const [isVoiding, setIsVoiding] = useState(false);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const { categories } = useCategories();
    const currentCategory = categoryId ?? categories[0]?.id;
    const { items } = useItems(currentCategory);
    const modifiers = useModifiers();

    const handleError = useCallback(
        (requestError: unknown, fallback: string) => {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : fallback);
        },
        [onSessionExpired]
    );

    const loadTables = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const data = await fetchTables(token, signal);
                setTables(data.tables);
                setHasShift(Boolean(data.shift));
                onShiftChange(data.shift);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                handleError(requestError, "No pudimos cargar las mesas.");
            } finally {
                setIsLoading(false);
            }
        },
        [token, handleError, onShiftChange]
    );

    // Solo se relee el mapa: con una cuenta abierta manda lo que responde el servidor
    useEffect(() => {
        const controller = new AbortController();
        void loadTables(controller.signal);

        const timer = window.setInterval(() => {
            if (!ticket) void loadTables();
        }, TABLES_REFRESH_MS);

        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [loadTables, ticket]);

    const run = async (action: () => Promise<{ ticket: ITicket }>, fallback: string) => {
        try {
            const data = await action();
            setTicket(data.ticket);
            setError("");
            return data.ticket;
        } catch (requestError) {
            handleError(requestError, fallback);
            return null;
        }
    };

    const visibleItems = useMemo(
        () => items.filter((item) => item.variants?.[0]?.variant_id),
        [items]
    );

    /* ---- Mapa de mesas ---- */
    if (!ticket) {
        return (
            <>
                {error ? <p className="ges-error" role="alert">{error}</p> : null}
                {!hasShift && !isLoading ? (
                    <p className="ges-warning">
                        No hay turno abierto. Ábrelo en Turno para tomar pedidos y cobrar.
                    </p>
                ) : null}

                {isLoading ? (
                    <p className="ges-empty">Cargando las mesas…</p>
                ) : (
                    <div className="ges-tables">
                        {tables.map((table) => {
                            const busy = table.ticketId !== null;
                            const tone = busy ? (table.pending > 0 ? " is-busy" : " is-ready") : "";

                            return (
                                <button
                                    key={table.label}
                                    type="button"
                                    className={`ges-table${tone}${table.tableNumber === null ? " ges-table--togo" : ""}`}
                                    // Sin turno no se abre una cuenta nueva; una que quedó abierta sí, para anularla
                                    disabled={!hasShift && !busy}
                                    onClick={() =>
                                        void run(
                                            () => openTable(token, table.tableNumber ?? 0),
                                            "No pudimos abrir la mesa."
                                        )
                                    }
                                >
                                    <span className="ges-table__n">{table.label}</span>
                                    {busy ? (
                                        <>
                                            <span className="ges-table__t">{formatCash(table.total)}</span>
                                            <span className="ges-table__m">
                                                {formatQuantity(table.items)} platos
                                                {table.openedAt ? ` · ${formatWaiting(table.openedAt)}` : ""}
                                            </span>
                                            {table.pending > 0 ? (
                                                <span className="ges-table__pend">{table.pending} por enviar</span>
                                            ) : (
                                                <span className="ges-table__ok">En cocina</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="ges-table__free">
                                            {table.tableNumber === null ? "Nuevo pedido" : "Libre"}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </>
        );
    }

    /* ---- Cuenta abierta ---- */
    const pending = ticket.lines.filter((line) => !line.sentAt);
    const sent = ticket.lines.filter((line) => line.sentAt);
    const label = ticket.tableNumber === null ? "Para llevar" : `Mesa ${ticket.tableNumber}`;

    const addItem = async (item: IItem) => {
        const variantId = item.variants?.[0]?.variant_id;
        if (!variantId) return;

        if (hasItemModifiers(item, modifiers)) {
            setOptions(item);
            return;
        }
        await run(() => addTicketLine(token, ticket.id, { variantId, quantity: 1 }), "No pudimos agregar el producto.");
    };

    return (
        <>
            <div className="ges-account">
                <div className="ges-account__menu">
                    <div className="ges-tabs" role="group" aria-label="Categorías">
                        {categories.map((category) => (
                            <button
                                key={category.id}
                                type="button"
                                className="ges-tab"
                                aria-selected={currentCategory === category.id}
                                onClick={() => setCategoryId(category.id)}
                            >
                                {category.name}
                            </button>
                        ))}
                    </div>

                    {error ? <p className="ges-error" role="alert">{error}</p> : null}
                    {!hasShift ? (
                        <p className="ges-warning">
                            No hay turno abierto: no se pueden agregar productos ni cobrar. Ábrelo en Turno.
                        </p>
                    ) : null}

                    <div className="ges-grid">
                        {visibleItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className="ges-prod"
                                disabled={!hasShift}
                                onClick={() => void addItem(item)}
                            >
                                {item.image_url ? (
                                    <img className="ges-prod__img" src={item.image_url} alt="" loading="lazy" />
                                ) : (
                                    <span className="ges-prod__img ges-prod__img--none" aria-hidden="true">
                                        {getItemInitials(item.item_name)}
                                    </span>
                                )}
                                <span className="ges-prod__txt">
                                    <b>{item.item_name}</b>
                                    {hasItemModifiers(item, modifiers) ? <em>Con opciones</em> : null}
                                    <span>{formatCash(getItemPrice(item))}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <aside className="ges-ticket">
                    <div className="ges-ticket__head">
                        <h2>Cuenta de {label.toLowerCase()}</h2>
                        <button type="button" className="ges-btn ges-btn--sm" onClick={() => setTicket(null)}>
                            Ver mesas
                        </button>
                    </div>

                    <div className="ges-ticket__list">
                        {ticket.lines.length === 0 ? (
                            <p className="ges-empty">Toca un producto para agregarlo.</p>
                        ) : (
                            <>
                                {pending.length > 0 ? (
                                    <>
                                        <p className="ges-grp is-pend">Por enviar a cocina</p>
                                        {pending.map((line) => (
                                            <div className="ges-tl" key={line.id}>
                                                <b>{line.name}</b>
                                                <span>{formatCash((line.unitPrice + line.modifiers.reduce((sum, one) => sum + one.price, 0)) * line.quantity)}</span>
                                                <small>
                                                    <button
                                                        type="button"
                                                        aria-label={`Quitar uno de ${line.name}`}
                                                        onClick={() => void run(() => changeTicketLine(token, ticket.id, line.id, line.quantity - 1), "No se pudo cambiar.")}
                                                    >
                                                        −
                                                    </button>
                                                    <em>{formatQuantity(line.quantity)}</em>
                                                    <button
                                                        type="button"
                                                        aria-label={`Agregar uno de ${line.name}`}
                                                        onClick={() => void run(() => changeTicketLine(token, ticket.id, line.id, line.quantity + 1), "No se pudo cambiar.")}
                                                    >
                                                        +
                                                    </button>
                                                    {line.modifiers.length > 0
                                                        ? line.modifiers.map((one) => one.option).join(", ")
                                                        : `× ${formatCash(line.unitPrice)}`}
                                                </small>
                                            </div>
                                        ))}
                                    </>
                                ) : null}

                                {sent.length > 0 ? (
                                    <>
                                        <p className="ges-grp">Ya está en cocina</p>
                                        {sent.map((line) => (
                                            <div className="ges-tl is-sent" key={line.id}>
                                                <b>{line.name}</b>
                                                <span>{formatCash((line.unitPrice + line.modifiers.reduce((sum, one) => sum + one.price, 0)) * line.quantity)}</span>
                                                <small>
                                                    <em>{formatQuantity(line.quantity)}</em> × {formatCash(line.unitPrice)}
                                                    {line.modifiers.length > 0 ? ` · ${line.modifiers.map((one) => one.option).join(", ")}` : ""}
                                                </small>
                                            </div>
                                        ))}
                                    </>
                                ) : null}
                            </>
                        )}
                    </div>

                    <div className="ges-ticket__foot">
                        <div className="ges-total">
                            <span>Total</span>
                            <b>{formatCash(ticket.total)}</b>
                        </div>

                        <button
                            type="button"
                            className="ges-btn ges-btn--block"
                            disabled={pending.length === 0 || !hasShift}
                            onClick={() => void run(() => sendTicketToKitchen(token, ticket.id), "No pudimos enviar a cocina.")}
                        >
                            {pending.length > 0 ? `Enviar ${pending.length} a cocina` : "Todo está en cocina"}
                        </button>

                        <button
                            type="button"
                            className="ges-btn ges-btn--solid ges-btn--block"
                            disabled={ticket.lines.length === 0 || !hasShift}
                            onClick={() => setIsPaying(true)}
                        >
                            {hasShift ? "Cobrar y cerrar la mesa" : "Abre el turno primero"}
                        </button>

                        {ticket.lines.length > 0 ? (
                            <button
                                type="button"
                                className="ges-btn ges-btn--sm ges-btn--block"
                                onClick={() => setIsVoiding(true)}
                            >
                                Anular la cuenta
                            </button>
                        ) : null}
                    </div>
                </aside>
            </div>

            {options ? (
                <OptionsDialog
                    item={options}
                    onClose={() => setOptions(null)}
                    onAdd={async (modifierOptionIds) => {
                        const variantId = options.variants?.[0]?.variant_id;
                        if (variantId) {
                            await run(
                                () => addTicketLine(token, ticket.id, { variantId, quantity: 1, modifierOptionIds }),
                                "No pudimos agregar el producto."
                            );
                        }
                        setOptions(null);
                    }}
                />
            ) : null}

            {isVoiding ? (
                <VoidDialog
                    label={label}
                    onClose={() => setIsVoiding(false)}
                    onVoid={async (reason) => {
                        await voidTicket(token, ticket.id, reason);
                        setIsVoiding(false);
                        setTicket(null);
                        await loadTables();
                    }}
                />
            ) : null}

            {isPaying ? (
                <PayDialog
                    ticket={ticket}
                    onClose={() => setIsPaying(false)}
                    onPay={async (payments) => {
                        await payTicket(token, ticket.id, payments);
                        setIsPaying(false);
                        setTicket(null);
                        await loadTables();
                    }}
                />
            ) : null}
        </>
    );
};
