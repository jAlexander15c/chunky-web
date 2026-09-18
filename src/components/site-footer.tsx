import { Link } from "react-router";
import { PiWhatsappLogoBold } from "react-icons/pi";

import { OPENING_HOURS, getWhatsAppUrl } from "@/helpers";

import logo from "@/assets/logos/Rosa.png";

export const SiteFooter = () => {
    return (
        <footer className="site-footer">
            <div className="site-footer__inner">
                <div className="site-footer__brand">
                    <img src={logo} alt="Chunky Bites Bakery" width={4501} height={1336} loading="lazy" />
                    <p>Nueva York, Italia y Japón en una sola barra.</p>
                </div>

                <div className="site-footer__col">
                    <h2 className="site-footer__title">Horario</h2>
                    <dl className="site-footer__hours">
                        {OPENING_HOURS.map((row) => (
                            <div key={row.days}>
                                <dt>{row.days}</dt>
                                <dd>{row.hours}</dd>
                            </div>
                        ))}
                    </dl>
                </div>

                <div className="site-footer__col">
                    <h2 className="site-footer__title">Hablemos</h2>
                    <a className="site-footer__link" href={getWhatsAppUrl()} target="_blank" rel="noreferrer">
                        <PiWhatsappLogoBold aria-hidden /> Escríbenos por WhatsApp
                    </a>
                    <Link className="site-footer__link" to="/menu">Ver el menú</Link>
                </div>
            </div>
            <p className="site-footer__legal">© {new Date().getFullYear()} Chunky Bites Bakery</p>
        </footer>
    );
};
