# Product

<!-- impeccable:product-schema 1 -->

> Registro escrito a partir del brief del usuario y del codigo existente, sin ronda de entrevista (la skill `design-from-brief` del proyecto limita las preguntas a tres). Los hechos marcados *(inferido)* salen del repositorio, no de una confirmacion explicita.

## Platform

web

## Users

Clientes locales de Chunky Bites Bakery (Panama, telefono +507) que llegan desde el celular (Instagram, QR en tienda, enlace compartido) con antojo de algo dulce o un desayuno, y quieren ver que hay hoy, cuanto cuesta y pedirlo rapido por WhatsApp. *(inferido del flujo carrito -> WhatsApp y del prefijo telefonico)*

## Product Purpose

Menu web y vitrina de marca a la vez: mostrar categorias y productos disponibles en tiempo real, armar un carrito y enviar el pedido por WhatsApp. Ademas debe vender: despertar antojo y convertir visitas en pedidos (pedido explicito del usuario).

## Positioning

Galletas gruesas estilo New York y bakery con personalidad propia: una marca "elegante al extremo, jocosa, retro y juguetona sin perder la elegancia" (palabras del usuario), con mascota cartoon retro.

## Operating Context

- Catalogo servido por API propia (`/categories/get-categories`, `/items/get-items`), sincronizado con el POS; solo se muestran items `available_for_sale`.
- Categorias por color: ORANGE galletas, RED salado, BLUE bebidas, PURPLE desayuno (solo 8-11 h), DEFAULT postres. Imagenes de categoria en R2.
- Horario de pedidos: lunes a viernes 8:00-20:00, sabado 8:00-18:00, domingo cerrado (`isWithinOperatingHours`).
- Pedido final: mensaje prellenado a WhatsApp 50763266648. No hay pago en linea.

## Capabilities and Constraints

- Stack existente: React 19 + Vite + Chakra UI v3 + motion + react-router 7.
- Rutas actuales: `/menu`, `/items?categoryId=...`; la app hoy enruta todo a la vista de mantenimiento.
- Convencion: funciones flecha, camelCase con verbo (ver `.claude/CLAUDE.md`).

## Brand Commitments

- Paleta fijada por el usuario: #3a4b8e (azul mora), #d7e0f9 (azul pastel), #e3e8a7 (verde lima pastel), #e1a8e5 (rosa orquidea), #f8e3af (mantequilla), #fcfae9 (crema).
- Logotipo script "Chunky Bites / BAKERY" en tres versiones: azul (`src/assets/logos/Mora Azul.png`), rosa (`Rosa.png`), rosa + verde (`Original.png`). No se redibuja.
- Mascota: vaso de bebida cartoon estilo anos 30 (`src/assets/logos/icon.png`).
- Tipografias de marca: Guadalimar (display) y Montserrat (`src/assets/fonts`).
- Tono: elegante al extremo, jocoso, retro juguetón.

## Evidence on Hand

- Fotos de categorias (R2) y fotos de producto via `image_url` del API.
- No existen testimonios, resenas, premios, cifras de ventas ni direccion fisica en el repo: no se inventan.

## Product Principles

1. Del antojo al pedido en el menor numero de toques posible.
2. Lo que se muestra esta disponible de verdad (horarios y stock reales).
3. La marca se siente en cada detalle, pero nunca tapa el producto ni el precio.
