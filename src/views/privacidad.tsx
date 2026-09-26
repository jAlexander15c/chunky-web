import { useEffect } from "react";

import { getPrivacyNoticeDateLabel, getWhatsAppUrl } from "@/helpers";

/** Cuando cambia el texto, se cambia PRIVACY_NOTICE_VERSION: queda en cada pedido y cotización. */
const UPDATED_AT = getPrivacyNoticeDateLabel();

/**
 * Aviso de privacidad (Ley 81 de 2019 y Decreto Ejecutivo 285 de 2021, Panamá). En palabras
 * simples: quién guarda los datos, cuáles, para qué, con quién se comparten, cuánto tiempo y
 * cómo pedir verlos, corregirlos o borrarlos. Si cambia lo que hace el sistema, cambia aquí.
 */
export const Privacidad = () => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = "Aviso de privacidad · Chunky Bites";
        return () => {
            document.title = previousTitle;
        };
    }, []);

    return (
        <main className="section privacy">
            <div className="privacy__inner">
                <h1 className="section__title">
                    Aviso de <span className="script section__script">privacidad</span>
                </h1>
                <p className="section__lede">
                    Qué datos guardamos cuando pides o cotizas en esta web, para qué los usamos y cómo puedes verlos,
                    corregirlos o borrarlos. Actualizado el {UPDATED_AT}.
                </p>

                <section className="privacy__block">
                    <h2>Quién los guarda</h2>
                    <p>
                        Chunky Bites Bakery, en Aguadulce, Coclé, Panamá. Para cualquier pregunta o solicitud sobre tus datos,
                        escríbenos por{" "}
                        <a href={getWhatsAppUrl("Hola, tengo una consulta sobre mis datos personales.")} target="_blank" rel="noreferrer">
                            WhatsApp al +507 6326-6648
                        </a>
                        .
                    </p>
                </section>

                <section className="privacy__block">
                    <h2>Qué datos guardamos</h2>
                    <ul>
                        <li>
                            <b>Cuando pides:</b> tu nombre, el celular de Yappy, tu WhatsApp si es otro número, la nota del pedido
                            y, si es delivery, la dirección, las referencias y la ubicación si la compartes.
                        </li>
                        <li>
                            <b>Tu historial de compras:</b> qué pediste, cuándo y cuánto pagaste en la web. Si ya estás registrado,
                            en el local también podemos anotar tus compras a tu nombre.
                        </li>
                        <li>
                            <b>Cuando cotizas un cake o postre:</b> tu nombre, tu WhatsApp, la fecha que quieres, tu nota y las fotos
                            de referencia que subes.
                        </li>
                    </ul>
                </section>

                <section className="privacy__block">
                    <h2>Para qué los usamos</h2>
                    <ul>
                        <li>Para preparar, cobrar y entregar tu pedido, y para darte el recibo.</li>
                        <li>Para coordinar contigo tu cotización por WhatsApp.</li>
                        <li>Para llevar tu historial de compras y saber qué te gusta.</li>
                    </ul>
                    <p>No vendemos ni alquilamos tus datos.</p>
                </section>

                <section className="privacy__block">
                    <h2>Con quién se comparten</h2>
                    <p>Solo con los servicios que necesitamos para atenderte:</p>
                    <ul>
                        <li><b>Yappy</b> (Banco General), para cobrarte.</li>
                        <li>Nuestro sistema de caja y facturación: el recibo de un pedido web lleva tu nombre y tu celular.</li>
                        <li>Un servicio de alojamiento en la nube, fuera de Panamá, donde se guardan nuestros datos.</li>
                        <li><b>WhatsApp</b>, cuando nos escribes o te escribimos.</li>
                    </ul>
                    <p>
                        Al aceptar este aviso aceptas que tus datos se guarden en esos servicios, aunque estén fuera de Panamá.
                    </p>
                </section>

                <section className="privacy__block">
                    <h2>Cuánto tiempo</h2>
                    <ul>
                        <li>Tu registro de cliente se borra solo si pasan 3 años sin que compres.</li>
                        <li>De un pedido que nunca se pagó, borramos tu nombre, celular y dirección a los 90 días.</li>
                        <li>
                            De un pedido pagado que no quedó en tu registro de cliente, borramos tu nombre, celular, nota y
                            dirección a los 90 días del pago.
                        </li>
                        <li>
                            De una cotización, borramos las fotos de referencia a los 90 días de la fecha del evento, y tu nombre,
                            WhatsApp y nota al año.
                        </li>
                        <li>El enlace para ver el estado de tu pedido deja de funcionar a los 7 días.</li>
                        <li>Las visitas a la web, que no te identifican, se borran a los 180 días.</li>
                        <li>Los montos de las ventas se guardan el tiempo que exige la ley para la contabilidad.</li>
                    </ul>
                </section>

                <section className="privacy__block">
                    <h2>Tus derechos</h2>
                    <p>
                        Puedes pedirnos ver tus datos, corregirlos, borrarlos, oponerte a que los usemos o recibir una copia.
                        Escríbenos por WhatsApp: es gratis y respondemos en un máximo de 10 días hábiles.
                    </p>
                    <p>
                        Si borramos tu registro, la venta queda en la contabilidad sin tu nombre, celular ni dirección. Un recibo
                        ya emitido no se puede editar. Si no te respondemos a tiempo, puedes acudir a la Autoridad
                        Nacional de Transparencia y Acceso a la Información (ANTAI).
                    </p>
                </section>

                <section className="privacy__block">
                    <h2>Cookies y lo que guarda tu navegador</h2>
                    <p>
                        No usamos cookies ni herramientas de rastreo de otras empresas. Tu navegador guarda, solo en tu
                        aparato, tu carrito, tu nombre y celular mientras compras (la dirección y la nota se borran al cerrar
                        la pestaña) y, por 7 días, la llave de tus últimos pedidos para que puedas volver a verlos.
                    </p>
                    <p>
                        Para mejorar la web contamos visitas y clics con un número al azar que dura lo que la pestaña abierta.
                        Ese número no te identifica y no se junta con tu nombre ni tu celular.
                    </p>
                </section>

                <section className="privacy__block">
                    <h2>Cómo los cuidamos</h2>
                    <p>
                        Solo el personal que atiende tu pedido puede ver tus datos, y usamos medidas de seguridad para
                        protegerlos.
                    </p>
                </section>
            </div>
        </main>
    );
};
