import { useCallback, useEffect, useMemo, useState } from "react";

import { ModifierPicker } from "@/components";
import {
    HttpError,
    PAYMENT_LABEL,
    addTicketLine,
    addTicketPayment,
    assignTicketCustomer,
    changeTicketLine,
    fetchCustomerMatches,
    fetchTables,
    fetchTicket,
    formatCash,
    formatQuantity,
    getItemModifiers,
    getItemPrice,
    getTicketLabel,
    getTicketLineTotal,
    giveTicketCredit,
    hasItemAvailableForSale,
    hasItemModifiers,
    moveTicketLine,
    openTable,
    openTableAccount,
    payTicket,
    releaseTicket,
    removeTicketPayment,
    renameTicket,
    sendTicketToKitchen,
    useCategories,
    useItems,
    useModifiers,
    voidTicket,
} from "@/helpers";
import type {
    ICartModifier,
    ICustomerMatch,
    IShiftDetail,
    ITableAccount,
    ITableSummary,
    ITicket,
    ITicketLine,
    ITicketPayment,
    PaymentMethod,
} from "@/helpers";
import type { IItem } from "@/interfaces";

/** El mapa de mesas se relee solo: dos dispositivos tienen que ver lo mismo. */
const TABLES_REFRESH_MS = 8000;

const PAYMENT_METHODS: PaymentMethod[] = ["efectivo", "tarjeta", "yappy"];

/** "Mesa 3" -> "mesa 3" y "Para llevar · Ana" -> "para llevar · Ana": el nombre se respeta. */
const getLowerLabel = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

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

/** "8:12 p. m.": a qué hora se registró un pago por partes. */
const formatPaymentTime = (value?: string) =>
    value ? new Date(value).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", hour12: true }) : "";

interface IPartialPaymentFormProps {
    missing: number;
    onAdd: (payment: { method: PaymentMethod; amount: number; payerName: string | null }) => Promise<void>;
}

/**
 * El siguiente pago de una cuenta que se paga por partes. Solo se registra lo que va a la
 * cuenta: si pagan en efectivo con más, el vuelto se calcula aquí y se da aparte.
 */
const PartialPaymentForm = ({ missing, onAdd }: IPartialPaymentFormProps) => {
    const [method, setMethod] = useState<PaymentMethod>("efectivo");
    const [amount, setAmount] = useState("");
    const [payerName, setPayerName] = useState("");
    const [received, setReceived] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const value = roundMoney(parseAmount(amount));
    const change = roundMoney(parseAmount(received) - value);
    const isShort = method === "efectivo" && received !== "" && change < -0.005;
    const isOver = value > missing + 0.005;
    const closesAccount = value > 0 && Math.abs(value - missing) < 0.005;
    const canAdd = value > 0 && !isOver && !isShort && !isSending;

    const submit = async () => {
        setIsSending(true);
        setError("");

        try {
            await onAdd({ method, amount: value, payerName: payerName.trim() || null });
            setAmount("");
            setPayerName("");
            setReceived("");
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo registrar el pago.");
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="ges-part">
            <span className="ges-part__lbl">Siguiente pago</span>

            <div className="ges-part__row">
                <label className="ges-field ges-field--sm">
                    <span>Medio</span>
                    <select
                        id="caja-parte-medio"
                        value={method}
                        onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                    >
                        {PAYMENT_METHODS.map((option) => (
                            <option key={option} value={option}>{PAYMENT_LABEL[option]}</option>
                        ))}
                    </select>
                </label>
                <label className="ges-field ges-field--sm">
                    <span>Monto</span>
                    <input
                        id="caja-parte-monto"
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={amount}
                        placeholder="0.00"
                        onChange={(event) => setAmount(event.target.value)}
                    />
                </label>
            </div>

            <div className="ges-quick">
                <button type="button" onClick={() => setAmount(missing.toFixed(2))}>
                    Lo que falta {formatCash(missing)}
                </button>
                <button type="button" onClick={() => setAmount(roundMoney(missing / 2).toFixed(2))}>
                    La mitad {formatCash(roundMoney(missing / 2))}
                </button>
            </div>

            <label className="ges-field ges-field--sm">
                <span>Quién paga (opcional)</span>
                <input
                    id="caja-parte-nombre"
                    type="text"
                    maxLength={40}
                    value={payerName}
                    placeholder="Ej. Luis"
                    onChange={(event) => setPayerName(event.target.value)}
                />
            </label>

            {method === "efectivo" ? (
                <div className="ges-part__row ges-part__row--end">
                    <label className="ges-field ges-field--sm">
                        <span>Con cuánto paga</span>
                        <input
                            id="caja-parte-recibido"
                            type="text"
                            inputMode="decimal"
                            value={received}
                            placeholder="0.00"
                            onChange={(event) => setReceived(event.target.value)}
                        />
                    </label>
                    <div className={`ges-change ges-change--sm${isShort ? " is-short" : ""}`}>
                        <span>{isShort ? "Falta" : "Vuelto"}</span>
                        <b>{formatCash(received ? Math.abs(change) : 0)}</b>
                    </div>
                </div>
            ) : null}

            {isOver ? (
                <p className="ges-error" role="alert">
                    Falta {formatCash(missing)}. El vuelto se da aparte: aquí va solo lo que se aplica a la cuenta.
                </p>
            ) : null}
            {error ? <p className="ges-error" role="alert">{error}</p> : null}

            <button type="button" className="ges-btn ges-btn--solid ges-btn--block" disabled={!canAdd} onClick={() => void submit()}>
                {isSending
                    ? "Registrando…"
                    : closesAccount
                      ? `Registrar ${formatCash(value)} y cerrar la cuenta`
                      : value > 0
                        ? `Registrar pago de ${formatCash(value)}`
                        : "Registrar pago"}
            </button>
        </div>
    );
};

interface ICreditDialogProps {
    ticket: ITicket;
    onCredit: (customerName: string) => Promise<void>;
    onBack: () => void;
}

/**
 * Deja la cuenta a crédito: se la lleva alguien que paga después. No entra dinero, la mesa
 * queda libre y la cuenta pasa a Créditos, donde se cobra completa en el turno que sea.
 */
const CreditDialog = ({ ticket, onCredit, onBack }: ICreditDialogProps) => {
    const [name, setName] = useState(ticket.customerName ?? "");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async () => {
        if (!name.trim()) {
            setError("Escribe a nombre de quién queda el crédito.");
            return;
        }

        setIsSending(true);
        setError("");
        try {
            await onCredit(name.trim());
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo dejar a crédito.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Dejar a crédito">
            <div className="ges-modal__panel">
                <h3 className="script">Dejar a crédito</h3>

                <div className="ges-total">
                    <span>Queda debiendo</span>
                    <b>{formatCash(ticket.total)}</b>
                </div>

                <div className="ges-rows">
                    {ticket.lines.map((line) => (
                        <div className="ges-r" key={line.id}>
                            <span>{formatQuantity(line.quantity)} × {line.name}</span>
                            <b>{formatCash(getTicketLineTotal(line))}</b>
                        </div>
                    ))}
                </div>

                <label className="ges-field">
                    <span>¿Quién la debe?</span>
                    <input
                        id="caja-credito-nombre"
                        type="text"
                        autoFocus
                        maxLength={40}
                        value={name}
                        placeholder="Nombre y apellido"
                        onChange={(event) => { setName(event.target.value); setError(""); }}
                    />
                </label>

                <p className="ges-note">
                    No entra dinero ahora. La mesa queda libre y la cuenta pasa a <b>Créditos</b> hasta que se cobre.
                </p>

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onBack} disabled={isSending}>Volver</button>
                    <button
                        type="button"
                        className="ges-btn ges-btn--solid"
                        onClick={() => void submit()}
                        disabled={isSending}
                    >
                        {isSending ? "Guardando…" : "Dejar a crédito"}
                    </button>
                </div>
            </div>
        </div>
    );
};

/** "hoy", "ayer", "hace 5 días", "hace 3 sem", "hace 2 meses": para distinguir a dos Anas. */
const formatLastVisit = (value: string | null) => {
    if (!value) return "sin compras";
    const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
    if (days < 1) return "hoy";
    if (days === 1) return "ayer";
    if (days < 14) return `hace ${days} días`;
    if (days < 60) return `hace ${Math.floor(days / 7)} sem`;
    return `hace ${Math.floor(days / 30)} meses`;
};

interface ICustomerSuggestProps {
    ticket: ITicket;
    onFindCustomers: (name: string, signal: AbortSignal) => Promise<ICustomerMatch[]>;
    onAssignCustomer: (customerId: number | null) => Promise<void>;
}

/**
 * Clientes registrados parecidos al nombre de la cuenta, arriba del cobro. Es solo una
 * sugerencia: no frena nada y sin tocarla se cobra sin cliente. La caja no registra clientes.
 */
const CustomerSuggest = ({ ticket, onFindCustomers, onAssignCustomer }: ICustomerSuggestProps) => {
    const [matches, setMatches] = useState<ICustomerMatch[]>([]);
    const [sending, setSending] = useState<number | "none" | null>(null);
    const [error, setError] = useState("");

    const name = ticket.customerName?.trim() ?? "";
    const customer = ticket.customer ?? null;

    useEffect(() => {
        if (!name || customer) return;
        const controller = new AbortController();
        // Si la búsqueda falla no se muestra nada: el cobro sigue igual
        onFindCustomers(name, controller.signal).then(setMatches).catch(() => setMatches([]));
        return () => controller.abort();
    }, [name, customer, onFindCustomers]);

    const assign = async (customerId: number | null) => {
        setSending(customerId ?? "none");
        setError("");
        try {
            await onAssignCustomer(customerId);
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo asignar el cliente.");
        } finally {
            setSending(null);
        }
    };

    if (customer) {
        return (
            <div className="ges-suggest ges-suggest--linked">
                <span>
                    ✓ Venta de <b>{customer.name}</b>
                    {customer.phoneLast4 ? ` · ···${customer.phoneLast4}` : ""}
                </span>
                <button type="button" className="ges-suggest__undo" disabled={sending !== null} onClick={() => assign(null)}>
                    Quitar
                </button>
            </div>
        );
    }

    if (!matches.length) return null;

    return (
        <div className="ges-suggest">
            <p className="ges-suggest__q">¿Es alguno de estos clientes? Toca para asignarle la venta.</p>
            <div className="ges-suggest__row">
                {matches.map((one) => (
                    <button
                        key={one.id}
                        type="button"
                        className="ges-suggest__chip"
                        disabled={sending !== null}
                        onClick={() => assign(one.id)}
                    >
                        {one.name}
                        <small>
                            {one.phoneLast4 ? `···${one.phoneLast4}` : "sin cel."} · {formatLastVisit(one.lastPurchaseAt)}
                        </small>
                    </button>
                ))}
            </div>
            {error ? <p className="ges-suggest__error" role="alert">{error}</p> : null}
        </div>
    );
};

interface IPayDialogProps extends Omit<ICustomerSuggestProps, "ticket"> {
    ticket: ITicket;
    onPay: (payments: ITicketPayment[]) => Promise<void>;
    onAddPayment: (payment: { method: PaymentMethod; amount: number; payerName: string | null }) => Promise<void>;
    onRemovePayment: (index: number) => Promise<void>;
    onCredit: (customerName: string) => Promise<void>;
    onClose: () => void;
}

const PayDialog = ({
    ticket,
    onPay,
    onAddPayment,
    onRemovePayment,
    onCredit,
    onClose,
    onFindCustomers,
    onAssignCustomer,
}: IPayDialogProps) => {
    const partials = ticket.payments ?? [];
    const hasPartials = partials.length > 0;

    const [isCrediting, setIsCrediting] = useState(false);
    // Con pagos por partes ya registrados solo queda seguir en Mixto
    const [isMixed, setIsMixed] = useState(hasPartials);
    const [method, setMethod] = useState<PaymentMethod>("efectivo");
    const [received, setReceived] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [removing, setRemoving] = useState<number | null>(null);

    const total = ticket.total;
    const missing = roundMoney(total - ticket.paidAmount);
    const change = roundMoney(parseAmount(received) - total);
    const canPay = method !== "efectivo" || parseAmount(received) >= total - 0.005;

    const submit = async () => {
        setIsSending(true);
        setError("");

        try {
            await onPay([{ method, amount: total }]);
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo cobrar.");
            setIsSending(false);
        }
    };

    const remove = async (index: number) => {
        setRemoving(index);
        setError("");

        try {
            await onRemovePayment(index);
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo quitar el pago.");
        } finally {
            setRemoving(null);
        }
    };

    if (isCrediting) return <CreditDialog ticket={ticket} onCredit={onCredit} onBack={() => setIsCrediting(false)} />;

    // Con pagos por partes ese dinero ya está en el cajón: no hay abonos a un crédito
    const creditOption = (
        <>
            <div className="ges-or">o</div>
            <button
                type="button"
                className="ges-btn ges-btn--block ges-btn--credit"
                disabled={hasPartials || isSending}
                onClick={() => setIsCrediting(true)}
            >
                Dejar a crédito
            </button>
            {hasPartials ? (
                <p className="ges-field__hint">Quita los pagos registrados antes de dejarla a crédito.</p>
            ) : null}
        </>
    );

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Cobrar la cuenta">
            <div className="ges-modal__panel">
                <h3 className="script">Cobrar {getLowerLabel(getTicketLabel(ticket))}</h3>

                <CustomerSuggest ticket={ticket} onFindCustomers={onFindCustomers} onAssignCustomer={onAssignCustomer} />

                <div className="ges-total">
                    <span>{isMixed ? "Total de la cuenta" : "Total a cobrar"}</span>
                    <b>{formatCash(total)}</b>
                </div>

                <div className="ges-pays" role="group" aria-label="Medio de pago">
                    {PAYMENT_METHODS.map((option) => (
                        <button
                            key={option}
                            type="button"
                            className="ges-pay"
                            aria-pressed={!isMixed && method === option}
                            disabled={hasPartials}
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
                    <>
                        <span className="ges-part__lbl">Pagos registrados</span>
                        <div className="ges-ledger">
                            {partials.length === 0 ? (
                                <p className="ges-ledger__empty">
                                    Todavía no hay pagos. Registra lo que paga cada persona; con el último se cierra la cuenta.
                                </p>
                            ) : (
                                partials.map((one, index) => (
                                    <div className="ges-ledger__row" key={`${one.paidAt ?? ""}-${index}`}>
                                        <span className="ges-ledger__ok" aria-hidden="true">✓</span>
                                        <span className="ges-ledger__who">
                                            <b>{PAYMENT_LABEL[one.method]}{one.payerName ? ` · ${one.payerName}` : ""}</b>
                                            <small>
                                                {formatPaymentTime(one.paidAt)}
                                                {one.byName ? ` · cargó ${one.byName}` : ""}
                                            </small>
                                        </span>
                                        <span className="ges-ledger__amt">{formatCash(one.amount)}</span>
                                        <button
                                            type="button"
                                            className="ges-ledger__drop"
                                            aria-label={`Quitar el pago de ${formatCash(one.amount)}`}
                                            disabled={removing !== null}
                                            onClick={() => void remove(index)}
                                        >
                                            {removing === index ? "…" : "×"}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="ges-paidsum">
                            <div className="is-paid"><span>Pagado</span><b>{formatCash(ticket.paidAmount)}</b></div>
                            <div className={missing < 0.005 ? "is-paid" : "is-missing"}><span>Falta</span><b>{formatCash(missing)}</b></div>
                        </div>

                        {error ? <p className="ges-error" role="alert">{error}</p> : null}

                        {missing < 0.005 && hasPartials ? (
                            // Pagada entera pero sin cerrar: pasó cuando Loyverse no pudo facturar el último pago
                            <p className="ges-note">
                                Ya está todo pagado pero la cuenta no se cerró. Quita el último pago y vuelve a
                                registrarlo para cerrarla.
                            </p>
                        ) : (
                            <PartialPaymentForm missing={missing} onAdd={onAddPayment} />
                        )}

                        <p className="ges-note">
                            En Loyverse cada pago queda como su propio recibo, con su tipo de pago y su monto.
                        </p>

                        <div className="ges-modal__acts ges-modal__acts--one">
                            <button type="button" className="ges-btn" onClick={onClose}>
                                {hasPartials ? "Cerrar (la cuenta sigue abierta)" : "Cancelar"}
                            </button>
                        </div>
                        {creditOption}
                    </>
                ) : (
                    <>
                        {method === "efectivo" ? (
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
                                    : method === "efectivo" && change >= 0 && received
                                      ? `Cobrar y dar ${formatCash(change)}`
                                      : `Cobrar ${formatCash(total)}`}
                            </button>
                        </div>
                        {creditOption}
                    </>
                )}
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
                <h3 className="script">Anular {getLowerLabel(label)}</h3>
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

/* ============ Nuevo para llevar ============ */

interface ITogoDialogProps {
    onOpen: (customerName: string) => Promise<void>;
    onClose: () => void;
}

/** El nombre es opcional: sirve para que la cocina sepa a quién llamar cuando esté listo. */
const TogoDialog = ({ onOpen, onClose }: ITogoDialogProps) => {
    const [customerName, setCustomerName] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async () => {
        setIsSending(true);
        await onOpen(customerName.trim());
        setIsSending(false);
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Nuevo pedido para llevar">
            <form
                className="ges-modal__panel"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <h3 className="script">Nuevo para llevar</h3>
                <p className="ges-note">Así la cocina sabe a quién llamar cuando esté listo.</p>
                <label className="ges-field">
                    <span>A nombre de</span>
                    <input
                        id="caja-para-llevar-nombre"
                        type="text"
                        autoFocus
                        maxLength={40}
                        autoComplete="off"
                        value={customerName}
                        placeholder="Ana"
                        onChange={(event) => setCustomerName(event.target.value)}
                    />
                    <small className="ges-field__hint">Opcional. Sin nombre se identifica con su número de cuenta.</small>
                </label>
                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="submit" className="ges-btn ges-btn--solid" disabled={isSending}>
                        {isSending ? "Abriendo…" : "Abrir cuenta"}
                    </button>
                </div>
            </form>
        </div>
    );
};

/* ============ Varias cuentas en una mesa ============ */

/** Cómo se nombra una cuenta dentro de su mesa: su nombre, o "Sin nombre" la primera. */
const getAccountName = (account: Pick<ITableAccount, "customerName">) => account.customerName || "Sin nombre";

interface INewAccountDialogProps {
    tableLabel: string;
    /** La mesa tenía una sola cuenta sin nombre: se ofrece ponérselo de paso. */
    askCurrentName: boolean;
    onOpen: (customerName: string, currentName: string) => Promise<void>;
    onClose: () => void;
}

const NewAccountDialog = ({ tableLabel, askCurrentName, onOpen, onClose }: INewAccountDialogProps) => {
    const [customerName, setCustomerName] = useState("");
    const [currentName, setCurrentName] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async () => {
        setIsSending(true);
        setError("");
        try {
            await onOpen(customerName.trim(), currentName.trim());
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo abrir la cuenta.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Nueva cuenta en ${tableLabel}`}>
            <form
                className="ges-modal__panel"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <h3 className="script">Nueva cuenta en {getLowerLabel(tableLabel)}</h3>
                <p className="ges-note">Para un grupo que paga por separado. Cada cuenta se cobra sola.</p>
                <label className="ges-field">
                    <span>A nombre de</span>
                    <input
                        id="caja-cuenta-nombre"
                        type="text"
                        autoFocus
                        maxLength={40}
                        autoComplete="off"
                        value={customerName}
                        placeholder="Luis"
                        onChange={(event) => setCustomerName(event.target.value)}
                    />
                    <small className="ges-field__hint">Opcional. Sin nombre sale con su número de cuenta.</small>
                </label>
                {askCurrentName ? (
                    <label className="ges-field">
                        <span>Y la cuenta que ya estaba, a nombre de</span>
                        <input
                            id="caja-cuenta-actual"
                            type="text"
                            maxLength={40}
                            autoComplete="off"
                            value={currentName}
                            placeholder="Ana"
                            onChange={(event) => setCurrentName(event.target.value)}
                        />
                        <small className="ges-field__hint">Opcional, para distinguirlas en cocina y en el recibo.</small>
                    </label>
                ) : null}
                {error ? <p className="ges-error" role="alert">{error}</p> : null}
                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="submit" className="ges-btn ges-btn--solid" disabled={isSending}>
                        {isSending ? "Abriendo…" : "Abrir cuenta"}
                    </button>
                </div>
            </form>
        </div>
    );
};

/** A dónde va el plato: otra cuenta de la mesa, o una nueva con este nombre. */
type IMoveTarget = { ticketId: number } | { newName: string };

interface IMoveDialogProps {
    line: ITicketLine;
    fromTotal: number;
    accounts: ITableAccount[];
    onMove: (target: IMoveTarget, quantity: number) => Promise<void>;
    onClose: () => void;
}

/** Pasa un plato, o parte de sus unidades, a otra cuenta de la misma mesa. */
const MoveDialog = ({ line, fromTotal, accounts, onMove, onClose }: IMoveDialogProps) => {
    const [quantity, setQuantity] = useState(1);
    const [targetId, setTargetId] = useState<number | "new">(accounts[0]?.id ?? "new");
    const [newName, setNewName] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    // Cantidades con decimales (ej. por peso) se pasan completas
    const isWhole = Number.isInteger(line.quantity);
    const units = isWhole ? quantity : line.quantity;
    const amount = roundMoney((getTicketLineTotal(line) / line.quantity) * units);
    const target = accounts.find((one) => one.id === targetId);
    const targetName = target ? getAccountName(target) : newName.trim() || "la cuenta nueva";

    const submit = async () => {
        setIsSending(true);
        setError("");
        try {
            await onMove(targetId === "new" ? { newName: newName.trim() } : { ticketId: targetId }, units);
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo pasar.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Pasar ${line.name}`}>
            <div className="ges-modal__panel">
                <h3 className="script">Pasar {line.name}</h3>

                {isWhole && line.quantity > 1 ? (
                    <div className="ges-field">
                        <span>Cuántas</span>
                        <div className="ges-qty">
                            <button type="button" aria-label="Una menos" disabled={quantity <= 1} onClick={() => setQuantity(quantity - 1)}>−</button>
                            <b>{quantity}</b>
                            <button type="button" aria-label="Una más" disabled={quantity >= line.quantity} onClick={() => setQuantity(quantity + 1)}>+</button>
                            <em>de {line.quantity}</em>
                        </div>
                    </div>
                ) : null}

                <div className="ges-field">
                    <span>A la cuenta de</span>
                    <div className="ges-accounts" role="group" aria-label="Cuenta de destino">
                        {accounts.map((one) => (
                            <button
                                key={one.id}
                                type="button"
                                className="ges-account-chip"
                                aria-pressed={targetId === one.id}
                                onClick={() => setTargetId(one.id)}
                            >
                                <b>{getAccountName(one)}</b>
                                <span>{formatCash(one.total)}</span>
                            </button>
                        ))}
                        <button
                            type="button"
                            className="ges-account-chip is-add"
                            aria-pressed={targetId === "new"}
                            onClick={() => setTargetId("new")}
                        >
                            + Cuenta nueva
                        </button>
                    </div>
                </div>

                {targetId === "new" ? (
                    <label className="ges-field">
                        <span>A nombre de</span>
                        <input
                            id="caja-pasar-nombre"
                            type="text"
                            maxLength={40}
                            autoComplete="off"
                            value={newName}
                            placeholder="Opcional"
                            onChange={(event) => setNewName(event.target.value)}
                        />
                    </label>
                ) : null}

                <p className="ges-note">
                    Esta cuenta queda en {formatCash(roundMoney(fromTotal - amount))} y {targetName}{" "}
                    {target ? `sube a ${formatCash(roundMoney(target.total + amount))}` : `empieza con ${formatCash(amount)}`}.
                </p>

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="button" className="ges-btn ges-btn--solid" onClick={() => void submit()} disabled={isSending}>
                        {isSending ? "Pasando…" : `Pasar a ${targetName}`}
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
    const [isReleasing, setIsReleasing] = useState(false);
    const [isConfirmingRelease, setIsConfirmingRelease] = useState(false);
    const [isOpeningTogo, setIsOpeningTogo] = useState(false);
    const [isOpeningAccount, setIsOpeningAccount] = useState(false);
    const [moving, setMoving] = useState<ITicketLine | null>(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const findCustomers = useCallback(
        async (name: string, signal: AbortSignal) => (await fetchCustomerMatches(token, name, signal)).matches,
        [token]
    );

    // La caja queda abierta todo el dia: revalida el menu para ver los cambios del tablero sin recargar
    const { categories } = useCategories({ live: true });
    const currentCategory = categoryId ?? categories[0]?.id;
    const { items } = useItems(currentCategory, "normal", { live: true });
    const modifiers = useModifiers({ live: true });

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
            setIsConfirmingRelease(false);
            setError("");
            return data.ticket;
        } catch (requestError) {
            handleError(requestError, fallback);
            return null;
        }
    };

    // Solo lo que Loyverse tiene a la venta: un producto agotado o apagado no se ofrece en caja
    const visibleItems = useMemo(
        () => items.filter((item) => item.variants?.[0]?.variant_id && hasItemAvailableForSale(item)),
        [items]
    );

    /* ---- Mapa de mesas ---- */
    if (!ticket) {
        const togoTables = tables.filter((table) => table.tableNumber === null);
        const diningTables = tables.filter((table) => table.tableNumber !== null);

        const openTogo = async (customerName: string) => {
            const opened = await run(() => openTable(token, 0, customerName), "No pudimos abrir el pedido para llevar.");
            if (opened) setIsOpeningTogo(false);
        };

        const renderTable = (table: ITableSummary) => {
            const busy = table.ticketId !== null;
            const isTogo = table.tableNumber === null;
            // Todo enviado y entregado, pero la cuenta sigue abierta: falta cobrarla
            const isDue = busy && table.items > 0 && table.pending === 0 && table.inKitchen === 0;
            const tone =
                busy && table.items > 0 ? (table.pending > 0 ? " is-busy" : isDue ? " is-due" : " is-ready") : busy ? " is-busy" : "";

            return (
                <button
                    key={table.ticketId ?? table.label}
                    type="button"
                    className={`ges-table${tone}${isTogo ? " ges-table--togo" : ""}`}
                    // Sin turno no se abre una cuenta nueva; una que quedó abierta sí, para anularla
                    disabled={!hasShift && !busy}
                    onClick={() =>
                        void run(
                            // Las de para llevar se retoman por su cuenta: puede haber varias abiertas
                            () => (isTogo && table.ticketId !== null ? fetchTicket(token, table.ticketId) : openTable(token, table.tableNumber ?? 0)),
                            "No pudimos abrir la mesa."
                        )
                    }
                >
                    <span className="ges-table__n">{isTogo ? "Para llevar" : table.label}</span>
                    {isTogo ? <span className="ges-table__who">{table.customerName || `#${table.ticketId}`}</span> : null}
                    {table.accounts > 1 ? <span className="ges-table__accounts">{table.accounts} cuentas</span> : null}
                    {busy ? (
                        <>
                            <span className="ges-table__t">{formatCash(table.total)}</span>
                            {table.paidAmount > 0 ? (
                                <span className="ges-table__paid">Pagado {formatCash(table.paidAmount)}</span>
                            ) : null}
                            <span className="ges-table__m">
                                {formatQuantity(table.items)} platos
                                {table.openedAt ? ` · ${formatWaiting(table.openedAt)}` : ""}
                            </span>
                            {table.pending > 0 ? (
                                <span className="ges-table__pend">{table.pending} por enviar</span>
                            ) : isDue ? (
                                <span className="ges-table__due">Pendiente de pago</span>
                            ) : table.items > 0 ? (
                                <span className="ges-table__ok">En cocina</span>
                            ) : null}
                        </>
                    ) : (
                        <span className="ges-table__free">Libre</span>
                    )}
                </button>
            );
        };

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
                    <>
                        <h2 className="ges-tables__group">
                            Para llevar{togoTables.length > 0 ? ` · ${togoTables.length} ${togoTables.length === 1 ? "abierta" : "abiertas"}` : ""}
                        </h2>
                        <div className="ges-tables">
                            <button
                                type="button"
                                className="ges-table ges-table--new"
                                disabled={!hasShift}
                                onClick={() => setIsOpeningTogo(true)}
                            >
                                <b aria-hidden="true">+</b>
                                <span>Nuevo para llevar</span>
                            </button>
                            {togoTables.map(renderTable)}
                        </div>

                        <h2 className="ges-tables__group">Mesas</h2>
                        <div className="ges-tables">{diningTables.map(renderTable)}</div>
                    </>
                )}

                {isOpeningTogo ? <TogoDialog onOpen={openTogo} onClose={() => setIsOpeningTogo(false)} /> : null}
            </>
        );
    }

    /* ---- Cuenta abierta ---- */
    const pending = ticket.lines.filter((line) => !line.sentAt);
    const sent = ticket.lines.filter((line) => line.sentAt);
    // La cocina ya entregó todo lo enviado: solo falta cobrar
    const isDelivered = sent.length > 0 && ticket.inKitchen === 0;
    const label = getTicketLabel(ticket);
    const tableNumber = ticket.tableNumber;
    // Una mesa con varias cuentas: los textos hablan de "la cuenta de Ana", no de cerrar la mesa
    const hasSiblings = ticket.tableAccounts.length > 1;
    const accountName = getAccountName(ticket);
    const otherAccounts = ticket.tableAccounts.filter((one) => one.id !== ticket.id);
    // Cobro Mixto por partes en curso: el dinero ya recibido se ve junto al total
    const partialsCount = ticket.payments?.length ?? 0;
    const hasPartials = partialsCount > 0;
    const missing = roundMoney(ticket.total - ticket.paidAmount);

    /** Tras cobrar o cerrar una cuenta, la siguiente de la mesa; si no queda ninguna, el mapa. */
    const showNextAccount = async (remaining: ITableAccount[]) => {
        const next = remaining.find((one) => one.id !== ticket.id);
        if (next) {
            await run(() => fetchTicket(token, next.id), "No pudimos abrir la siguiente cuenta.");
            return;
        }
        setTicket(null);
        await loadTables();
    };

    // Vacía se cierra al tocar; con productos sin enviar pide un segundo toque para no perderlos
    const release = async () => {
        if (pending.length > 0 && !isConfirmingRelease) {
            setIsConfirmingRelease(true);
            return;
        }

        setIsReleasing(true);
        try {
            await releaseTicket(token, ticket.id);
            setError("");
            await showNextAccount(otherAccounts);
        } catch (requestError) {
            handleError(requestError, "No pudimos cerrar la mesa.");
        } finally {
            setIsReleasing(false);
            setIsConfirmingRelease(false);
        }
    };

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
                        <h2>{tableNumber !== null ? `Mesa ${tableNumber}` : `Cuenta de ${getLowerLabel(label)}`}</h2>
                        <button
                            type="button"
                            className="ges-btn ges-btn--sm"
                            onClick={() => {
                                setIsConfirmingRelease(false);
                                setTicket(null);
                            }}
                        >
                            Ver mesas
                        </button>
                    </div>

                    {tableNumber !== null ? (
                        <div className="ges-accounts" role="group" aria-label="Cuentas de la mesa">
                            {ticket.tableAccounts.map((one) => (
                                <button
                                    key={one.id}
                                    type="button"
                                    className="ges-account-chip"
                                    aria-pressed={one.id === ticket.id}
                                    onClick={() => {
                                        if (one.id === ticket.id) return;
                                        void run(() => fetchTicket(token, one.id), "No pudimos abrir esa cuenta.");
                                    }}
                                >
                                    <b>{getAccountName(one)}</b>
                                    <span>{formatCash(one.id === ticket.id ? ticket.total : one.total)}</span>
                                </button>
                            ))}
                            <button
                                type="button"
                                className="ges-account-chip is-add"
                                disabled={!hasShift}
                                onClick={() => setIsOpeningAccount(true)}
                            >
                                + Cuenta
                            </button>
                        </div>
                    ) : null}

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
                                                <span>{formatCash(getTicketLineTotal(line))}</span>
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
                                                    {tableNumber !== null ? (
                                                        <button type="button" className="ges-tl__move" onClick={() => setMoving(line)}>
                                                            Pasar a…
                                                        </button>
                                                    ) : null}
                                                </small>
                                            </div>
                                        ))}
                                    </>
                                ) : null}

                                {sent.length > 0 ? (
                                    <>
                                        <p className="ges-grp">{isDelivered ? "Entregado · pendiente de pago" : "Ya está en cocina"}</p>
                                        {sent.map((line) => (
                                            <div className="ges-tl is-sent" key={line.id}>
                                                <b>{line.name}</b>
                                                <span>{formatCash(getTicketLineTotal(line))}</span>
                                                <small>
                                                    <em>{formatQuantity(line.quantity)}</em> × {formatCash(line.unitPrice)}
                                                    {line.modifiers.length > 0 ? ` · ${line.modifiers.map((one) => one.option).join(", ")}` : ""}
                                                    {tableNumber !== null ? (
                                                        <button type="button" className="ges-tl__move" onClick={() => setMoving(line)}>
                                                            Pasar a…
                                                        </button>
                                                    ) : null}
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
                            <span>{hasSiblings ? `Cuenta de ${accountName}` : "Total"}</span>
                            <b>{formatCash(ticket.total)}</b>
                        </div>

                        {hasPartials ? (
                            <div className="ges-paid-strip">
                                <span>
                                    Pagado {formatCash(ticket.paidAmount)} en {partialsCount}{" "}
                                    {partialsCount === 1 ? "pago" : "pagos"}
                                </span>
                                <b>Falta {formatCash(missing)}</b>
                                <span className="ges-paid-strip__bar" aria-hidden="true">
                                    <i style={{ width: `${Math.min(100, (ticket.paidAmount / Math.max(ticket.total, 0.01)) * 100)}%` }} />
                                </span>
                            </div>
                        ) : null}

                        <button
                            type="button"
                            className="ges-btn ges-btn--block"
                            disabled={pending.length === 0 || !hasShift}
                            onClick={() => void run(() => sendTicketToKitchen(token, ticket.id), "No pudimos enviar a cocina.")}
                        >
                            {pending.length > 0 ? `Enviar ${pending.length} a cocina` : isDelivered ? "Todo entregado" : "Todo está en cocina"}
                        </button>

                        <button
                            type="button"
                            className="ges-btn ges-btn--solid ges-btn--block"
                            disabled={ticket.lines.length === 0 || !hasShift}
                            onClick={() => setIsPaying(true)}
                        >
                            {!hasShift
                                ? "Abre el turno primero"
                                : hasPartials
                                  ? `Cobrar lo que falta (${formatCash(missing)})`
                                  : hasSiblings
                                  ? `Cobrar la cuenta de ${accountName}`
                                  : "Cobrar y cerrar la mesa"}
                        </button>

                        {/* Sin nada en cocina la mesa se cierra sin motivo; con algo ya enviado se anula */}
                        {sent.length === 0 ? (
                            <button
                                type="button"
                                className="ges-btn ges-btn--sm ges-btn--block"
                                disabled={isReleasing}
                                onClick={() => void release()}
                            >
                                {isReleasing
                                    ? "Cerrando…"
                                    : isConfirmingRelease
                                      ? `Sí, cerrar y borrar ${pending.length} ${pending.length === 1 ? "producto" : "productos"}`
                                      : hasSiblings
                                        ? `Cerrar la cuenta de ${accountName}`
                                        : "Cerrar la mesa"}
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="ges-btn ges-btn--sm ges-btn--block"
                                onClick={() => setIsVoiding(true)}
                            >
                                Anular la cuenta
                            </button>
                        )}
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
                        await showNextAccount(otherAccounts);
                    }}
                />
            ) : null}

            {isOpeningAccount && tableNumber !== null ? (
                <NewAccountDialog
                    tableLabel={`Mesa ${tableNumber}`}
                    askCurrentName={ticket.tableAccounts.length === 1 && !ticket.customerName}
                    onClose={() => setIsOpeningAccount(false)}
                    onOpen={async (customerName, currentName) => {
                        if (currentName) await renameTicket(token, ticket.id, currentName);
                        const data = await openTableAccount(token, tableNumber, customerName);
                        setTicket(data.ticket);
                        setIsOpeningAccount(false);
                        setError("");
                    }}
                />
            ) : null}

            {moving && tableNumber !== null ? (
                <MoveDialog
                    line={moving}
                    fromTotal={ticket.total}
                    accounts={otherAccounts}
                    onClose={() => setMoving(null)}
                    onMove={async (target, quantity) => {
                        const toTicketId =
                            "ticketId" in target
                                ? target.ticketId
                                : (await openTableAccount(token, tableNumber, target.newName)).ticket.id;
                        const data = await moveTicketLine(token, ticket.id, moving.id, toTicketId, quantity);
                        setTicket(data.ticket);
                        setMoving(null);
                        setError("");
                    }}
                />
            ) : null}

            {isPaying ? (
                <PayDialog
                    ticket={ticket}
                    onClose={() => setIsPaying(false)}
                    onPay={async (payments) => {
                        // Trae las cuentas que siguen abiertas en la mesa: se salta a la siguiente
                        const data = await payTicket(token, ticket.id, payments);
                        setIsPaying(false);
                        await showNextAccount(data.ticket.tableAccounts);
                    }}
                    onAddPayment={async (payment) => {
                        const data = await addTicketPayment(token, ticket.id, payment);
                        setError("");
                        // El pago que completa el total llega con la cuenta ya cobrada
                        if (data.ticket.status !== "abierta") {
                            setIsPaying(false);
                            await showNextAccount(data.ticket.tableAccounts);
                            return;
                        }
                        setTicket(data.ticket);
                    }}
                    onRemovePayment={async (index) => {
                        const data = await removeTicketPayment(token, ticket.id, index);
                        setTicket(data.ticket);
                    }}
                    onCredit={async (customerName) => {
                        // Igual que al cobrar: sale de la mesa y se salta a la siguiente cuenta
                        const data = await giveTicketCredit(token, ticket.id, customerName);
                        setIsPaying(false);
                        await showNextAccount(data.ticket.tableAccounts);
                    }}
                    onFindCustomers={findCustomers}
                    onAssignCustomer={async (customerId) => {
                        const data = await assignTicketCustomer(token, ticket.id, customerId);
                        setTicket((current) => (current ? { ...current, customer: data.customer } : current));
                    }}
                />
            ) : null}
        </>
    );
};
