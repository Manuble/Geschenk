// Leas Adventskalender – Kalender-App
import { db, auth, ADMIN_UID, YEAR, pad, unlockAt, fmtDate, norm, qrText, ORDER, dm, haversine,
         ICON_LOCK, ICON_TREE, toast, store, startSnow } from "./common.js";
import { doc, getDoc, setDoc, collection, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = id => document.getElementById(id);
const TEST = location.hash === "#test";

// ---------- Zeit ----------
let tm = TEST ? store.get("lea-testmode", { on: true, date: `${YEAR}-12-05T09:00`, db: false }) : { on: false, db: true };
tm.setAt = tm.setAt || Date.now();
// Simuliertes Datum läuft ab dem Einstellen in Echtzeit weiter
const now = () => tm.on && tm.date ? new Date(new Date(tm.date).getTime() + (Date.now() - tm.setAt)) : new Date();
const START = () => unlockAt(1);

// ---------- Fortschritt ----------
let dbProgress = {};                                       // "07": ISO-Zeit
let localProgress = TEST ? store.get("lea-testprogress", {}) : {};
const useLocal = () => TEST && !tm.db;
const progress = () => useLocal() ? localProgress : dbProgress;
const foundAt = n => progress()[pad(n)];
const stateOf = n => foundAt(n) ? "found" : (now() >= unlockAt(n) ? "open" : "locked");

onSnapshot(collection(db, "progress"), snap => {
  dbProgress = {};
  snap.forEach(d => {
    const t = d.data({ serverTimestamps: "estimate" }).foundAt;
    dbProgress[d.id] = t ? t.toDate().toISOString() : new Date().toISOString();
  });
  render(); if (cur) updateSolved();
}, err => console.warn("Fortschritt nicht lesbar:", err));

// ---------- Admin-Status (nur für Testmodus relevant) ----------
let isAdmin = false;
const dayCache = {};
onAuthStateChanged(auth, u => {
  isAdmin = !!u && u.uid === ADMIN_UID;
  for (const k in dayCache) delete dayCache[k];
  if (TEST) $("tmAuth").textContent = isAdmin
    ? "Als Admin angemeldet: alle Türchen lassen sich laden."
    : "Nicht als Admin angemeldet: Türchen in der Zukunft lassen sich nicht laden. Melde dich zuerst im Admin-Bereich an.";
});

async function loadDay(n) {
  try {
    const s = await getDoc(doc(db, "days", pad(n)));
    dayCache[n] = s.exists() ? s.data() : null;
  } catch (e) {
    console.warn(e);
    if (!(n in dayCache)) dayCache[n] = undefined;
  }
  return dayCache[n];
}

// ---------- Darstellung ----------
function statusLine() {
  const before = now() < START();
  const found = Object.keys(progress()).length;
  const open = ORDER.filter(n => now() >= unlockAt(n)).length;
  $("status").innerHTML = `<span>${tm.on ? '<span class="test-flag">Testdatum:</span> ' : ''}<b>${fmtDate(now())}</b></span>`
    + (before ? "" : `<span>Gefunden <b>${found}</b> von <b>${open}</b> offenen</span>`);
}
function countdown() {
  let s = Math.max(0, Math.floor((START() - now()) / 1000));
  const d = Math.floor(s / 86400); s %= 86400; const h = Math.floor(s / 3600); s %= 3600; const m = Math.floor(s / 60); s %= 60;
  $("cdD").textContent = d; $("cdH").textContent = h; $("cdM").textContent = m; $("cdS").textContent = s;
}
function render() {
  const before = now() < START();
  statusLine();
  $("countdown").hidden = !before; $("grid").hidden = before;
  const allFound = ORDER.every(n => foundAt(n));
  $("finale").hidden = before || !allFound;
  if (allFound) $("finale").innerHTML = `${ICON_TREE}<p>Gut gemacht, alle Geschenke gefunden!</p>`;
  if (before) { countdown(); return; }
  $("grid").innerHTML = ORDER.map(n => {
    const s = stateOf(n);
    const lbl = s === "found" ? "gefunden" : s === "open" ? "offen" : "verschlossen";
    return `<button class="door ${s}" data-d="${n}" aria-label="Türchen ${n}, ${lbl}" ${s === "locked" ? 'aria-disabled="true"' : ''}>
      ${s === "found" ? ICON_TREE : ""}<span class="n">${n}</span>${s === "locked" ? ICON_LOCK : ""}</button>`;
  }).join("");
  if (TEST) { $("tmOn").checked = tm.on; $("tmDate").value = tm.date || ""; $("tmDb").checked = !!tm.db; }
}

// ---------- Tagesansicht ----------
let cur = null, curN = 0;
async function openDay(n) {
  if (stateOf(n) === "locked") { toast(`Türchen ${n} öffnet am ${n}. Dezember um 0 Uhr.`, true); return; }
  curN = n; cur = null;
  $("dEyebrow").textContent = `Türchen ${n} · ${n}. Dezember`;
  $("dTitle").textContent = "Wird geladen …";
  $("dBody").hidden = true; $("dMsg").hidden = true;
  $("sheet").hidden = false;
  const d = await loadDay(n);
  if (curN !== n || $("sheet").hidden) return;
  if (!d) {
    $("dTitle").textContent = `Türchen ${n}`;
    $("dMsg").textContent = d === null
      ? "Dieses Türchen wird gerade noch vorbereitet. Schau später nochmal vorbei."
      : (TEST && !isAdmin ? "Im Testmodus bitte zuerst im Admin-Bereich anmelden."
                          : "Das Türchen konnte nicht geladen werden. Prüfe die Internetverbindung und versuch es nochmal.");
    $("dMsg").hidden = false; return;
  }
  cur = { day: n, ...d };
  $("dTitle").textContent = cur.title;
  $("dRiddle").textContent = cur.riddle;
  $("dCoords").innerHTML = `<span class="lbl">Koordinaten des Verstecks</span>
    <span class="geo"><span>${dm(cur.lat, "N", "S", 2)}</span><span>${dm(cur.lon, "E", "W", 3)}</span></span>
    <span class="dec">${cur.lat.toFixed(6)}, ${cur.lon.toFixed(6)}</span>`;
  const ll = `${cur.lat},${cur.lon}`;
  $("dNav").innerHTML = `
    <a class="btn primary" target="_blank" rel="noopener" href="https://maps.apple.com/?daddr=${ll}&dirflg=w">Apple Karten</a>
    <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=walking">Google Maps</a>`;
  $("dDist").textContent = "Standort wird ermittelt …";
  $("qrOut").hidden = true; $("qrOut").innerHTML = ""; $("codeIn").value = "";
  $("testQr").hidden = !TEST;
  $("dBody").hidden = false;
  updateSolved();
  showMap();
  startWatch();
}
function updateSolved() {
  if (!cur) return;
  const t = foundAt(cur.day);
  $("solveArea").hidden = !!t; $("foundBox").hidden = !t;
  if (t) $("foundBox").innerHTML = `${ICON_TREE}<span>Gefunden am ${fmtDate(new Date(t))}</span>`;
}
function closeSheet() { stopScan(); stopWatch(); $("sheet").hidden = true; cur = null; curN = 0; }

// ---------- Karte & GPS ----------
let map = null, pin = null, me = null, watchId = null, fitted = false;
function showMap() {
  if (!window.L) { $("map").hidden = true; return; }
  if (!map) {
    map = L.map("map", { attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  }
  const icon = L.divIcon({ className: "", html: '<div class="pin"></div>', iconSize: [26, 26], iconAnchor: [3, 30] });
  if (pin) pin.remove(); if (me) { me.remove(); me = null; }
  pin = L.marker([cur.lat, cur.lon], { icon }).addTo(map);
  map.setView([cur.lat, cur.lon], 16);
  fitted = false;
  setTimeout(() => map.invalidateSize(), 60);
}
function startWatch() {
  stopWatch();
  if (!navigator.geolocation) { $("dDist").textContent = "Standort nicht verfügbar. Nutze die Navigation unten."; return; }
  watchId = navigator.geolocation.watchPosition(p => {
    if (!cur) return;
    const { latitude: la, longitude: lo, accuracy } = p.coords;
    const m = haversine(la, lo, cur.lat, cur.lon);
    $("dDist").textContent = `Entfernung: ${m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(1) + " km"} · GPS-Genauigkeit ±${Math.round(accuracy)} m`;
    if (map && window.L) {
      const icon = L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
      if (!me) me = L.marker([la, lo], { icon, interactive: false }).addTo(map); else me.setLatLng([la, lo]);
      if (!fitted && m < 20000) { map.fitBounds([[la, lo], [cur.lat, cur.lon]], { padding: [30, 30], maxZoom: 17 }); fitted = true; }
    }
  }, () => { $("dDist").textContent = "Standort nicht freigegeben. Nutze die Navigation unten."; },
  { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
function stopWatch() { if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; } }

// ---------- Code prüfen ----------
function tryCode(input, via) {
  if (!cur) return;
  const v = norm(input);
  if (v !== norm(cur.code) && v !== norm(qrText(cur.day, cur.code))) {
    toast(via === "qr" ? "Dieser QR-Code gehört nicht zu diesem Türchen." : "Der Code stimmt nicht. Nochmal prüfen.", true);
    return;
  }
  stopScan();
  const n = cur.day;
  if (useLocal()) {
    localProgress[pad(n)] = now().toISOString();
    store.set("lea-testprogress", localProgress);
  } else {
    // Wird bei schlechtem Netz zwischengespeichert und automatisch nachgeschickt
    setDoc(doc(db, "progress", pad(n)), { foundAt: serverTimestamp(), via })
      .catch(e => { console.warn(e); toast("Speichern hat nicht geklappt. Bitte nochmal versuchen.", true); });
    dbProgress[pad(n)] = dbProgress[pad(n)] || new Date().toISOString();
  }
  updateSolved(); render();
  toast(`Türchen ${n} geschafft!`);
}

// ---------- QR-Scan ----------
let stream = null, raf = 0;
const cv = document.createElement("canvas"), cx = cv.getContext("2d", { willReadFrequently: true });
async function startScan() {
  if (!navigator.mediaDevices?.getUserMedia) { toast("Live-Kamera nicht verfügbar. Nutze „QR aus Foto“.", true); return; }
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); }
  catch (e) { toast("Kein Kamerazugriff. Erlaube die Kamera oder nutze „QR aus Foto“.", true); return; }
  const v = $("video"); v.srcObject = stream; v.hidden = false; $("scanStop").hidden = false;
  try { await v.play(); } catch (e) {}
  const tick = () => {
    if (!stream) return;
    if (v.readyState === v.HAVE_ENOUGH_DATA) {
      const s = Math.min(1, 800 / Math.max(v.videoWidth, v.videoHeight));
      cv.width = Math.round(v.videoWidth * s); cv.height = Math.round(v.videoHeight * s);
      cx.drawImage(v, 0, 0, cv.width, cv.height);
      const r = window.jsQR && jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
      if (r) { stopScan(); tryCode(r.data, "qr"); return; }
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
}
function stopScan() {
  cancelAnimationFrame(raf);
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  $("video").hidden = true; $("scanStop").hidden = true;
}
$("qrFile").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 1200 / Math.max(img.width, img.height));
    cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    const r = window.jsQR && jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
    URL.revokeObjectURL(img.src); e.target.value = "";
    r ? tryCode(r.data, "qr") : toast("Kein QR-Code im Foto erkannt. Näher ran und scharf stellen.", true);
  };
  img.src = URL.createObjectURL(f);
});

// ---------- Ereignisse ----------
$("grid").addEventListener("click", e => { const b = e.target.closest(".door"); if (b) openDay(+b.dataset.d); });
$("close").onclick = closeSheet;
$("sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("sheet").hidden) closeSheet(); });
$("codeForm").addEventListener("submit", e => { e.preventDefault(); tryCode($("codeIn").value, "code"); });
$("scanLive").onclick = startScan; $("scanStop").onclick = stopScan;
$("showQr").onclick = () => {
  const o = $("qrOut"); o.innerHTML = ""; o.hidden = false;
  if (window.QRCode) new QRCode(o, { text: qrText(cur.day, cur.code), width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
  const p = document.createElement("div"); p.style.marginTop = "6px"; p.textContent = `Zahlencode: ${cur.code}`; o.appendChild(p);
};

// ---------- Testmodus ----------
if (TEST) {
  $("testPanel").hidden = false;
  const toLocalInput = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  const saveTm = () => { tm.setAt = Date.now(); store.set("lea-testmode", tm); render(); };
  const shiftDay = k => { const d = now(); d.setDate(d.getDate() + k); tm.date = toLocalInput(d); tm.on = true; saveTm(); };
  $("tmOn").onchange = e => { tm.on = e.target.checked; if (tm.on && !tm.date) tm.date = toLocalInput(new Date()); saveTm(); };
  $("tmDate").onchange = e => { tm.date = e.target.value; tm.on = true; saveTm(); };
  $("tmDec1").onclick = () => { tm.date = `${YEAR}-12-01T00:00`; tm.on = true; saveTm(); };
  $("tmPrev").onclick = () => shiftDay(-1); $("tmNext").onclick = () => shiftDay(1);
  $("tmDb").onchange = e => { tm.db = e.target.checked; saveTm(); };
  $("tmAll").onclick = () => {
    if (!useLocal()) { toast("Geht nur, wenn Funde lokal gespeichert werden.", true); return; }
    ORDER.forEach(n => { if (!localProgress[pad(n)]) localProgress[pad(n)] = new Date(YEAR, 11, n, 15, 0).toISOString(); });
    store.set("lea-testprogress", localProgress); render(); toast("Alle 24 Türchen als gefunden markiert.");
  };
  $("tmReset").onclick = () => { $("resetConfirm").hidden = false; };
  $("resetNo").onclick = () => { $("resetConfirm").hidden = true; };
  $("resetYes").onclick = () => { localProgress = {}; store.set("lea-testprogress", localProgress); $("resetConfirm").hidden = true; render(); toast("Test-Fortschritt gelöscht."); };
}

// ---------- Start ----------
render();
let lastKey = "";
setInterval(() => {
  const key = (now() < START()) + ":" + ORDER.filter(n => now() >= unlockAt(n)).length;
  if (key !== lastKey) { lastKey = key; render(); } else { statusLine(); if (now() < START()) countdown(); }
}, 1000);
startSnow();
