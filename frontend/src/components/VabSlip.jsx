import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";

// Printable voter assistance booth slip. The QR code holds only an opaque slip reference
// (ECIWEB-SLIP:...), which a polling officer of the same station can look up; it carries no EPIC
// number or other personal data. The slip clears itself after a minute so a shared kiosk screen
// does not keep showing the last elector.
export default function VabSlip({ slip, onClose }) {
    const { t } = useTranslation();
    const [svg, setSvg] = useState("");
    useEffect(() => {
        QRCode.toString(slip.qr, { type: "svg", margin: 1, width: 140, errorCorrectionLevel: "M" }).then(setSvg).catch(() => setSvg(""));
        const t = setTimeout(onClose, 60000);
        return () => clearTimeout(t);
    }, [slip, onClose]);
    return (
        <div className="panel vab-slip" role="region" aria-label={t("voterExtra.slip.label")} style={{ marginTop: 12, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div aria-hidden="true" style={{ width: 140, height: 140, background: "#fff" }} dangerouslySetInnerHTML={{ __html: svg }} />
            <div style={{ flex: 1, minWidth: 220 }}>
                <p style={{ margin: 0 }}><small className="muted">{slip.election} · {t("voterExtra.slip.pollOn", { date: slip.pollDate })}</small></p>
                <h3 style={{ margin: "4px 0" }}>{slip.name}</h3>
                <p style={{ margin: 0 }}>{t("voterExtra.slip.serial")} <strong className="figure">{slip.serial}</strong> · {t("voterExtra.slip.part")} {slip.partNumber}</p>
                <p style={{ margin: 0 }}>{slip.pollingStation}{slip.address ? `, ${slip.address}` : ""}</p>
                <p className="muted" style={{ margin: "6px 0 0" }}><small>{t("voterExtra.slip.ref", { id: slip.slipId })}</small></p>
                <p className="no-print" style={{ marginTop: 8 }}>
                    <button className="btn btn-primary" onClick={() => window.print()}>{t("voterExtra.slip.print")}</button>{" "}
                    <button className="btn btn-quiet" onClick={onClose}>{t("voterExtra.slip.clear")}</button>
                </p>
            </div>
        </div>
    );
}
