export interface ICategory {
    id: string;
    name: string;
    color?: string;
    created_at?: string;
    deleted_at?: string | null;
    /** Cuando cambio su foto (la guarda nuestra API, no Loyverse). Null si no tiene. */
    image_version?: number | null;
};