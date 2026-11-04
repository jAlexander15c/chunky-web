import { useEffect, useState } from "react";

import { HttpError } from "@/helpers";
import type { ICustomerMatch, ITicket } from "@/helpers";

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

export interface ICustomerSuggestProps {
    ticket: ITicket;
    onFindCustomers: (name: string, signal: AbortSignal) => Promise<ICustomerMatch[]>;
    onAssignCustomer: (customerId: number | null) => Promise<void>;
}

/**
 * Clientes registrados parecidos al nombre de la cuenta, arriba del cobro. Es solo una
 * sugerencia: no frena nada y sin tocarla se cobra sin cliente. La caja no registra clientes.
 */
export const CustomerSuggest = ({ ticket, onFindCustomers, onAssignCustomer }: ICustomerSuggestProps) => {
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
