
import { Box, Button, Card, Center, Heading, HStack, Image, Skeleton, Text, VStack } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { useAnimate } from "motion/react";
import { CiShoppingCart } from "react-icons/ci";
import { useLocation, useNavigate, useSearchParams } from "react-router";

import { getCategoryName, hasItemAvailableForSale, isWithinOperatingHours, useItems } from "@/helpers";
import type { IItem } from "@/interfaces";
import { CachedImage, Cart, warmImageCache } from "@/components";

import icon from "@/assets/logos/iconError.jpeg";
import logo from "@/assets/logos/Mora Azul.png";

interface IItemsProps {
    cartItems: Array<any>;
    setCartItems: (items: Array<any>) => void;
}

const ItemSkeletons = () => {
    return (
        <Box className="wrapper">
            {Array.from({ length: 6 }).map((_, index) => (
                <Card.Root
                    key={index}
                    maxW="sm"
                    overflow="hidden"
                    className="cardCart"
                >
                    <Skeleton height="15rem" width="100%" />
                    <Card.Body gap="3">
                        <Skeleton height="1.8rem" width="70%" />
                        <Skeleton height="0.9rem" width="100%" />
                        <Skeleton height="0.9rem" width="85%" />
                        <Skeleton height="1.6rem" width="35%" mt="2" />
                    </Card.Body>
                    <Card.Footer>
                        <Skeleton height="2.5rem" width="100%" />
                    </Card.Footer>
                </Card.Root>
            ))}
        </Box>
    );
};

export const Items = ({ cartItems, setCartItems }: IItemsProps) => {
    const [animateCartBtnRef, animateCartBtn] = useAnimate();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const selectedCategoryId = searchParams.get("categoryId") ?? "";
    const categoryName = (location.state as { categoryName?: string } | null)?.categoryName ?? getCategoryName(selectedCategoryId);
    const [open, setOpen] = useState(false);
    const { items, loading, error } = useItems(selectedCategoryId);
    const availableItems = useMemo(
        () => items.filter((item) => item.category_id === selectedCategoryId && hasItemAvailableForSale(item)),
        [items, selectedCategoryId]
    );

    useEffect(() => {
        warmImageCache(availableItems.map((item) => item.image_url || icon));
    }, [availableItems]);

    useEffect(() => {
        if (cartItems.length > 0) {
            animateCartBtn(
                animateCartBtnRef.current,
                {
                    scale: [0.92, 1],
                    opacity: [0.6, 1],
                    y: [8, 0],
                },
                {
                    duration: 0.35,
                    ease: [0.34, 1.56, 0.64, 1],
                }
            );
        }
    }, [cartItems, animateCartBtn, animateCartBtnRef]);

    return (
        <VStack id="menuBody">
            <Center id="logoHeader">
                <Image src={logo} alt="Menu Title" width="10rem" />
            </Center>

            <HStack width={"90vw"} justifyContent="space-between">
                <Heading className="headingAll" id="headerCategories">{categoryName}</Heading>
                <Button variant="subtle" size="sm" onClick={() => navigate("/menu")}>Volver a categorias</Button>
            </HStack>

            {!selectedCategoryId && (
                <Text width="90vw">Selecciona una categoria para ver sus items.</Text>
            )}

            {selectedCategoryId && loading && (
                <ItemSkeletons />
            )}

            {selectedCategoryId && !loading && !error && (
                <Box className="wrapper">
                    {availableItems.map((item: IItem, i: number) => {
                        return (
                            <Card.Root
                                key={i}
                                maxW="sm"
                                overflow="hidden"
                                className="cardCart"
                            >
                                <CachedImage
                                    rootClassName="item-media"
                                    src={item.image_url || icon}
                                    alt={item.item_name}
                                    width="100%"
                                    height="15rem"
                                    objectFit="cover"
                                    display="block"
                                />
                                <Card.Body gap="2">
                                    <Card.Title fontFamily={"heading"} fontSize={"2xl"}>{item.item_name}</Card.Title>
                                    <Card.Description dangerouslySetInnerHTML={{ __html: item.description }} />
                                    <Text textStyle="2xl" fontWeight="medium" letterSpacing="tight" mt="2">
                                        ${item.variants[0].default_price?.toFixed(2)}
                                    </Text>
                                </Card.Body>

                                <Card.Footer gap="2">
                                    {isWithinOperatingHours() ? (
                                        <Button
                                            variant="solid"
                                            onClick={() => {
                                                setCartItems([...cartItems, item]);
                                            }}
                                        >Agregar al carrito</Button>
                                    ) : (
                                        <Text fontSize="sm" color="gray.500" width="100%" textAlign="center">
                                            Cerrado en este horario
                                        </Text>
                                    )}
                                </Card.Footer>
                            </Card.Root>
                        );
                    })}
                </Box>
            )}

            {selectedCategoryId && !loading && !error && availableItems.length === 0 && (
                <Text width="90vw">No hay items disponibles para esta categoria.</Text>
            )}

            <Cart
                items={cartItems}
                open={open}
                setOpen={setOpen}
                setCartItems={setCartItems}
            />

            {cartItems.length > 0 && (
                <HStack
                    style={{
                        "position": "fixed",
                        "bottom": "2rem",
                        "right": "2rem",
                        "cursor": "pointer"
                    }}
                    ref={animateCartBtnRef}
                    onClick={() => setOpen(true)}
                >
                    <Text
                        style={{
                            "borderRadius": "0.8rem",
                            "background": "rgba(0, 0, 0, 0.50)",
                            "backdropFilter": "blur(5px)",
                            "color": "#FFFFFF",
                            "padding": "0.4rem 1rem"
                        }}
                    >Ver Carrito</Text>
                    <Button
                        style={{
                            "borderRadius": "50%",
                            "background": "rgba(0, 0, 0, 0.50)",
                            "backdropFilter": "blur(5px)",
                            "color": "#FFFFFF",
                            "padding": "0"
                        }}
                    >
                        <CiShoppingCart size={24} />
                    </Button>
                </HStack>
            )}
        </VStack>
    );
};
