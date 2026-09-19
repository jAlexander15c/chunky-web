import type { DetailedHTMLProps, HTMLAttributes } from "react";

/** Web component del Boton de Pago Yappy (se carga desde su CDN). */
export interface IBtnYappyElement extends HTMLElement {
    eventPayment: (params: { transactionId: string; token: string; documentName: string }) => void;
    isButtonLoading: boolean;
}

declare module "react" {
    namespace JSX {
        interface IntrinsicElements {
            "btn-yappy": DetailedHTMLProps<HTMLAttributes<IBtnYappyElement>, IBtnYappyElement> & {
                theme?: "blue" | "darkBlue" | "orange" | "dark" | "sky" | "light";
                rounded?: "true" | "false";
            };
        }
    }
}
