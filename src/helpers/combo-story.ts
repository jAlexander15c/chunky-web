import { formatComboDate, formatComboSchedule, formatComboUntil, getComboImageUrl, getComboMinutes } from "./combos";
import type { IComboAdmin, IPublicCombo } from "./combos";
import { formatPrice } from "./order";

import logo from "@/assets/logos/Mora Azul.png";
import mascota from "@/assets/logos/mascota.png";

/** Tamaño de una historia de Instagram. */
export const STORY_SIZE = { width: 1080, height: 1920 } as const;

const COLORS = {
    mora: "#3a4b8e",
    ink: "#26305c",
    lima: "#e3e8a7",
    mantequilla: "#f8e3af",
    crema: "#fcfae9",
    white: "#fffef6",
    soft: "#6b7096",
};

const SANS = "Montserrat, system-ui, sans-serif";
const SCRIPT = "Guadalimar, 'Brush Script MT', cursive";

interface IStoryOptions {
    /** El pie de la historia. */
    siteLabel?: string;
}

const loadImage = (url: string, isCrossOrigin = false) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        if (isCrossOrigin) image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`No cargó la imagen ${url}`));
        image.src = url;
    });

const tracePath = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
};

/** Texto con espacio extra entre letras, centrado en x (no depende de ctx.letterSpacing). */
const drawSpacedText = (context: CanvasRenderingContext2D, text: string, centerX: number, y: number, spacing: number) => {
    const chars = [...text];
    const widths = chars.map((char) => context.measureText(char).width);
    const total = widths.reduce((sum, width) => sum + width, 0) + spacing * (chars.length - 1);
    let x = centerX - total / 2;
    context.textAlign = "left";
    chars.forEach((char, index) => {
        context.fillText(char, x, y);
        x += widths[index] + spacing;
    });
};

/** Parte el texto en renglones que quepan en maxWidth con la fuente ya puesta en el contexto. */
const wrapText = (context: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const lines: string[] = [];
    let current = "";
    text.split(/\s+/).filter(Boolean).forEach((word) => {
        const next = current ? `${current} ${word}` : word;
        if (current && context.measureText(next).width > maxWidth) {
            lines.push(current);
            current = word;
        } else {
            current = next;
        }
    });
    if (current) lines.push(current);
    return lines;
};

/** Mañana antes de las 12, tarde antes de las 18 y noche el resto. */
export const getStoryKicker = (minutes: number) => `COMBO DE LA ${minutes < 12 * 60 ? "MAÑANA" : minutes < 18 * 60 ? "TARDE" : "NOCHE"}`;

/** El nombre más grande que quepa: en una línea si se puede y, si no, en dos como máximo. */
const fitName = (context: CanvasRenderingContext2D, name: string, maxWidth: number) => {
    const measure = (size: number) => {
        context.font = `400 ${size}px ${SCRIPT}`;
        return wrapText(context, name, maxWidth);
    };
    for (let size = 150; size >= 110; size -= 4) {
        const lines = measure(size);
        if (lines.length === 1) return { size, lines };
    }
    for (let size = 130; size >= 60; size -= 4) {
        const lines = measure(size);
        if (lines.length <= 2 && lines.every((line) => context.measureText(line).width <= maxWidth)) return { size, lines };
    }
    return { size: 60, lines: measure(60).slice(0, 2) };
};

/**
 * Dibuja la historia de un combo (1080×1920) con los colores y letras de la marca y la devuelve como PNG.
 * `slotsText` es lo que lleva: "1 galleta a elegir + 1 bebida a elegir".
 */
export const drawComboStory = async (combo: IComboAdmin | IPublicCombo, slotsText: string, options: IStoryOptions = {}): Promise<Blob> => {
    const { width, height } = STORY_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Este navegador no puede dibujar la historia.");

    // Sin las letras cargadas el canvas dibujaría con otra fuente
    await Promise.all([
        document.fonts.load(`400 140px ${SCRIPT}`, combo.name),
        document.fonts.load(`600 40px ${SANS}`),
        document.fonts.load(`800 40px ${SANS}`),
        document.fonts.load(`900 120px ${SANS}`),
    ]);

    const [logoImage, mascotImage, photo] = await Promise.all([
        loadImage(logo),
        loadImage(mascota),
        loadImage(getComboImageUrl(combo), true).catch(() => null),
    ]);

    const centerX = width / 2;
    context.textBaseline = "alphabetic";

    // Fondo y marco punteado
    context.fillStyle = COLORS.crema;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = COLORS.mora;
    context.lineWidth = 10;
    context.setLineDash([34, 22]);
    tracePath(context, 38, 38, width - 76, height - 76, 34);
    context.stroke();
    context.setLineDash([]);

    // Logo
    const logoWidth = 400;
    const logoHeight = (logoImage.height / logoImage.width) * logoWidth;
    context.drawImage(logoImage, centerX - logoWidth / 2, 96, logoWidth, logoHeight);

    // Kicker
    const timeMinutes = "timeFrom" in combo ? getComboMinutes(combo.timeFrom) : getComboMinutes(combo.timeTo) - 60;
    context.fillStyle = COLORS.mora;
    context.font = `800 34px ${SANS}`;
    drawSpacedText(context, getStoryKicker(timeMinutes), centerX, 96 + logoHeight + 66, 10);

    // Foto: cuadrada, con borde blanco, sombra y media vuelta a la izquierda
    const photoSize = 670;
    const photoY = 96 + logoHeight + 66 + 52;
    context.save();
    context.translate(centerX, photoY + photoSize / 2);
    context.rotate((-3 * Math.PI) / 180);
    context.shadowColor = "rgba(38, 48, 92, 0.28)";
    context.shadowBlur = 56;
    context.shadowOffsetY = 20;
    context.fillStyle = COLORS.white;
    tracePath(context, -photoSize / 2 - 17, -photoSize / 2 - 17, photoSize + 34, photoSize + 34, 62);
    context.fill();
    context.shadowColor = "transparent";
    tracePath(context, -photoSize / 2, -photoSize / 2, photoSize, photoSize, 46);
    context.clip();
    if (photo) {
        const side = Math.min(photo.width, photo.height);
        context.drawImage(photo, (photo.width - side) / 2, (photo.height - side) / 2, side, side, -photoSize / 2, -photoSize / 2, photoSize, photoSize);
    } else {
        context.fillStyle = COLORS.mantequilla;
        context.fillRect(-photoSize / 2, -photoSize / 2, photoSize, photoSize);
        context.drawImage(mascotImage, -photoSize * 0.3, -photoSize * 0.3, photoSize * 0.6, photoSize * 0.6);
    }
    context.restore();

    // Nombre en la letra de la marca
    const bottomOfPhoto = photoY + photoSize;
    const name = fitName(context, combo.name, 880);
    context.fillStyle = COLORS.mora;
    context.textAlign = "center";
    context.font = `400 ${name.size}px ${SCRIPT}`;
    let cursorY = bottomOfPhoto + 40 + name.size * 0.85;
    name.lines.forEach((line) => {
        context.fillText(line, centerX, cursorY);
        cursorY += name.size * 0.95;
    });
    cursorY += -name.size * 0.95 + 36;

    // Lo que lleva, un renglón por hueco
    context.fillStyle = COLORS.ink;
    context.font = `600 40px ${SANS}`;
    slotsText.split(" + ").forEach((part, index) => {
        cursorY += 56;
        context.fillText(index === 0 ? part : `+ ${part}`, centerX, cursorY);
    });

    // Pie: horario en una píldora y el sitio
    const hasEnd = "endsOn" in combo && combo.endsOn;
    const schedule = "days" in combo ? formatComboSchedule(combo.days, combo.timeFrom, combo.timeTo) : formatComboUntil(combo.timeTo);
    const pillText = hasEnd ? `${schedule} · hasta el ${formatComboDate(hasEnd as string)}` : schedule;
    let pillFont = 44;
    context.font = `800 ${pillFont}px ${SANS}`;
    while (context.measureText(pillText).width > 820 && pillFont > 24) {
        pillFont -= 2;
        context.font = `800 ${pillFont}px ${SANS}`;
    }
    const pillWidth = context.measureText(pillText).width + 96;
    const pillHeight = 84;
    const pillY = height - 38 - 40 - 56 - pillHeight - 20;
    context.fillStyle = COLORS.mora;
    tracePath(context, centerX - pillWidth / 2, pillY, pillWidth, pillHeight, pillHeight / 2);
    context.fill();
    context.fillStyle = COLORS.crema;
    context.textAlign = "center";
    context.fillText(pillText, centerX, pillY + pillHeight / 2 + pillFont * 0.35);

    context.fillStyle = COLORS.mora;
    context.font = `700 32px ${SANS}`;
    context.fillText(options.siteLabel ?? "Pide en ischunkybites.com", centerX, height - 38 - 40 - 12);

    // Sello del precio, en el espacio que queda entre lo que lleva y el horario
    const sealTop = cursorY + 36;
    const sealSpace = pillY - 24 - sealTop;
    const sealSize = Math.max(200, Math.min(320, sealSpace));
    const sealCenterY = sealTop + sealSpace / 2;
    const hasSaving = combo.regularPrice !== null && combo.regularPrice > combo.price;
    context.save();
    context.translate(centerX, sealCenterY);
    context.rotate((6 * Math.PI) / 180);
    context.beginPath();
    context.arc(0, 0, sealSize / 2, 0, Math.PI * 2);
    context.fillStyle = COLORS.lima;
    context.fill();
    context.strokeStyle = COLORS.mora;
    context.lineWidth = 8;
    context.setLineDash([22, 14]);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = COLORS.mora;
    context.textAlign = "center";
    // El precio, tan grande como quepa dentro del sello
    const priceText = formatPrice(combo.price);
    let priceFont = Math.round(sealSize * 0.3);
    context.font = `900 ${priceFont}px ${SANS}`;
    while (context.measureText(priceText).width > sealSize * 0.78 && priceFont > 20) {
        priceFont -= 2;
        context.font = `900 ${priceFont}px ${SANS}`;
    }
    context.fillText(priceText, 0, hasSaving ? sealSize * 0.06 : sealSize * 0.12);
    if (hasSaving) {
        const before = `antes ${formatPrice(combo.regularPrice as number)}`;
        context.fillStyle = COLORS.soft;
        context.font = `600 ${Math.round(sealSize * 0.105)}px ${SANS}`;
        context.fillText(before, 0, sealSize * 0.22);
        const beforeWidth = context.measureText(before).width;
        context.strokeStyle = COLORS.soft;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(-beforeWidth / 2, sealSize * 0.22 - sealSize * 0.035);
        context.lineTo(beforeWidth / 2, sealSize * 0.22 - sealSize * 0.035);
        context.stroke();
    }
    context.restore();

    // Mascota abajo a la derecha
    context.save();
    context.translate(width - 86 - 85, pillY - 190 + 85);
    context.rotate((10 * Math.PI) / 180);
    context.drawImage(mascotImage, -85, -85, 170, 170);
    context.restore();

    return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen."))), "image/png")
    );
};
