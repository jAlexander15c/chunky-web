/** Copia a mano del contrato del API (chunky-api, módulo integrations/pedidosya). */
export type PedidosYaSecretName = "username" | "password" | "webhookSecret";

export interface ISecretInfo {
    isSet: boolean;
    readable: boolean;
    last4: string;
    updatedAt: string | null;
    updatedBy: string | null;
}

export type PedidosYaEnvironment = "staging" | "production";

export interface IPedidosYaTestResult {
    ok: boolean;
    at: string;
    message: string;
    expiresAt: string | null;
}

export interface IPedidosYaStatus {
    enabled: boolean;
    environment: PedidosYaEnvironment;
    chainCode: string;
    remoteId: string;
    /** La efectiva, con el valor por defecto aplicado. */
    middlewareUrl: string;
    commissionPercent: number;
    masterKeyReady: boolean;
    secrets: Record<PedidosYaSecretName, ISecretInfo>;
    lastTest: IPedidosYaTestResult | null;
    canEnable: boolean;
    /** Textos en español de lo que falta para activar. */
    missing: string[];
}

/** Cuerpo parcial del PUT: todo es opcional. */
export interface IPedidosYaConfigInput {
    environment?: PedidosYaEnvironment;
    chainCode?: string;
    remoteId?: string;
    middlewareUrl?: string;
    commissionPercent?: number;
    secrets?: Partial<Record<PedidosYaSecretName, string>>;
}
