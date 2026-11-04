import { useCallback, useEffect, useMemo, useState } from "react";

import { OpsSkeleton, SheetSelect } from "@/components";
import {
    HttpError,
    addTicketCombo,
    addTicketLine,
    assignTicketCustomer,
    buildPastaItem,
    changeTicketLine,
    fetchCajaCombos,
    fetchCustomerMatches,
    fetchTables,
    fetchTicket,
    formatCash,
    getTicketLabel,
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
    setTicketLineNote,
    useCategories,
    useItems,
    useModifiers,
    useSettings,
    voidTicket,
} from "@/helpers";
import type {
    IPublicCombo,
    IShiftDetail,
    ITableAccount,
    ITableSummary,
    ITicket,
    ITicketLine,
} from "@/helpers";
import type { IItem } from "@/interfaces";
import { InventoryExitDialog } from "./inventory-exit-dialog";
import { TicketTotals } from "./ticket-pricing";
import { getAccountName, getLowerLabel, roundMoney } from "./caja/helpers";
import { Catalog } from "./caja/catalog";
import { TableCard } from "./caja/table-card";
import { TicketLines } from "./caja/ticket-lines";
import { TogoDialog } from "./caja/togo-dialog";
import { OptionsDialog } from "./caja/options-dialog";
import { ComboDialog } from "./caja/combo-dialog";
import { LineNoteDialog } from "./caja/line-note-dialog";
import { VoidDialog } from "./caja/void-dialog";
import { NewAccountDialog } from "./caja/new-account-dialog";
import { MoveDialog } from "./caja/move-dialog";
import { PayDialog } from "./caja/pay-dialog";

import "./caja.css";

/** El mapa de mesas se relee solo: dos dispositivos tienen que ver lo mismo. */
const TABLES_REFRESH_MS = 8000;

/** Pestaña de la pasta armable; no es una categoria de Loyverse. */
const PASTA_TAB_ID = "pasta";
const COMBOS_TAB_ID = "combos";
/** Los combos entran y salen por horario: se releen cada minuto. */
const COMBOS_REFRESH_MS = 60000;

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
    const [combos, setCombos] = useState<IPublicCombo[]>([]);
    const [comboToAdd, setComboToAdd] = useState<IPublicCombo | null>(null);
    const [isPaying, setIsPaying] = useState(false);
    const [isVoiding, setIsVoiding] = useState(false);
    const [isReleasing, setIsReleasing] = useState(false);
    const [isConfirmingRelease, setIsConfirmingRelease] = useState(false);
    const [isRegisteringExit, setIsRegisteringExit] = useState(false);
    const [isOpeningTogo, setIsOpeningTogo] = useState(false);
    const [isOpeningAccount, setIsOpeningAccount] = useState(false);
    const [moving, setMoving] = useState<ITicketLine | null>(null);
    const [noting, setNoting] = useState<ITicketLine | null>(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const findCustomers = useCallback(
        async (name: string, signal: AbortSignal) => (await fetchCustomerMatches(token, name, signal)).matches,
        [token]
    );

    // La caja queda abierta todo el dia: revalida el menu para ver los cambios del tablero sin recargar
    const { categories: menuCategories } = useCategories({ live: true });
    // La pasta no tiene categoria en Loyverse: el dia de pasta va en su propia pestaña, de primera
    const { settings } = useSettings();
    const pastaItem = useMemo(
        () => (settings.pasta?.modifierIds ? { ...buildPastaItem(settings.pasta), modifier_ids: settings.pasta.modifierIds } : null),
        [settings.pasta]
    );
    // Los combos van en su pestaña solo mientras alguno está a la venta en caja
    const categories = useMemo(
        () => [
            ...(pastaItem ? [{ id: PASTA_TAB_ID, name: "Pasta" }] : []),
            ...(combos.length > 0 ? [{ id: COMBOS_TAB_ID, name: "Combos" }] : []),
            ...menuCategories,
        ],
        [pastaItem, combos.length, menuCategories]
    );
    // Si la pestaña elegida desaparece (se acabó la hora del combo), vuelve a la primera
    const currentCategory = categories.some((category) => category.id === categoryId) ? categoryId! : categories[0]?.id;
    const isPastaTab = currentCategory === PASTA_TAB_ID;
    const isCombosTab = currentCategory === COMBOS_TAB_ID;
    const { items: categoryItems } = useItems(isPastaTab || isCombosTab ? undefined : currentCategory, "normal", { live: true });
    const items = useMemo(() => (isPastaTab && pastaItem ? [pastaItem] : categoryItems), [isPastaTab, pastaItem, categoryItems]);
    const modifiers = useModifiers({ live: true });

    const handleError = useCallback(
        (requestError: unknown, fallback: string) => {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : fallback);
        },
        [onSessionExpired]
    );

    // Sin combos la caja sigue igual: un fallo aquí no se muestra como error
    useEffect(() => {
        const controller = new AbortController();
        const loadCombos = async () => {
            try {
                setCombos(await fetchCajaCombos(token, controller.signal));
            } catch (requestError) {
                if (requestError instanceof HttpError && requestError.status === 401) onSessionExpired();
            }
        };
        void loadCombos();
        const timer = window.setInterval(() => void loadCombos(), COMBOS_REFRESH_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [token, onSessionExpired]);

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

        const renderTable = (table: ITableSummary) => (
            <TableCard
                key={table.ticketId ?? table.label}
                table={table}
                hasShift={hasShift}
                onOpen={() =>
                    void run(
                        // Las de para llevar se retoman por su cuenta: puede haber varias abiertas
                        () =>
                            table.tableNumber === null && table.ticketId !== null
                                ? fetchTicket(token, table.ticketId)
                                : openTable(token, table.tableNumber ?? 0),
                        "No pudimos abrir la mesa."
                    )
                }
            />
        );

        return (
            <>
                <button type="button" className="ges-btn" onClick={() => setIsRegisteringExit(true)}>Salida sin venta</button>
                {error ? <p className="ges-error" role="alert">{error}</p> : null}
                {!hasShift && !isLoading ? (
                    <p className="ges-warning">
                        No hay turno abierto. Ábrelo en Turno para tomar pedidos y cobrar.
                    </p>
                ) : null}

                {isLoading ? (
                    <OpsSkeleton label="Cargando las mesas…" />
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

                {isRegisteringExit ? <InventoryExitDialog token={token} onClose={() => setIsRegisteringExit(false)} onSessionExpired={onSessionExpired} /> : null}
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
            {isRegisteringExit ? <InventoryExitDialog token={token} onClose={() => setIsRegisteringExit(false)} onSessionExpired={onSessionExpired} /> : null}
            <button type="button" className="ges-btn" onClick={() => setIsRegisteringExit(true)}>Salida sin venta</button>
            <div className="ges-account">
                <Catalog
                    categories={categories}
                    currentCategory={currentCategory}
                    error={error}
                    hasShift={hasShift}
                    isCombosTab={isCombosTab}
                    combos={combos}
                    visibleItems={visibleItems}
                    modifiers={modifiers}
                    onCategoryChange={setCategoryId}
                    onPickCombo={setComboToAdd}
                    onAddItem={(item) => void addItem(item)}
                />

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
                        <SheetSelect<number>
                            label="Cuenta"
                            className="ges-select"
                            value={ticket.id}
                            options={ticket.tableAccounts.map((one) => ({
                                id: one.id,
                                label: getAccountName(one),
                                count: formatCash(one.id === ticket.id ? ticket.total : one.total),
                            }))}
                            onChange={(id) => {
                                if (id === ticket.id) return;
                                void run(() => fetchTicket(token, id), "No pudimos abrir esa cuenta.");
                            }}
                            action={{ label: "+ Cuenta", disabled: !hasShift, onSelect: () => setIsOpeningAccount(true) }}
                        />
                    ) : null}

                    {tableNumber !== null ? (
                        <div className="ges-accounts fsheet-wide" role="group" aria-label="Cuentas de la mesa">
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

                    <TicketLines
                        lines={ticket.lines}
                        pending={pending}
                        sent={sent}
                        isDelivered={isDelivered}
                        tableNumber={tableNumber}
                        onChangeQuantity={(lineId, quantity) =>
                            void run(() => changeTicketLine(token, ticket.id, lineId, quantity), "No se pudo cambiar.")
                        }
                        onMove={setMoving}
                        onNote={setNoting}
                    />

                    <div className="ges-ticket__foot">
                        <TicketTotals ticket={ticket} />

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
                                  : `Cobrar ${formatCash(ticket.total)}`}
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
                    isEveryGroupRequired={options.id === pastaItem?.id}
                    onClose={() => setOptions(null)}
                    onAdd={async (modifierOptionIds, note) => {
                        const variantId = options.variants?.[0]?.variant_id;
                        if (variantId) {
                            await run(
                                () => addTicketLine(token, ticket.id, { variantId, quantity: 1, modifierOptionIds, note }),
                                "No pudimos agregar el producto."
                            );
                        }
                        setOptions(null);
                    }}
                />
            ) : null}

            {comboToAdd ? (
                <ComboDialog
                    combo={comboToAdd}
                    onClose={() => setComboToAdd(null)}
                    onAdd={async (choices, note) => {
                        await run(
                            () => addTicketCombo(token, ticket.id, {
                                comboId: comboToAdd.id,
                                quantity: 1,
                                choices: choices.map((choice) => ({
                                    variantId: choice.item.variants[0].variant_id,
                                    modifierOptionIds: choice.modifiers.map((one) => one.modifierOptionId),
                                })),
                                note,
                            }),
                            "No pudimos agregar el combo."
                        );
                        setComboToAdd(null);
                    }}
                />
            ) : null}

            {noting ? (
                <LineNoteDialog
                    line={noting}
                    onClose={() => setNoting(null)}
                    onSave={async (note) => {
                        const data = await setTicketLineNote(token, ticket.id, noting.id, note);
                        setTicket(data.ticket);
                        setNoting(null);
                        setError("");
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
