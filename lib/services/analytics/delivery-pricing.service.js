const DEFAULT_WAREHOUSE_CITY = "Casablanca";

const DELIVERY_PRICES_FROM_CASABLANCA = {
  // Casablanca zone
  casablanca: 20,
  "lahraouiyine de casablanca": 25,
  "sbet-titmllil": 25,
  "sidi hejjaj de sbeet": 25,

  oulfa: 30,
  errahma: 30,
  bouskoura: 30,
  lissasfa: 30,
  mediouna: 30,
  tamaris: 30,
  "dar bouazza": 30,
  nouaceur: 30,
  "had soualem": 30,
  "ain harrouda": 30,
  "sidi rahhal region casa": 30,
  "oulad saleh region bouskoura": 30,
  deroua: 30,
  "chelalat mohammedia": 30,
  mansouria: 30,

  // Big cities
  mohammedia: 35,
  berrechid: 30,

  marrakech: 35,
  rabat: 35,
  agadir: 35,
  fes: 35,
  "el jadida": 35,
  benslimane: 35,
  settat: 35,
  kenitra: 35,
  tanger: 35,
  bouznika: 35,
  "ain el aouda": 35,
  skhirate: 40,
  sale: 40,
  temara: 40,

  // 40 DH cities
  oujda: 40,
  safi: 40,
  essaouira: 40,
  meknes: 40,
  "ait melloul": 40,
  "ait ourir": 40,
  inezgane: 40,
  "beni mellal": 40,
  martil: 40,
  nador: 40,
  ouarzazate: 40,
  fnidq: 40,
  mdiq: 40,
  "el berrouj": 40,
  "sidi bennour": 40,
  "ben ahmed": 40,
  "kelaa des sraghna": 40,
  kafimour: 40,
  taforhalt: 40,
  houcima: 40,

  // 45 DH default far cities
  taza: 45,
  "ben guerir": 45,
  "had harara": 45,
  "oulad frej": 45,
  "zaouiya de doukala": 45,
  oualidia: 45,
  "khemis des zemamra": 45,
  mehdya: 45,
  "bir jedid": 45,
  "ras laain": 45,
  arfoud: 45,
  driouech: 45,
  guelmim: 45,
  chichaoua: 45,
  taourirt: 45,
  rissani: 45,
  khenifra: 45,
  midelt: 45,
  "sidi ifni": 45,
  berkane: 45,
  ifrane: 45,
  "sidi kacem": 45,
  taroudannt: 45,
  errachidia: 45,
  chefchaouen: 45,
  tetouan: 45,
  khouribga: 45,
  tiznit: 45,
  zagora: 45,
  dakhla: 45,
  laayoune: 45,
  boujdour: 45,
  assilah: 45,
  khemisset: 45,
  tinghir: 45,
  merzouga: 45,
  figuig: 45,
  "ksar el kebir": 45,
  "fquih ben salah": 45,
  "sidi slimane": 45,
};

function normalizeCity(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getDeliveryCost(city, warehouseCity = DEFAULT_WAREHOUSE_CITY) {
  const normalizedCity = normalizeCity(city);

  if (!normalizedCity) return 45;

  if (normalizeCity(warehouseCity) !== "casablanca") {
    return 45;
  }

  return DELIVERY_PRICES_FROM_CASABLANCA[normalizedCity] ?? 45;
}
