import {
    Button, CloseButton, Dialog, Heading, HStack,
    IconButton, Image, NumberInput, Portal, Text, VStack
} from "@chakra-ui/react"
import { LuMinus, LuPlus, LuTrash } from "react-icons/lu";
import { useEffect, useState } from "react";

import type { IItem } from "@/interfaces"
import icon from "@/assets/logos/iconError.jpeg";

interface ICart {
    open: boolean;
    setOpen: (open: boolean) => void;
    items: IItem[];
    setCartItems: (items: Array<IItem>) => void;
}

export const Cart = ({ items, open, setOpen, setCartItems }: ICart) => {
    

    const removeItemFromCart = (id: string) => {
        const updatedItems = items.filter(item => item.id !== id);
        setCartItems(updatedItems);
    };

    const getItemQuantity = (id: string) => {
        return items.filter(item => item.id === id).length;
    };

    const updateItemQuantity = (id: string, newQuantity: number) => {
        if (newQuantity <= 0) {
            removeItemFromCart(id);
            return;
        }

        //const currentQuantity = getItemQuantity(id);
        const itemTemplate = items.find(item => item.id === id);

        if (!itemTemplate) return;

        // Remove all instances of this item
        const otherItems = items.filter(item => item.id !== id);

        // Add the new quantity of items
        const newItems = [];
        for (let i = 0; i < newQuantity; i++) {
            newItems.push({ ...itemTemplate });
        }

        setCartItems([...otherItems, ...newItems]);
    };

    const openWhatsApp = (message: string) => {
        const phone = "50763266648"; // número de Chunky
        const encodedMessage = encodeURIComponent(message);

        const url = `https://wa.me/${phone}?text=${encodedMessage}`;

        window.open(url, "_blank");
    };

    useEffect(() => {
        if (items.length === 0) {
            setOpen(false);
        }
    }, [items])

    return (
        <Dialog.Root size="cover" placement="center" motionPreset="slide-in-bottom" open={open} onOpenChange={(e) => setOpen(e.open)}>
            <Portal>
                <Dialog.Backdrop backdropFilter={"blur(5px)"} background={"rgba(0, 0, 0, 0.50)"} />
                <Dialog.Positioner>
                    <Dialog.Content borderRadius={"2rem"} background={"#000000"}>
                        <Dialog.Header>
                            <Dialog.Title>Carrito</Dialog.Title>
                            <Dialog.CloseTrigger asChild>
                                <CloseButton size="sm" />
                            </Dialog.CloseTrigger>
                        </Dialog.Header>
                        <Dialog.Body>
                            <VStack
                                style={{
                                    "width": "100%",
                                    "height": "100%",
                                    "justifyContent": "space-between",
                                }}
                            >
                                <VStack
                                    style={{
                                        "maxHeight": "85%",
                                        "width": "100%",
                                        "overflowY": "auto",
                                        "flex": "1 1 0"
                                    }}
                                >
                                    {/* Listado de Items */}
                                    {Array.from(new Set([...items].reverse().map(item => item.id))).map((itemId) => {
                                        const item = items.find(i => i.id === itemId)!;
                                        return (
                                            <ItemCard
                                                key={itemId}
                                                item={{ ...item, cant: getItemQuantity(item.id) }}
                                                onRemoveItem={removeItemFromCart}
                                                onUpdateQuantity={updateItemQuantity}
                                            />
                                        );
                                    })}
                                </VStack>

                                {/* Resumen de totales */}
                                <VStack
                                    w="100%"
                                    p={4}
                                    borderRadius="1rem"
                                    border="1px solid #ffffff63"
                                    bg="#00000098"
                                    gap={2}
                                >
                                    {/* Subtotal */}
                                    <HStack w="100%" justify="space-between">
                                        <Text fontSize="md">Subtotal:</Text>
                                        <Text fontSize="md">${items.reduce((sum, item) => sum + (item.variants[0].default_price ? item.variants[0].default_price : 0), 0).toFixed(2)}</Text>
                                    </HStack>

                                    {/* Impuesto */}
                                    <HStack w="100%" justify="space-between">
                                        <Text fontSize="md">Impuesto (7%):</Text>
                                        <Text fontSize="md">${(items.reduce((sum, item) => sum + (item.variants[0].default_price ? item.variants[0].default_price : 0), 0) * 0.00).toFixed(2)}</Text>
                                    </HStack>

                                    {/* Total */}
                                    <HStack w="100%" justify="space-between" borderTop="1px solid" borderColor="gray.200" pt={2}>
                                        <Text fontSize="lg" fontWeight="bold">Total:</Text>
                                        <Text fontSize="lg" fontWeight="bold" color="green.600">
                                            ${(items.reduce((sum, item) => sum + (item.variants[0].default_price ? item.variants[0].default_price : 0), 0)).toFixed(2)}
                                        </Text>
                                    </HStack>

                                    {/* Botón Pagar */}
                                    <Button
                                        style={{
                                            width: "100%",
                                            padding: "0.75rem 1.5rem",
                                            backgroundColor: "#31aa26ff",
                                            color: "white",
                                            borderRadius: "0.5rem",
                                            fontSize: "1.125rem",
                                            fontWeight: "600",
                                            border: "none",
                                            cursor: "pointer",
                                            marginTop: "0.5rem"
                                        }}
                                        onClick={() => {
                                            const groupedItems = items.reduce((acc, item) => {
                                                if (!acc[item.id]) {
                                                    acc[item.id] = { ...item, quantity: 0 };
                                                }
                                                acc[item.id].quantity += 1;
                                                return acc;
                                            }, {} as Record<string, IItem & { quantity: number }>);
                                            openWhatsApp(`¡Hola! Me gustaría realizar el siguiente pedido:\n\n${Object.values(groupedItems).map(item => `- ${item.item_name} x${item.quantity}`).join("\n")}\n\nTotal: $${(items.reduce((sum, item) => sum + (item.variants[0].default_price ? item.variants[0].default_price : 0), 0)).toFixed(2)}`);
                                        }}
                                    >
                                        Realizar Pedido
                                    </Button>
                                </VStack>
                            </VStack>
                        </Dialog.Body>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Portal>
        </Dialog.Root>
    )
}

interface IItemCard {
    item: IItem;
    onRemoveItem: (item: string) => void;
    onUpdateQuantity: (id: string, quantity: number) => void;
}

const ItemCard = ({ item, onRemoveItem, onUpdateQuantity }: IItemCard) => {


    return (
        <VStack w="100%" gap={4} p={4}
            style={{
                "padding": "0.5rem",
                "borderRadius": "1rem",
                "border": "1px solid #ffffff63"
            }}
        >
            {/* Layout responsive: Stack vertical en móvil, horizontal en desktop */}
            <VStack w="100%" gap={{ base: 4, md: 2 }}>
                {/* Primera fila: Imagen e info */}
                <HStack w="100%" align="start" gap={4} justify="space-between">
                    {/* Imagen */}
                    <Image
                        src={item.image_url || icon}
                        alt={item.item_name}
                        boxSize={{ base: "60px", md: "80px" }}
                        objectFit="cover"
                        borderRadius="md"
                        flexShrink={0}
                    />

                    {/* Info - toma el espacio disponible */}
                    <VStack align="start" flex="1" gap={1}>
                        <Heading size={{ base: "md", md: "lg" }} lineHeight="1.2">{item.item_name}</Heading>
                        <Text fontSize={{ base: "sm", md: "md" }} color="gray.600" lineClamp={2} dangerouslySetInnerHTML={{ __html: item.description }} />
                        {/* {item.alergens && item.alergens.length > 0 && (
                            <HStack wrap="wrap" gap={1}>
                                {item.alergens.map((alergen, index) => (
                                    <Badge key={index} colorScheme="red" fontSize="xs">{alergen}</Badge>
                                ))}
                            </HStack>
                        )} */}
                    </VStack>

                    {/* Delete button - siempre visible en la esquina */}
                    <IconButton
                        aria-label="Eliminar item"
                        variant="ghost"
                        colorScheme="red"
                        size="sm"
                        flexShrink={0}
                        onClick={() => onRemoveItem(item.id)}
                    >
                        <LuTrash />
                    </IconButton>
                </HStack>

                {/* Segunda fila: Contador y precio */}
                <HStack w="100%" justify="space-between" align="center">
                    {/* Cantidad */}
                    <Counter cant={item.cant || 0} setCant={(value: number) => onUpdateQuantity(item.id, value)} />

                    {/* Precio */}
                    <Text fontSize={{ base: "lg", md: "xl" }} fontWeight="semibold" color="green.600">
                        ${(item.variants[0].default_price ? (item.variants[0].default_price * (item.cant || 0)).toFixed(2) : "0.00")}
                    </Text>
                </HStack>
            </VStack>
        </VStack>
    )
}

interface ICounter {
    cant: number;
    setCant: (value: number) => void;
}

const Counter = ({ cant, setCant }: ICounter) => {
    const [value, setValue] = useState(cant.toString());

    useEffect(() => {
        setValue(cant.toString());
    }, [cant]);

    const handleValueChange = (details: any) => {
        setValue(details.value);
        const numValue = parseInt(details.value) || 0;
        setCant(numValue);
    };

    return (
        <NumberInput.Root
            value={value}
            unstyled
            spinOnPress={false}
            onValueChange={handleValueChange}
        >
            <HStack gap="2">
                <NumberInput.DecrementTrigger asChild>
                    <IconButton variant="outline" size="sm">
                        <LuMinus />
                    </IconButton>
                </NumberInput.DecrementTrigger>
                <NumberInput.ValueText textAlign="center" fontSize="lg" minW="3ch" />
                <NumberInput.IncrementTrigger asChild>
                    <IconButton variant="outline" size="sm">
                        <LuPlus />
                    </IconButton>
                </NumberInput.IncrementTrigger>
            </HStack>
        </NumberInput.Root>
    )
}