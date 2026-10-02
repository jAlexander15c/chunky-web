import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getPanamaToday } from "@/helpers/admin";
import type { ISupplyStatus } from "@/helpers/admin";
import { compatibleUnits, panamaDateTime, previewPurchase, purchaseInventory } from "@/helpers/inventory";
import { HttpError } from "@/helpers/getHttp";
export const PurchaseDialog = ({
    token,
    supply,
    scope = "admin",
    onSaved,
    onClose,
}: {
    token: string;
    supply: ISupplyStatus;
    scope?: "admin" | "gestion";
    onSaved: () => Promise<void>;
    onClose: () => void;
}) => {
    const [quantity, setQuantity] = useState(""),
        [content, setContent] = useState(String(supply.purchaseSize ?? "")),
        [unit, setUnit] = useState(supply.contentUnit ?? supply.unit);
    const [mode, setMode] = useState<"BASE" | "PURCHASE">(
        supply.purchaseUnit && supply.purchaseSize ? "PURCHASE" : "BASE",
    );
    const [date, setDate] = useState(getPanamaToday()),
        [expiration, setExpiration] = useState(""),
        [reference, setReference] = useState("");
    const [preview, setPreview] = useState<{ quantity: string; unit: string } | null>(null),
        [error, setError] = useState(""),
        [busy, setBusy] = useState(false);
    useEffect(() => {
        let active = true;
        const timer = setTimeout(() => {
            setPreview(null);
            if (!quantity.trim()) return;
            void previewPurchase(
                token,
                supply.id,
                {
                    quantity: quantity.replace(",", "."),
                    quantityMode: mode,
                    ...(mode === "PURCHASE" ? { unitsPerPurchase: content.replace(",", "."), contentUnit: unit } : {}),
                    purchasedAt: panamaDateTime(date),
                },
                scope,
            )
                .then((r) => {
                    if (active) {
                        setPreview(r);
                        setError("");
                    }
                })
                .catch((e) => {
                    if (active) {
                        setPreview(null);
                        setError(e instanceof HttpError ? e.message : "No pudimos verificar la compra");
                    }
                });
        }, 250);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [token, supply.id, quantity, mode, content, unit, date, scope]);
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            await purchaseInventory(
                token,
                supply.id,
                {
                    quantity: quantity.replace(",", "."),
                    quantityMode: mode,
                    ...(mode === "PURCHASE" ? { unitsPerPurchase: content.replace(",", "."), contentUnit: unit } : {}),
                    purchasedAt: panamaDateTime(date),
                    ...(expiration ? { expirationDate: panamaDateTime(expiration) } : {}),
                    reference,
                },
                scope,
            );
            await onSaved();
            onClose();
        } catch (e) {
            setError(e instanceof HttpError ? e.message : "No pudimos registrar la compra");
            setBusy(false);
        }
    };
    return (
        <div
            className="adm-modal inventory-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={"Compra de " + supply.name}
        >
            <form className="adm-modal__panel adm-modal__panel--wide" onSubmit={submit}>
                <h3 className="script">Compra de {supply.name}</h3>
                <div className="adm-form">
                    <label className="adm-form__row">
                        <span>Cantidad comprada</span>
                        <input
                            required
                            autoFocus
                            className="adm-form__input"
                            inputMode="decimal"
                            value={quantity}
                            onChange={(e) => {
                                setQuantity(e.target.value);
                                setPreview(null);
                            }}
                        />
                    </label>
                    <label className="adm-form__row">
                        <span>Presentación</span>
                        <select
                            className="adm-form__input"
                            value={mode}
                            onChange={(e) => {
                                setMode(e.target.value as typeof mode);
                                setPreview(null);
                            }}
                        >
                            {supply.purchaseUnit ? <option value="PURCHASE">{supply.purchaseUnit}</option> : null}
                            <option value="BASE">Unidad de consumo: {supply.unit}</option>
                        </select>
                    </label>
                    {mode === "PURCHASE" ? (
                        <>
                            <label className="adm-form__row">
                                <span>Contenido por {supply.purchaseUnit}</span>
                                <input
                                    required
                                    className="adm-form__input"
                                    inputMode="decimal"
                                    value={content}
                                    onChange={(e) => {
                                        setContent(e.target.value);
                                        setPreview(null);
                                    }}
                                />
                            </label>
                            <label className="adm-form__row">
                                <span>Unidad del contenido</span>
                                <select
                                    className="adm-form__input"
                                    value={unit}
                                    onChange={(e) => {
                                        setUnit(e.target.value);
                                        setPreview(null);
                                    }}
                                >
                                    {compatibleUnits(supply.unit).map((u) => (
                                        <option key={u}>{u}</option>
                                    ))}
                                </select>
                            </label>
                        </>
                    ) : null}
                    <label className="adm-form__row">
                        <span>Fecha de compra</span>
                        <input
                            required
                            type="date"
                            max={getPanamaToday()}
                            className="adm-form__input"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </label>
                    <label className="adm-form__row">
                        <span>
                            Vencimiento <em>opcional</em>
                        </span>
                        <input
                            type="date"
                            className="adm-form__input"
                            value={expiration}
                            onChange={(e) => setExpiration(e.target.value)}
                        />
                    </label>
                    <label className="adm-form__row adm-form__row--full">
                        <span>Factura o referencia</span>
                        <input
                            maxLength={60}
                            className="adm-form__input"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                        />
                    </label>
                </div>
                {preview ? (
                    <p className="adm-form__note">
                        Se agregarán:{" "}
                        <b>
                            {preview.quantity} {preview.unit}
                        </b>
                        .
                    </p>
                ) : null}
                {!expiration ? (
                    <p className="adm-note">
                        {supply.isPerishable && supply.shelfLifeDays
                            ? "Se calculará el vencimiento usando " + supply.shelfLifeDays + " días desde la compra."
                            : "Se registrará sin fecha de vencimiento."}
                    </p>
                ) : null}
                {error ? (
                    <p className="adm-error" role="alert">
                        {error}
                    </p>
                ) : null}
                <div className="adm-modal__actions">
                    <button type="button" className="adm-btn" disabled={busy} onClick={onClose}>
                        Cancelar
                    </button>
                    <button className="adm-btn adm-btn--solid" disabled={busy || !preview}>
                        {busy ? "Guardando…" : "Registrar compra"}
                    </button>
                </div>
            </form>
        </div>
    );
};
