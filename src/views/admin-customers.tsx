import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { StatTile } from "./admin-finance";
import { AdminPagination } from "./admin-pagination";
import {
    CUSTOMER_PERIODS,
    HttpError,
    deleteCustomer,
    exportCustomer,
    fetchCustomerDetail,
    fetchCustomers,
    formatMoney,
    mergeCustomer,
    unlinkCustomerSale,
    updateCustomer,
} from "@/helpers";
import type { CustomerPeriod, CustomerSegment, ICustomerDetail, ICustomerReport, ICustomerRow } from "@/helpers";

const REFRESH_MS = 60000;
const PAGE_SIZE = 12;
const PERIOD_STORAGE_KEY = "chunky-admin-customers-period";
const DEFAULT_PERIOD: CustomerPeriod = "90d";

type SegmentFilter = CustomerSegment | "all";

const SEGMENT_LABEL: Record<SegmentFilter, string> = {
    all: "Todos",
    frequent: "Frecuentes",
    new: "Nuevos",
    cooled: "Se enfriaron",
    owes: "Deben",
};

const SEGMENT_TAG: Record<CustomerSegment, { label: string; tone: string }> = {
    frequent: { label: "Frecuente", tone: "ok" },
    new: { label: "Nuevo", tone: "new" },
    cooled: { label: "Se enfrió", tone: "warn" },
    owes: { label: "Debe", tone: "crit" },
};

const readStoredPeriod = (): CustomerPeriod => {
    try {
        const stored = window.localStorage.getItem(PERIOD_STORAGE_KEY);
        return CUSTOMER_PERIODS.some((period) => period.id === stored) ? (stored as CustomerPeriod) : DEFAULT_PERIOD;
    } catch {
        return DEFAULT_PERIOD;
    }
};

const storePeriod = (period: CustomerPeriod) => {
    try {
        window.localStorage.setItem(PERIOD_STORAGE_KEY, period);
    } catch {
        return;
    }
};

const formatPhone = (phone: string | null) => (phone ? `${phone.slice(0, 4)}-${phone.slice(4)}` : "sin celular");

const formatDay = (value: string) =>
    new Date(value).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" });

const getDaysSince = (value: string) => Math.floor((Date.now() - new Date(value).getTime()) / 86400000);

const formatAgo = (value: string | null) => {
    if (!value) return "sin compras";
    const days = getDaysSince(value);
    if (days < 1) return "hoy";
    if (days === 1) return "ayer";
    return `hace ${days} días`;
};

const getErrorMessage = (error: unknown, fallback: string) => (error instanceof HttpError ? error.message : fallback);

/** Solo letras, números y espacios: "Ána" y "ana" se encuentran igual. */
const getSearchKey = (value: string) =>
    value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "");

/* ============ Diálogos ============ */

interface IEditDialogProps {
    detail: ICustomerDetail;
    onSave: (data: { name: string; phone: string | null; promoConsent: boolean }) => Promise<void>;
    onClose: () => void;
}

/** Corregir datos (derecho de rectificación) y dar o retirar el permiso de promociones. */
const EditDialog = ({ detail, onSave, onClose }: IEditDialogProps) => {
    const [name, setName] = useState(detail.customer.name);
    const [phone, setPhone] = useState(detail.customer.phone ?? "");
    const [promoConsent, setPromoConsent] = useState(Boolean(detail.customer.promoConsentAt));
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const digits = phone.replace(/\D/g, "");
        if (name.trim().length < 2) return setError("El nombre necesita al menos dos letras.");
        if (digits && !/^6\d{7}$/.test(digits)) return setError("El celular tiene 8 dígitos y empieza con 6.");

        setIsSending(true);
        setError("");
        try {
            await onSave({ name: name.trim(), phone: digits || null, promoConsent });
            onClose();
        } catch (requestError) {
            setError(getErrorMessage(requestError, "No se pudo guardar."));
            setIsSending(false);
        }
    };

    return (
        <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Corregir datos del cliente">
            <form className="adm-modal__panel" onSubmit={submit}>
                <h3 className="script">Corregir datos</h3>
                <p className="adm-modal__hint">Si el cliente pide corregir su nombre o su celular, o dejar de recibir promociones.</p>

                <div className="adm-form adm-form--single">
                    <label className="adm-form__row">
                        <span>Nombre</span>
                        <input
                            id="customer-name"
                            className="adm-form__input"
                            type="text"
                            autoFocus
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </label>
                    <label className="adm-form__row">
                        <span>Celular</span>
                        <input
                            id="customer-phone"
                            className="adm-form__input"
                            type="tel"
                            inputMode="numeric"
                            placeholder="6000-0000"
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                        />
                    </label>
                </div>

                <label className="adm-check">
                    <input
                        id="customer-promo"
                        type="checkbox"
                        checked={promoConsent}
                        onChange={(event) => setPromoConsent(event.target.checked)}
                    />
                    <span>Acepta promociones por WhatsApp</span>
                </label>

                {error ? <p className="adm-gate__error">{error}</p> : null}

                <div className="adm-modal__actions">
                    <button type="button" className="adm-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending}>
                        {isSending ? "Guardando…" : "Guardar"}
                    </button>
                </div>
            </form>
        </div>
    );
};

interface IMergeDialogProps {
    detail: ICustomerDetail;
    customers: ICustomerRow[];
    onMerge: (intoId: number) => Promise<void>;
    onClose: () => void;
}

/** Dos registros de la misma persona: todo pasa al elegido y este se borra. */
const MergeDialog = ({ detail, customers, onMerge, onClose }: IMergeDialogProps) => {
    const [query, setQuery] = useState("");
    const [intoId, setIntoId] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const options = useMemo(() => {
        const key = getSearchKey(query);
        return customers
            .filter((one) => one.id !== detail.customer.id)
            .filter((one) => !key || getSearchKey(one.name).includes(key) || (one.phone ?? "").includes(key))
            .slice(0, 8);
    }, [customers, detail.customer.id, query]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!intoId) return setError("Elige con quién se une.");
        setIsSending(true);
        setError("");
        try {
            await onMerge(intoId);
            onClose();
        } catch (requestError) {
            setError(getErrorMessage(requestError, "No se pudieron unir."));
            setIsSending(false);
        }
    };

    return (
        <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Unir con otro cliente">
            <form className="adm-modal__panel" onSubmit={submit}>
                <h3 className="script">Unir a {detail.customer.name}</h3>
                <p className="adm-modal__hint">
                    Si son la misma persona, sus compras pasan al cliente que elijas y este registro se borra.
                </p>

                <input
                    id="customer-merge-search"
                    className="adm-search adm-cust-merge__search"
                    type="search"
                    placeholder="Buscar nombre o celular"
                    aria-label="Buscar nombre o celular"
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />

                <div className="adm-cust-merge" role="radiogroup" aria-label="Cliente con el que se une">
                    {options.length === 0 ? <p className="adm-note">Nadie coincide con esa búsqueda.</p> : null}
                    {options.map((one) => (
                        <label key={one.id} className="adm-cust-merge__row">
                            <input
                                id={`customer-merge-${one.id}`}
                                type="radio"
                                name="customer-merge"
                                checked={intoId === one.id}
                                onChange={() => setIntoId(one.id)}
                            />
                            <span>
                                <b>{one.name}</b>
                                <em>{formatPhone(one.phone)} · {formatAgo(one.lastPurchaseAt)}</em>
                            </span>
                        </label>
                    ))}
                </div>

                {error ? <p className="adm-gate__error">{error}</p> : null}

                <div className="adm-modal__actions">
                    <button type="button" className="adm-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending || !intoId}>
                        {isSending ? "Uniendo…" : "Unir"}
                    </button>
                </div>
            </form>
        </div>
    );
};

interface IDeleteDialogProps {
    detail: ICustomerDetail;
    onDelete: () => Promise<void>;
    onClose: () => void;
}

const DeleteDialog = ({ detail, onDelete, onClose }: IDeleteDialogProps) => {
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async () => {
        setIsSending(true);
        setError("");
        try {
            await onDelete();
            onClose();
        } catch (requestError) {
            setError(getErrorMessage(requestError, "No se pudo borrar."));
            setIsSending(false);
        }
    };

    return (
        <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Borrar cliente">
            <div className="adm-modal__panel">
                <h3 className="script">Borrar a {detail.customer.name}</h3>
                <p className="adm-modal__hint">
                    Se borran su nombre, celular, direcciones y notas. Sus ventas quedan en la contabilidad como
                    "Cliente borrado". No se puede deshacer. Los recibos que ya están en Loyverse no se pueden editar.
                </p>
                {error ? <p className="adm-gate__error">{error}</p> : null}
                <div className="adm-modal__actions">
                    <button type="button" className="adm-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="button" className="adm-btn adm-btn--danger" onClick={submit} disabled={isSending}>
                        {isSending ? "Borrando…" : "Borrar cliente"}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ============ Ficha ============ */

type DetailDialog = "edit" | "merge" | "delete" | null;

interface ICustomerCardProps {
    token: string;
    customerId: number;
    customers: ICustomerRow[];
    onChanged: (removedId?: number) => void;
    onSessionExpired: () => void;
}

const CustomerCard = ({ token, customerId, customers, onChanged, onSessionExpired }: ICustomerCardProps) => {
    const [detail, setDetail] = useState<ICustomerDetail | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [dialog, setDialog] = useState<DetailDialog>(null);
    const [confirmingSale, setConfirmingSale] = useState<string | null>(null);
    const [exported, setExported] = useState("");

    const showLoadError = useCallback(
        (requestError: unknown) => {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(getErrorMessage(requestError, "No pudimos cargar el cliente."));
        },
        [onSessionExpired]
    );

    // Cada cliente monta su propia ficha (key en el padre): no hay estado que limpiar al cambiar
    useEffect(() => {
        const controller = new AbortController();
        fetchCustomerDetail(token, customerId, controller.signal)
            .then(setDetail)
            .catch((requestError) => {
                if (!controller.signal.aborted) showLoadError(requestError);
            });
        return () => controller.abort();
    }, [token, customerId, showLoadError]);

    /** Vuelve a leer la ficha después de corregir o quitar una venta. */
    const load = async () => {
        try {
            setDetail(await fetchCustomerDetail(token, customerId));
            setError("");
        } catch (requestError) {
            showLoadError(requestError);
        }
    };

    const copyData = async () => {
        setNotice("");
        try {
            const data = await exportCustomer(token, customerId);
            const text = JSON.stringify(data, null, 2);
            try {
                await navigator.clipboard.writeText(text);
                setNotice("Datos copiados. Pégalos en un mensaje o un archivo para entregárselos.");
                setExported("");
            } catch {
                // Sin permiso del portapapeles: se muestran para copiarlos a mano
                setExported(text);
            }
        } catch (requestError) {
            setError(getErrorMessage(requestError, "No pudimos juntar sus datos."));
        }
    };

    const removeSale = async (channel: "web" | "local", saleId: string) => {
        try {
            await unlinkCustomerSale(token, customerId, channel, saleId);
            setConfirmingSale(null);
            await load();
            onChanged();
        } catch (requestError) {
            setError(getErrorMessage(requestError, "No pudimos quitar la venta."));
        }
    };

    if (!detail) {
        return (
            <aside className="adm-card adm-cust-card" aria-live="polite">
                {error ? <p className="adm-error">{error}</p> : <p className="adm-empty">Cargando el cliente…</p>}
            </aside>
        );
    }

    const { customer, stats } = detail;

    return (
        <aside className="adm-card adm-cust-card" aria-live="polite">
            <h3 className="script adm-cust-card__name">{customer.name}</h3>
            <div className="adm-cust-card__phone">
                <span>{formatPhone(customer.phone)}</span>
                {customer.phone ? (
                    <a
                        className="adm-btn adm-btn--sm adm-btn--solid"
                        href={`https://wa.me/507${customer.phone}`}
                        target="_blank"
                        rel="noreferrer"
                        title={customer.promoConsentAt ? undefined : "No aceptó promociones: escríbele solo sobre sus pedidos"}
                    >
                        WhatsApp
                    </a>
                ) : null}
            </div>

            <div className="adm-cust-facts">
                <div><span>Compras</span><b>{stats.purchases}</b></div>
                <div><span>Gastado</span><b>B/. {formatMoney(stats.spent)}</b></div>
                <div><span>Promedio</span><b>B/. {formatMoney(stats.average)}</b></div>
            </div>

            {stats.owes > 0 ? (
                <p className="adm-cust-owes">
                    Debe <b>B/. {formatMoney(stats.owes)}</b> de un crédito. Se cobra en /gestion → Créditos.
                </p>
            ) : null}

            <dl className="adm-cust-priv">
                <div>
                    <dt>Aceptó el aviso de privacidad</dt>
                    <dd>{customer.consentAt ? formatDay(customer.consentAt) : "antes del aviso"}</dd>
                </div>
                <div>
                    <dt>Promociones por WhatsApp</dt>
                    <dd>{customer.promoConsentAt ? `sí, desde el ${formatDay(customer.promoConsentAt)}` : "no aceptó"}</dd>
                </div>
            </dl>

            {detail.topItems.length ? (
                <>
                    <span className="adm-cust-label">Lo que más pide</span>
                    <div className="adm-cust-likes">
                        {detail.topItems.map((item) => <span key={item.name}>{item.name}</span>)}
                    </div>
                </>
            ) : null}

            <span className="adm-cust-label">Compras</span>
            <ul className="adm-cust-buys">
                {detail.purchases.slice(0, 15).map((purchase) => {
                    const key = `${purchase.channel}-${purchase.saleId}`;
                    return (
                        <li key={key}>
                            <span className={`adm-cust-chan is-${purchase.channel}`}>{purchase.channel === "web" ? "Web" : "Local"}</span>
                            <span className="adm-cust-buys__what">
                                {purchase.description || "Sin detalle"}
                                <em>
                                    {formatDay(purchase.at)}
                                    {purchase.isDelivery ? " · delivery" : ""}
                                    {purchase.isCredit ? " · a crédito" : ""}
                                </em>
                            </span>
                            <b>B/. {formatMoney(purchase.total)}</b>
                            {confirmingSale === key ? (
                                <span className="adm-cust-buys__confirm">
                                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setConfirmingSale(null)}>No</button>
                                    <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => void removeSale(purchase.channel, purchase.saleId)}>
                                        Quitar
                                    </button>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    className="adm-cust-buys__remove"
                                    aria-label={`Quitar esta venta de ${customer.name}`}
                                    title="No es de este cliente"
                                    onClick={() => setConfirmingSale(key)}
                                >
                                    ×
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>

            {notice ? <p className="adm-cust-notice" role="status">{notice}</p> : null}
            {exported ? (
                <textarea
                    id="customer-export"
                    className="adm-cust-export"
                    readOnly
                    value={exported}
                    aria-label="Datos del cliente"
                    onFocus={(event) => event.currentTarget.select()}
                />
            ) : null}
            {error ? <p className="adm-error">{error}</p> : null}

            <div className="adm-actions adm-actions--wrap adm-cust-tools">
                <button type="button" className="adm-btn adm-btn--sm" onClick={() => setDialog("edit")}>Corregir datos</button>
                <button type="button" className="adm-btn adm-btn--sm" onClick={() => setDialog("merge")}>Unir con otro</button>
                <button type="button" className="adm-btn adm-btn--sm" onClick={() => void copyData()}>Copiar sus datos</button>
                <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setDialog("delete")}>Borrar</button>
            </div>

            {dialog === "edit" ? (
                <EditDialog
                    detail={detail}
                    onClose={() => setDialog(null)}
                    onSave={async (data) => {
                        await updateCustomer(token, customerId, data);
                        await load();
                        onChanged();
                    }}
                />
            ) : dialog === "merge" ? (
                <MergeDialog
                    detail={detail}
                    customers={customers}
                    onClose={() => setDialog(null)}
                    onMerge={async (intoId) => {
                        await mergeCustomer(token, customerId, intoId);
                        onChanged(customerId);
                    }}
                />
            ) : dialog === "delete" ? (
                <DeleteDialog
                    detail={detail}
                    onClose={() => setDialog(null)}
                    onDelete={async () => {
                        await deleteCustomer(token, customerId);
                        onChanged(customerId);
                    }}
                />
            ) : null}
        </aside>
    );
};

/* ============ Sección ============ */

interface IAdminCustomersProps {
    token: string;
    onSessionExpired: () => void;
    refreshKey: number;
}

/**
 * Quién compra, en la web y en el local. Los clientes se registran en la web con el aviso de
 * privacidad aceptado; la caja solo pega sus cuentas a clientes que ya existen.
 */
export const AdminCustomers = ({ token, onSessionExpired, refreshKey }: IAdminCustomersProps) => {
    const [period, setPeriod] = useState<CustomerPeriod>(readStoredPeriod);
    const [report, setReport] = useState<ICustomerReport | null>(null);
    const [segment, setSegment] = useState<SegmentFilter>("all");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                setReport(await fetchCustomers(token, period, signal));
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(getErrorMessage(requestError, "No pudimos cargar los clientes."));
            } finally {
                if (!signal?.aborted) setIsLoading(false);
            }
        },
        [token, period, onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);
        void load(controller.signal);
        const timer = window.setInterval(() => void load(), REFRESH_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [load, refreshKey]);

    const filtered = useMemo(() => {
        const key = getSearchKey(query.trim());
        const digits = query.replace(/\D/g, "");
        return (report?.customers ?? [])
            .filter((one) => segment === "all" || one.segments[segment])
            .filter((one) => !key || getSearchKey(one.name).includes(key) || (digits.length >= 3 && (one.phone ?? "").includes(digits)));
    }, [report, segment, query]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const selected = selectedId ?? visible[0]?.id ?? null;

    const changePeriod = (next: CustomerPeriod) => {
        setPeriod(next);
        storePeriod(next);
        setPage(1);
    };

    const summary = report?.summary;
    const cooledDays = report?.rules.cooledDays ?? 45;

    return (
        <section className="adm-band" aria-busy={isLoading}>
            <div className="adm-band__head">
                <h2 className="script">Clientes</h2>
                <span className="adm-band__sub">Quién compra en la web y en el local · se registran en la web con su permiso</span>
                <span className="adm-src is-own">Postgres</span>
            </div>

            <div className="adm-period">
                <div className="adm-chips" role="group" aria-label="Período">
                    {CUSTOMER_PERIODS.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className="adm-chip"
                            aria-pressed={period === option.id}
                            onClick={() => changePeriod(option.id)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {error ? <p className="adm-error">{error}</p> : null}

            {!report || !summary ? (
                isLoading ? <p className="adm-empty">Cargando los clientes…</p> : null
            ) : (
                <>
                    <div className="adm-tiles">
                        <StatTile
                            label="Clientes que compraron"
                            value={summary.buyers.toLocaleString("es-PA")}
                            detail={`${summary.onlyLocal} solo local · ${summary.onlyWeb} solo web · ${summary.both} en los dos`}
                            split={{ left: summary.onlyLocal + summary.both, right: summary.onlyWeb + summary.both }}
                        />
                        <StatTile
                            label="Volvieron a comprar"
                            value={summary.buyers ? `${Math.round((summary.returning / summary.buyers) * 100)} %` : "—"}
                            detail={`${summary.returning} de ${summary.buyers} compraron 2 o más veces`}
                        />
                        <StatTile
                            label="Ventas del local con cliente"
                            value={summary.localIdentifiedShare === null ? "—" : `${Math.round(summary.localIdentifiedShare * 100)} %`}
                            detail="de lo cobrado en caja; el resto se cobró sin cliente"
                        />
                        <StatTile
                            label="Se enfriaron"
                            value={String(summary.cooled)}
                            detail={`compraban seguido y llevan ${cooledDays}+ días sin pedir`}
                            isAlert={summary.cooled > 0}
                        />
                    </div>

                    <div className="adm-cust">
                        <div className="adm-card">
                            <div className="adm-toolbar">
                                <div className="adm-chips" role="group" aria-label="Filtrar clientes">
                                    {(Object.keys(SEGMENT_LABEL) as SegmentFilter[]).map((id) => (
                                        <button
                                            key={id}
                                            type="button"
                                            className="adm-chip"
                                            aria-pressed={segment === id}
                                            onClick={() => { setSegment(id); setPage(1); }}
                                        >
                                            {SEGMENT_LABEL[id]} <span className="adm-chip__count">{report.segments[id]}</span>
                                        </button>
                                    ))}
                                </div>
                                <input
                                    id="customer-search"
                                    className="adm-search"
                                    type="search"
                                    placeholder="Buscar nombre o celular"
                                    aria-label="Buscar nombre o celular"
                                    value={query}
                                    onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                                />
                            </div>

                            {report.customers.length === 0 ? (
                                <p className="adm-empty">
                                    Todavía no hay clientes. Se registran solos al pagar un pedido en la web con el aviso de
                                    privacidad aceptado; después la caja les puede asignar sus compras del local.
                                </p>
                            ) : filtered.length === 0 ? (
                                <p className="adm-empty">Nadie coincide con ese filtro.</p>
                            ) : (
                                <>
                                    <div className="adm-scroll">
                                        <table className="adm-table adm-table--customers">
                                            <thead>
                                                <tr>
                                                    <th>Cliente</th>
                                                    <th>Dónde compra</th>
                                                    <th className="num">Compras</th>
                                                    <th className="num">Gastado</th>
                                                    <th>Última</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {visible.map((one) => (
                                                    <tr
                                                        key={one.id}
                                                        className={one.id === selected ? "is-selected" : undefined}
                                                        tabIndex={0}
                                                        aria-selected={one.id === selected}
                                                        onClick={() => setSelectedId(one.id)}
                                                        onKeyDown={(event) => {
                                                            if (event.key !== "Enter" && event.key !== " ") return;
                                                            event.preventDefault();
                                                            setSelectedId(one.id);
                                                        }}
                                                    >
                                                        <td className="adm-name">
                                                            {one.name}
                                                            <em>{formatPhone(one.phone)}</em>
                                                            <span className="adm-cust-tags">
                                                                {(Object.keys(SEGMENT_TAG) as CustomerSegment[])
                                                                    .filter((id) => one.segments[id])
                                                                    .map((id) => (
                                                                        <span key={id} className={`adm-pill is-${SEGMENT_TAG[id].tone}`}>
                                                                            {SEGMENT_TAG[id].label}
                                                                        </span>
                                                                    ))}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className="adm-cust-chans">
                                                                {one.webCount ? <span className="adm-cust-chan is-web">Web {one.webCount}</span> : null}
                                                                {one.localCount ? <span className="adm-cust-chan is-local">Local {one.localCount}</span> : null}
                                                                {!one.webCount && !one.localCount ? <span className="adm-note">—</span> : null}
                                                            </span>
                                                        </td>
                                                        <td className="num">{one.webCount + one.localCount}</td>
                                                        <td className="num">B/. {formatMoney(one.spent)}</td>
                                                        <td className={one.segments.cooled ? "adm-cust-late" : undefined}>{formatAgo(one.lastPurchaseAt)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <AdminPagination page={currentPage} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
                                </>
                            )}
                        </div>

                        {selected ? (
                            <CustomerCard
                                key={selected}
                                token={token}
                                customerId={selected}
                                customers={report.customers}
                                onSessionExpired={onSessionExpired}
                                onChanged={(removedId) => {
                                    if (removedId !== undefined) setSelectedId(null);
                                    void load();
                                }}
                            />
                        ) : null}
                    </div>
                </>
            )}
        </section>
    );
};
