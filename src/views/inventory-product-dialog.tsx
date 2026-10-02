import { useState } from "react";
import type { IProductStatus, IMenuItem } from "@/helpers/admin";
import { RecipeDialog } from "./inventory-recipe-dialog";
export const ProductRecipeDialog = ({
    token,
    product,
    onClose,
    onChanged,
}: {
    token: string;
    product: IProductStatus;
    onClose: () => void;
    onChanged: () => Promise<void>;
}) => {
    const [item] = useState<IMenuItem>(() => ({
        id: product.itemId,
        name: product.name,
        categoryId: null,
        description: "",
        price: null,
        variantCount: 1,
        modifierIds: [],
        isAvailable: true,
        imageUrl: null,
        createdAt: null,
        variants: [{ variantId: product.variantId, name: product.name }],
    }));
    return <RecipeDialog token={token} item={item} onClose={onClose} onChanged={onChanged} />;
};
