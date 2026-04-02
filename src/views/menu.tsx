import { Box, Button, Center, Heading, HStack, Image, Skeleton, Text, VStack } from "@chakra-ui/react"
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { getCategoryPresentation, shouldDisplayCategory, useCategories } from "@/helpers";
import type { ICategory } from "@/interfaces";
import { useAnimate } from "motion/react"
import { CachedImage, Cart, warmImageCache } from "@/components"
import { CiShoppingCart } from "react-icons/ci";

import logo from "@/assets/logos/Mora Azul.png";

interface IMenuProps {
    cartItems: Array<any>;
    setCartItems: (items: Array<any>) => void;
}

const imgRoute: string = "https://pub-159df1e57b1a433fa45a449347b9a4ac.r2.dev/categorias/"

const CategorySkeletons = () => {
    return (
        <Box className="wrapper">
            {Array.from({ length: 6 }).map((_, index) => (
                <Box
                    key={index}
                    mb="12px"
                    className="wrapperChild"
                    borderRadius="16px"
                    overflow="hidden"
                >
                    <Skeleton height="20rem" width="100%" />
                </Box>
            ))}
        </Box>
    );
};

export const Menu = ({ cartItems, setCartItems }: IMenuProps) => {
    const [animateCartBtnRef, animateCartBtn] = useAnimate();
    const navigate = useNavigate();

    const { categories, loading: cLoading, error: cError } = useCategories();
    const visibleCategories = useMemo(
        () => categories.filter((category) => shouldDisplayCategory(category)),
        [categories]
    );

    useEffect(() => {
        warmImageCache(visibleCategories.map((category) => `${imgRoute}${getCategoryPresentation(category.color).image}`));
    }, [visibleCategories]);

    const [open, setOpen] = useState(false);

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
                    ease: [0.34, 1.56, 0.64, 1], // ✅ correcto
                }
            )
        }
    }, [cartItems, animateCartBtn, animateCartBtnRef]);

    return (
        <VStack id="menuBody">
            {/* Header */}
            <Center id="logoHeader">
                <Image src={logo} alt="Menu Title" width="10rem" />
            </Center>

            {/* Carrusel 
            <CarruselMenu />*/}

            {/* Title categorias */}
            <HStack width={"90vw"} justifyContent="space-between">
                <Heading className="headingAll" id="headerCategories">Categorias</Heading>
            </HStack>

            {cLoading && (
                <CategorySkeletons />
            )}

            {/* Wrap de categorias */}
            {!cLoading && !cError && (
                <Box className="wrapper">
                    {visibleCategories.map((item: ICategory, i: number) => {
                        const presentation = getCategoryPresentation(item.color);

                        return (
                            <Box
                                key={i}
                                mb="12px"
                                className="wrapperChild"
                                id="itemCategoria"
                                onClick={() => navigate(`/items?categoryId=${item.id}`, { state: { categoryName: item.name } })}
                            >
                                <CachedImage
                                    rootClassName="category-media"
                                    src={imgRoute + presentation.image}
                                    alt={item.name}
                                    width="100%"
                                    height="20rem"
                                    objectFit="cover"
                                    display="block"
                                    skeletonProps={{ borderRadius: "16px" }}
                                />

                                {/* Opacity info */}
                                <VStack className="category-overlay">
                                    <Heading fontSize={"2rem"}>{item.name}</Heading>

                                    <Text
                                        fontSize="sm"
                                        style={{
                                            "textAlign": "right"
                                        }}
                                    >{presentation.description}</Text>
                                </VStack>
                            </Box>
                        )
                    })}
                </Box>
            )}

            <Cart
                items={cartItems}
                open={open}
                setOpen={setOpen}
                setCartItems={setCartItems}
            />

            {/* Boton flotante carrito */}
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

            {/* Footer 
            <Center id="footerMenu">
                <Button
                    variant="subtle"
                    onClick={() => {

                    }}
                >¿Eres parte del Chunky Equipo?</Button>
            </Center>*/}
        </VStack>
    )
}
