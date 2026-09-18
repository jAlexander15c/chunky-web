---
name: design-from-brief
description: "Diseña una interfaz completa a partir de un brief minimo, combinando design-taste-frontend (dirección visual, dials, sistema de diseño, reglas anti-slop), impeccable (modo de superficie, craft floor, proceso de construcción y QA acotado) y emil-design-eng (decisiones de motion y pulido de componentes). Al invocarse, SOLO debe pedir tres cosas: el objetivo del diseño, la línea de diseño, e imágenes (logos y otros assets de marca). Nunca pide nada más."
user-invocable: true
argument-hint: "[objetivo del diseño]"
---

# Diseño desde Brief

Orquesta tres skills ya instaladas — `design-taste-frontend`, `impeccable`, `emil-design-eng` — para producir una interfaz completa a partir de la menor cantidad de información posible del usuario.

## Regla central: solo tres preguntas

Al ser invocado, pide **únicamente** estas tres cosas, en un solo turno:

1. **Objetivo del diseño** — qué es (landing, portafolio, rediseño, app, sección específica) y para qué sirve.
2. **Línea de diseño** — estilo o dirección visual deseada (referencias, adjetivos de marca, ejemplos de sitios/apps que le gusten, o "libre" si no tiene preferencia).
3. **Imágenes** — logos y cualquier otro asset visual de marca que ya exista (o confirmación de que no hay ninguno).

Si el usuario ya dio alguno de estos tres datos en su mensaje inicial, no lo repreguntes — pide solo lo que falte, en el mismo formato de tres puntos.

**No preguntes nada más.** Nunca pidas paleta de colores, tipografía, framework/stack, estructura de secciones, nivel de animación, dispositivo objetivo, ni ningún otro detalle técnico o de diseño: todo eso se infiere combinando las tres skills base. Si el usuario ofrece esos detalles espontáneamente, úsalos; no los solicites de forma proactiva.

## Flujo una vez recibidas las tres respuestas

Construye en una sola pasada completa (no preguntes de nuevo, no itores en bucle abierto):

1. **Lectura de brief y dirección visual — `design-taste-frontend`**
   Invoca esta skill (Skill tool) usando el objetivo + línea de diseño como el brief de la Sección 0. Deja que infiera: tipo de página/audiencia, "Design Read", los tres dials (`DESIGN_VARIANCE`, `MOTION_INTENSITY`, `VISUAL_DENSITY`), el sistema de diseño o stack apropiado, tipografía, paleta (aplicando las bans de purpura-IA y beige+bronce por defecto), estrategia de imágenes, y todas las reglas anti-slop de layout/copy/hero.
   Si el usuario proporcionó logos/imágenes, trátalos como Section 11 "brand assets que ya existen" — material de partida, nunca opcional, y nunca inventes un logo si ya se dio uno real.

2. **Modo de superficie y piso de calidad — `impeccable`**
   Invoca esta skill para: elegir el modo correcto (persuade/operate/read/experience) según el objetivo declarado, planear la superficie (equivalente a `shape`/`new-work` para trabajo nuevo, o el flujo de refinamiento si el objetivo es un rediseño sobre algo existente), y aplicar el craft floor antes de tocar cualquier UI. Sigue su disciplina de verificación acotada: construir completo, inspeccionar una vez (desktop + mobile), corregir en un solo lote, confirmar con una ronda más como máximo. No abras un ciclo de auto-QA indefinido.

3. **Motion y pulido de componentes — `emil-design-eng`**
   Invoca esta skill sobre los componentes ya construidos para decidir: si algo debe animarse o no, qué easing/duración usar, estados de presión/hover, transform-origin de popovers, y el resto del framework de decisión de animación. Aplica esto como capa final sobre la estructura ya definida por `design-taste-frontend`, no como sustituto de ella.

4. **Assets de imagen**
   Usa las imágenes/logos entregados por el usuario tal cual (no los reemplaces por placeholders). Para cualquier imagen adicional que el brief necesite y que el usuario no proveyó, sigue la prioridad de assets de `design-taste-frontend` (Sección 4.8): herramienta de generación de imágenes primero, imágenes reales/stock después, placeholder etiquetado como último recurso — y avisa al final qué placeholders quedaron pendientes.

5. **Cierre**
   Al terminar, resume en pocas líneas las decisiones tomadas (dirección visual, dials, sistema/stack, paleta, tipografía, nivel de motion) para que el usuario tenga trazabilidad — pero esto es un resumen posterior, nunca preguntas previas.

## Qué no hacer

- No preguntar más de las tres cosas iniciales, bajo ninguna circunstancia.
- No pedir confirmación dial por dial de `design-taste-frontend`, ni el modo de `impeccable`, ni las curvas de easing de `emil-design-eng` — esas son decisiones internas de la skill, no del usuario.
- No omitir ninguna de las tres skills base: siempre se combinan las tres, en el orden de este flujo.
