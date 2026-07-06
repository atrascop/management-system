export function mapShexpressStatus(status) {
  const value = String(status || "")
    .toLowerCase()
    .trim();

  if (value === "livré") return "delivered";

  if (
    value.includes("refus") ||
    value.includes("retour") ||
    value.includes("annulé") ||
    value.includes("annuler") ||
    value.includes("pas de réponse") ||
    value.includes("pas de reponse") ||
    value.includes("injoignable") ||
    value.includes("changement adresse")
  ) {
    return "returned";
  }

  if (
    value.includes("ramassé") ||
    value.includes("ramasse") ||
    value.includes("expédié") ||
    value.includes("expedie") ||
    value.includes("distribution") ||
    value.includes("ajouté") ||
    value.includes("ajoute") ||
    value.includes("relancé") ||
    value.includes("relance") ||
    value.includes("reporté") ||
    value.includes("reporte") ||
    value.includes("interessé") ||
    value.includes("interesse") ||
    value.includes("confirmer")
  ) {
    return "shipped";
  }

  return "pending";
}
