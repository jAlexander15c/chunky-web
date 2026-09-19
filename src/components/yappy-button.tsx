import { useEffect, useRef } from "react";

import type { IBtnYappyElement } from "@/btn-yappy";
import { YAPPY_BUTTON_SCRIPT_URL } from "@/helpers";
import type { IYappyPaymentSession } from "@/helpers";

/** Inserta una sola vez el script del web component de Yappy. */
const useYappyScript = () => {
    useEffect(() => {
        if (document.querySelector(`script[src="${YAPPY_BUTTON_SCRIPT_URL}"]`)) return;
        const script = document.createElement("script");
        script.type = "module";
        script.src = YAPPY_BUTTON_SCRIPT_URL;
        document.head.appendChild(script);
    }, []);
};

interface IYappyButtonProps {
    /** Crea la orden en chunky-api. Devuelve null si no se debe seguir (ej. formulario invalido). */
    onCreatePayment: () => Promise<IYappyPaymentSession | null>;
    onSuccess: () => void;
    onError: () => void;
    onOnlineChange: (isOnline: boolean) => void;
}

/** Boton oficial de Yappy. El click crea la orden en nuestro backend y se la pasa al boton. */
export const YappyButton = ({ onCreatePayment, onSuccess, onError, onOnlineChange }: IYappyButtonProps) => {
    const buttonRef = useRef<IBtnYappyElement>(null);
    // Los handlers cambian en cada render; el listener lee siempre la version actual
    const handlersRef = useRef({ onCreatePayment, onSuccess, onError, onOnlineChange });
    handlersRef.current = { onCreatePayment, onSuccess, onError, onOnlineChange };

    useYappyScript();

    useEffect(() => {
        const button = buttonRef.current;
        if (!button) return;

        const setLoading = (isLoading: boolean) => {
            button.isButtonLoading = isLoading;
        };

        const handleClick = async () => {
            setLoading(true);
            try {
                const session = await handlersRef.current.onCreatePayment();
                if (session) {
                    button.eventPayment({
                        transactionId: session.transactionId,
                        token: session.token,
                        documentName: session.documentName,
                    });
                }
            } finally {
                setLoading(false);
            }
        };
        const handleSuccess = () => handlersRef.current.onSuccess();
        const handleError = () => handlersRef.current.onError();
        const handleOnline = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            handlersRef.current.onOnlineChange(detail !== false && detail !== "false");
        };

        button.addEventListener("eventClick", handleClick);
        button.addEventListener("eventSuccess", handleSuccess);
        button.addEventListener("eventError", handleError);
        button.addEventListener("isYappyOnline", handleOnline);

        return () => {
            button.removeEventListener("eventClick", handleClick);
            button.removeEventListener("eventSuccess", handleSuccess);
            button.removeEventListener("eventError", handleError);
            button.removeEventListener("isYappyOnline", handleOnline);
        };
    }, []);

    return <btn-yappy ref={buttonRef} theme="darkBlue" rounded="true" />;
};
