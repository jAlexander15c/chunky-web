import { useState } from "react";

interface ITogoDialogProps {
    onOpen: (customerName: string) => Promise<void>;
    onClose: () => void;
}

/** El nombre es opcional: sirve para que la cocina sepa a quién llamar cuando esté listo. */
export const TogoDialog = ({ onOpen, onClose }: ITogoDialogProps) => {
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
