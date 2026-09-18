---
version: 1
slug: "src-views-home-tsx"
primary_target: "src/views/home.tsx"
related_targets: ["src/views/menu.tsx","src/views/items.tsx","src/components/cart.tsx"]
---

# Surface brief: Chunky Bites web (inicio + menu + productos + pedido)

Scope: `/` (inicio, Persuade), `/menu` y `/items` (Operate), comanda/pedido (Operate). Visitante: cliente local desde el celular con antojo; accion: armar pedido y enviarlo por WhatsApp. Build code-led (sin generacion de imagenes). Propuesta v2 aprobada por el usuario en el artifact "Propuesta Chunky Bites".

Feedback del usuario que fijo la v2: la mascota se perdia sobre azul (va sobre fondo claro con contorno crema); fuera fotos de categorias; nada de "galletas gordas"; mas elegante; toque italiano (focaccias, tostadas, pasta, pesto) y japones (matcha, bebida estrella); nada de imagenes en arco. Le gustaron el tablero del menu y la comanda.

## Direction contract

THESIS: Un menu con pasaporte: Nueva York, Italia y Japon en una sola barra retro. Rechaza la plantilla de reposteria (crema + rosa + tarjetas redondas iguales).

OWN-WORLD: Fondo crema, tablero de clavijas mora con ranuras, comanda de papel perforado, toldo festoneado orquidea. Fotos como estampillas de correo perforadas con el nombre impreso en el margen. Campos planos: azul pastel (Japon), mantequilla (Nueva York), lima (Italia), orquidea (horario, cierre). Montserrat 800 en mayusculas + Guadalimar script solo en palabras sin tilde. Botones en pastilla, paneles 20px.

STORY: Entiende que es (NY + Italia + Japon), ve el matcha estrella y los salados, recorre el tablero, agrega a la comanda, envia por WhatsApp.

FIRST VIEWPORT: Izquierda: "De Nueva York a Kioto," + script "con escala en Italia.", subtexto de 19 palabras, pastilla "Ver el menu" y estado de horario. Derecha: disco azul pastel con anillo punteado, mascota con contorno sticker y tres estampillas (cookie, focaccia, matcha).

FORM: soda fountain + correo/pasaporte, candidato 3 de 7 fusionado con el feedback, seed 34f96f6b. Interaccion firma: filas del tablero que entran por pasos con rebote y total de la comanda que cambia como caja registradora.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
