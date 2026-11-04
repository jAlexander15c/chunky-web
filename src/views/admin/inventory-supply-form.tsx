import { compatibleUnits } from "@/helpers/inventory";
import type { InventoryType } from "@/helpers/inventory";
import { useState } from "react";
import type { FormEvent } from "react";
import { HttpError, SUPPLY_CATEGORY_LABEL, formatQuantity, getPlural, isCountUnit, roundQuantity } from "@/helpers";
import type { ISupplyInput, ISupplyStatus, SupplyCategory } from "@/helpers";

import { SUPPLY_CATEGORIES } from "./inventory-helpers";

/* ============ Alta y edición de insumo ============ */

const SUPPLY_UNITS = [
    { value: "kg", label: "kilos (kg)" },
    { value: "g", label: "gramos (g)" },
    { value: "L", label: "litros (L)" },
    { value: "ml", label: "mililitros (ml)" },
    { value: "u", label: "unidades (u)" },
    {value:"slice",label:"rebanadas"},
    {value:"portion",label:"porciones"},
];

/** Un insumo en "u" cuya presentación trae ml o g: al guardar pasa a medirse en ml o g. */
interface ISupplyConversion {
    unit: string;
    perUnit: string;
    presentation: string;
}

interface ISupplyFormProps {
    /** Con un insumo es edición: el formulario arranca con sus datos. */
    supply?: ISupplyStatus;
    onSave: (supply: ISupplyInput, conversion?: ISupplyConversion) => Promise<void>;
    onClose: () => void;
    /** Solo al editar: el insumo se vende tal cual y pasa a lotes del producto del menú. */
    onConvertToProduct?: () => void;
}

export const SupplyFormDialog = ({ supply, onSave, onClose, onConvertToProduct }: ISupplyFormProps) => {
    const isEditing = Boolean(supply);
    const [name, setName] = useState(supply?.name ?? "");
    const [unit, setUnit] = useState(supply?.unit ?? "kg");
    const [category, setCategory] = useState<SupplyCategory>(supply?.category ?? "alimento");
    const [minStock, setMinStock] = useState(supply ? formatQuantity(supply.minStock) : "");
    const [supplier, setSupplier] = useState(supply?.supplier ?? "");
    const [purchaseUnit, setPurchaseUnit] = useState(supply?.purchaseUnit ?? "");
    const [purchaseSize, setPurchaseSize] = useState(supply?.purchaseSize ? formatQuantity(supply.purchaseSize) : "");
    const [inventoryType,setInventoryType]=useState<InventoryType>(supply?.inventoryType ?? "RAW_MATERIAL");
    const [contentUnit,setContentUnit]=useState(supply?.contentUnit ?? supply?.unit ?? "kg");
    const [isPerishable,setIsPerishable]=useState(supply?.isPerishable ?? false);
    const [shelfLifeDays,setShelfLifeDays]=useState(supply?.shelfLifeDays ? String(supply.shelfLifeDays) : "");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const toNumber = (value: string) => Number(value.replace(",", "."));
    // "u" con contenido en ml o g: las recetas lo piden en ml o g, así que al guardar pasa a medirse así
    // Un elaborado se crea en Gestión con su receta; aquí no cambia de tipo ni de unidad
    const isElaborado = inventoryType === "INTERMEDIATE";
    const isConverting = isCountUnit(unit) && !isCountUnit(contentUnit) && inventoryType !== "PREPARED_PRODUCT" && !isElaborado;
    const contentUnits = isCountUnit(unit) && inventoryType !== "PREPARED_PRODUCT" && !isElaborado ? [unit, "ml", "g"] : compatibleUnits(unit);
    const size = toNumber(purchaseSize);

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        const parsedMin = minStock.trim() ? toNumber(minStock) : 0;
        const parsedSize = purchaseSize.trim() ? toNumber(purchaseSize) : undefined;

        if (name.trim().length < 2) {
            setError("El nombre necesita al menos dos letras.");
            return;
        }
        if (!Number.isFinite(parsedMin) || parsedMin < 0) {
            setError("El mínimo tiene que ser un número.");
            return;
        }
        // El API rechaza un tamaño de compra en cero: o hay un número válido, o no se manda
        if (parsedSize !== undefined && (!Number.isFinite(parsedSize) || parsedSize <= 0)) {
            setError("El contenido por unidad de compra tiene que ser mayor que cero.");
            return;
        }

        if (isConverting && (!purchaseUnit.trim() || parsedSize === undefined)) {
            setError(`Para medirlo en ${contentUnit}, escribe la presentación (ej. cartón) y cuánto trae.`);
            return;
        }

        setIsSending(true);
        setError("");

        try {
            await onSave(
                {
                    name: name.trim(),
                    unit,
                    category,
                    minStock: parsedMin,
                    supplier: supplier.trim() || undefined,
                    // Mientras se convierte queda la presentación anterior: la nueva la guarda el cambio de unidad
                    purchaseUnit: isConverting ? supply?.purchaseUnit ?? undefined : purchaseUnit.trim() || undefined,
                    purchaseSize: isConverting ? supply?.purchaseSize ?? undefined : parsedSize,
                    inventoryType,
                    contentUnit: isConverting ? unit : contentUnit,
                    isPerishable,
                    shelfLifeDays: isPerishable && shelfLifeDays ? Number(shelfLifeDays) : null,
                },
                isConverting && parsedSize !== undefined
                    ? { unit: contentUnit, perUnit: String(parsedSize), presentation: purchaseUnit.trim() }
                    : undefined
            );
            onClose();
        } catch (requestError) {
            setError(
                requestError instanceof HttpError
                    ? requestError.message
                    : isEditing
                      ? "No se pudo guardar el insumo."
                      : "No se pudo crear el insumo."
            );
            setIsSending(false);
        }
    };

    return (
        <div className="adm-modal" role="dialog" aria-modal="true" aria-label={isEditing ? `Editar ${supply?.name}` : "Nuevo insumo"}>
            <form className="adm-modal__panel adm-modal__panel--wide" onSubmit={submit}>
                <h3 className="script">{isEditing ? "Editar insumo" : "Nuevo insumo"}</h3>
                <p className="adm-modal__hint">
                    {isEditing
                        ? "Aquí se cambian los datos, no el stock: eso va por compra, conteo o merma."
                        : "El stock arranca en cero: se carga con el primer conteo o con una compra."}
                </p>

                <div className="adm-form">
                    <label className="adm-form__row adm-form__row--full">
                        <span>Nombre</span>
                        <input
                            className="adm-form__input"
                            type="text"
                            autoFocus
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Harina panadera"
                        />
                    </label>

                    <label className="adm-form__row">
                        <span>Unidad de consumo</span>
                        <select className="adm-form__input" value={unit} disabled={isEditing} onChange={(event) => {setUnit(event.target.value);setContentUnit(event.target.value);}}>
                            {SUPPLY_UNITS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>

                    {isElaborado ? <p className="adm-form__row"><span>Tipo</span><span>Elaborado · su receta se edita en Gestión → Inventario → Recetas</span></p> : <label className="adm-form__row"><span>Tipo</span><select className="adm-form__input" value={inventoryType} onChange={e=>setInventoryType(e.target.value as InventoryType)}><option value="RAW_MATERIAL">Materia prima</option><option value="PACKAGED_ITEM">Producto empacado</option><option value="PREPARED_PRODUCT">Producto preparado</option></select></label>}
                    <label className="adm-form__row"><span>¿Es perecedero?</span><select className="adm-form__input" value={String(isPerishable)} onChange={e=>setIsPerishable(e.target.value==="true")}><option value="false">No</option><option value="true">Sí</option></select></label>
                    <label className="adm-form__row"><span>Vida útil predeterminada (días)</span><input className="adm-form__input" type="number" min={1} max={3650} disabled={!isPerishable} value={shelfLifeDays} onChange={e=>setShelfLifeDays(e.target.value)}/></label>
                    <label className="adm-form__row">
                        <span>Categoría</span>
                        <select
                            className="adm-form__input"
                            value={category}
                            onChange={(event) => setCategory(event.target.value as SupplyCategory)}
                        >
                            {SUPPLY_CATEGORIES.map((option) => (
                                <option key={option} value={option}>{SUPPLY_CATEGORY_LABEL[option]}</option>
                            ))}
                        </select>
                    </label>

                    <label className="adm-form__row">
                        <span>Mínimo antes de avisar</span>
                        <input
                            className="adm-form__input"
                            type="text"
                            inputMode="decimal"
                            value={minStock}
                            onChange={(event) => setMinStock(event.target.value)}
                            placeholder="15"
                        />
                    </label>

                    <label className="adm-form__row adm-form__row--full">
                        <span>Proveedor <em>opcional</em></span>
                        <input
                            className="adm-form__input"
                            type="text"
                            value={supplier}
                            onChange={(event) => setSupplier(event.target.value)}
                            placeholder="Molinos Modernos"
                        />
                    </label>

                    <label className="adm-form__row">
                        <span>Presentación de compra <em>opcional</em></span>
                        <input
                            className="adm-form__input"
                            type="text"
                            value={purchaseUnit}
                            onChange={(event) => setPurchaseUnit(event.target.value)}
                            placeholder="saco"
                        />
                    </label>

                    <label className="adm-form__row">
                        <span>Contenido por presentación</span>
                        <input
                            className="adm-form__input"
                            type="text"
                            inputMode="decimal"
                            value={purchaseSize}
                            onChange={(event) => setPurchaseSize(event.target.value)}
                            placeholder="25"
                        />
                    </label>
                    <label className="adm-form__row"><span>Unidad del contenido</span><select className="adm-form__input" value={contentUnit} onChange={e=>setContentUnit(e.target.value)}>{contentUnits.map(u=><option key={u}>{u}</option>)}</select></label>
                </div>

                <p className="adm-form__note">
                    {isConverting && purchaseUnit && Number.isFinite(size) && size > 0 ? (
                        <>
                            Al guardar, {name || "el insumo"} pasa a medirse en {contentUnit}: 1 {unit} = 1 {purchaseUnit} = {purchaseSize} {contentUnit}.
                            {supply
                                ? ` Hoy hay ${formatQuantity(supply.stock)} ${unit}: quedarán ${formatQuantity(roundQuantity(supply.stock * size))} ${contentUnit}, y el mínimo y las recetas se convierten igual.`
                                : ` El mínimo se escribe en ${unit} y se convierte también.`}{" "}
                            Se sigue contando como "3 {getPlural(purchaseUnit)} y 400 {contentUnit}".
                        </>
                    ) : purchaseUnit && purchaseSize ? (
                        <>1 {purchaseUnit} contiene {purchaseSize} {contentUnit}. Las compras se convertirán a {unit} antes de agregarse al inventario.</>
                    ) : (
                        "Configura la presentación y su contenido para comprar en paquetes, cajas o sacos."
                    )}
                </p>

                {onConvertToProduct && !isElaborado && supply?.inventoryType !== "PREPARED_PRODUCT" ? (
                    <p className="adm-form__note">
                        <button type="button" className="adm-link" onClick={onConvertToProduct} disabled={isSending}>
                            Es un producto del menú →
                        </button>{" "}
                        Se vende tal cual: pásalo a lotes y deja de avisar para comprar.
                    </p>
                ) : null}

                {error ? <p className="adm-gate__error">{error}</p> : null}

                <div className="adm-modal__actions">
                    <button type="button" className="adm-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending}>
                        {isEditing ? (isSending ? "Guardando…" : "Guardar cambios") : isSending ? "Creando…" : "Crear insumo"}
                    </button>
                </div>
            </form>
        </div>
    );
};
