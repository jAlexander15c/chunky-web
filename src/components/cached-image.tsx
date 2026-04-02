import { Box, Image, Skeleton } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import type { ImageProps, SkeletonProps } from "@chakra-ui/react";

const loadedImages = new Set<string>();
const pendingImages = new Map<string, Promise<void>>();

function preloadImage(src: string) {
    if (!src) return Promise.resolve();
    if (loadedImages.has(src)) return Promise.resolve();

    const pending = pendingImages.get(src);
    if (pending) return pending;

    const request = new Promise<void>((resolve) => {
        const image = new window.Image();

        image.onload = () => {
            loadedImages.add(src);
            pendingImages.delete(src);
            resolve();
        };

        image.onerror = () => {
            pendingImages.delete(src);
            resolve();
        };

        image.src = src;
    });

    pendingImages.set(src, request);
    return request;
}

export function warmImageCache(urls: Array<string | undefined | null>) {
    if (typeof window === "undefined") return;

    urls.filter(Boolean).forEach((url) => {
        preloadImage(url as string);
    });
}

interface ICachedImageProps extends ImageProps {
    rootClassName?: string;
    skeletonProps?: SkeletonProps;
}

export const CachedImage = ({ src, alt, rootClassName, skeletonProps, ...props }: ICachedImageProps) => {
    const imageSrc = typeof src === "string" ? src : "";
    const [loaded, setLoaded] = useState(() => !imageSrc || loadedImages.has(imageSrc));

    useEffect(() => {
        if (!imageSrc) {
            setLoaded(true);
            return;
        }

        if (loadedImages.has(imageSrc)) {
            setLoaded(true);
            return;
        }

        let cancelled = false;
        setLoaded(false);

        preloadImage(imageSrc).then(() => {
            if (!cancelled) {
                setLoaded(true);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [imageSrc]);

    return (
        <Box className={rootClassName} position="relative" width={props.width ?? "100%"} height={props.height}>
            {!loaded && (
                <Skeleton
                    position="absolute"
                    inset="0"
                    width="100%"
                    height="100%"
                    {...skeletonProps}
                />
            )}
            <Image
                {...props}
                src={src}
                alt={alt}
                opacity={loaded ? 1 : 0}
                transition="opacity 0.2s ease"
            />
        </Box>
    );
};