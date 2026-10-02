import { useState } from "react";
import { AmountDialog } from "@/components";
import type { IProductStatus } from "@/helpers/admin";
import { receiveProductBatch } from "@/helpers/inventory";

export const ProductArrivalDialog = ({
    token,
    product,
    scope = "admin",
    onSaved,
    onClose,
}: {
    token: string;
    product: IProductStatus;
    scope?: "admin" | "gestion";
    onSaved: () => Promise<void>;
    onClose: () => void;
}) => {
    const [requestId] = useState(() => crypto.randomUUID());
    return (
        <AmountDialog
            title={`Llegada de ${product.name}`}
            hint={`Cuántas unidades llegaron. La fecha de llegada se registra al guardar. ${
                product.isPerishable && product.shelfLifeDays
                    ? "El vencimiento se calcula con la vida útil configurada de " + product.shelfLifeDays + " días."
                    : "Se registrará sin vencimiento porque no hay vida útil configurada para este producto."
            } Se suman al stock existente.`}
            unit="u"
            confirmLabel="Registrar llegada"
            buttonClass={scope === "gestion" ? "ges-btn" : "adm-btn"}
            onConfirm={async (amount) => {
                await receiveProductBatch(token, product.variantId, String(amount), scope, requestId);
                await onSaved();
            }}
            onClose={onClose}
        />
    );
};
