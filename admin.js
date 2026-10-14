// Leas Adventskalender – Admin-Bereich
import { db, auth, ADMIN_UID, YEAR, pad, unlockAt, fmtDate, qrText, dm, toast, parseCoords } from "./common.js";
import { collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = id => document.getElementById(id);
const DAYS = Array.from({ length: 24 }, (_, i) => i + 1);
let days = {}, progress = {}, unsubs = [], editN = 0;

// ---------- Login ----------
onAuthStateChanged(auth, u => {
  unsubs.forEach(f => f()); unsubs = [];
  const ok = !!u && u.uid === ADMIN_UID;
  $("loginView").hidden = !!u;
  $("notAdmin").hidden = !(u && !ok);
  $("mainView").hidden = !ok;
  if (!ok) return;
  unsubs.push(onSnapshot(collection(db, "days"), s => {
    days = {}; s.forEach(d => days[+d.id] = d.data()); renderList();
  }, e => toast("Türchen konnten nicht geladen werden: " + e.code, true)));
  unsubs.push(onSnapshot(collection(db, "progress"), s => {
    progress = {};
    s.forEach(d => { const t = d.data({ serverTimestamps: "estimate" }).foundAt; progress[+d.id] = { at: t ? t.toDate() : new Date(), via: d.data().via }; });
    renderList(); if (editN) renderProgress();
  }));
});
$("loginView").addEventListener("submit", async e => {
  e.preventDefault();
  try { await signInWithEmailAndPassword(auth, $("lEmail").value.trim(), $("lPw").value); $("lPw").value = ""; }
  catch (err) { toast(err.code === "auth/too-many-requests" ? "Zu viele Versuche. Bitte kurz warten." : "E-Mail oder Passwort falsch.", true); }
});
$("logout").onclick = $("logout2").onclick = () => signOut(auth);

// ---------- Übersicht ----------
function renderList() {
  const nDays = DAYS.filter(n => days[n]).length;
  const nFound = DAYS.filter(n => progress[n]).length;
  $("summary").innerHTML = `<span>Angelegt <b>${nDays}</b> von <b>24</b></span><span>Lea hat <b>${nFound}</b> gefunden</span>`;
  $("seedBox").hidden = nDays === 24;
  $("seedText").textContent = `${24 - nDays} Türchen sind noch nicht angelegt. Lea sieht dort „wird noch vorbereitet“. Du kannst sie mit Beispieldaten füllen und danach einzeln bearbeiten. Bestehende Türchen bleiben unverändert.`;
  const now = new Date();
  $("daylist").innerHTML = DAYS.map(n => {
    const d = days[n], p = progress[n];
    let chip;
    if (!d) chip = `<span class="chip missing">nicht angelegt</span>`;
    else if (p) chip = `<span class="chip found">gefunden ${fmtDate(p.at)}</span>`;
    else if (now >= unlockAt(n)) chip = `<span class="chip open">offen</span>`;
    else chip = `<span class="chip">öffnet ${n}.12.</span>`;
    return `<div class="dayrow"><span class="num">${n}</span>
      <span class="info"><b>${d ? esc(d.title) : "—"}</b><span>${chip}${d ? ` · Code ${esc(d.code)}` : ""}</span></span>
      <button class="btn small" data-edit="${n}">Bearbeiten</button></div>`;
  }).join("");
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
$("daylist").addEventListener("click", e => { const b = e.target.closest("[data-edit]"); if (b) openEditor(+b.dataset.edit); });

// ---------- Beispieldaten ----------
const SAMPLES = [
  ["Das Tor der Tore", "Sechs Säulen tragen mich, oben fährt eine Göttin mit vier Pferden.\nSuch am Fuß der dritten Säule von links.", 52.516275, 13.377704],
  ["Zwei Türme am Fluss", "Über 600 Jahre wurde an mir gebaut.\nDas Geschenk liegt beim Eingang mit den Heiligen Drei Königen.", 50.941278, 6.958281],
  ["Der Leuchtturm", "Ich warne Schiffe, aber heute leuchte ich nur für dich.", 54.183333, 7.885],
  ["Unter den Sternen", "Hier zeigt man dir Himmel, die du sonst nur bei Neumond siehst.", 48.137154, 11.576124]
];
const randCode = () => String(1000 + Math.floor(Math.random() * 9000));
$("seedBtn").onclick = async () => {
  const b = writeBatch(db);
  DAYS.filter(n => !days[n]).forEach(n => {
    const s = SAMPLES[(n - 1) % SAMPLES.length];
    b.set(doc(db, "days", pad(n)), { title: `${s[0]} (Beispiel ${n})`, riddle: s[1], lat: s[2], lon: s[3], code: randCode(),
      unlockAt: Timestamp.fromDate(unlockAt(n)), updatedAt: serverTimestamp() });
  });
  $("seedBtn").disabled = true;
  try { await b.commit(); toast("Beispieltürchen angelegt."); }
  catch (e) { toast("Anlegen fehlgeschlagen: " + e.code, true); }
  $("seedBtn").disabled = false;
};

// ---------- Editor ----------
let emap = null, epin = null;
function openEditor(n) {
  editN = n;
  const d = days[n] || { title: "", riddle: "", lat: null, lon: null, code: randCode() };
  $("eEyebrow").textContent = `Türchen ${n} · öffnet ${n}.12.${YEAR}, 0 Uhr`;
  $("eHead").textContent = days[n] ? "Bearbeiten" : "Neu anlegen";
  $("eTitle").value = d.title; $("eRiddle").value = d.riddle; $("eCode").value = d.code;
  $("eCoords").value = d.lat != null ? `${d.lat}, ${d.lon}` : "";
  const live = new Date() >= unlockAt(n);
  $("eLive").hidden = !live;
  $("eLive").textContent = "Dieses Türchen ist schon offen. Lea sieht Änderungen beim nächsten Öffnen sofort.";
  $("eResetConfirm").hidden = true;
  renderProgress();
  $("sheet").hidden = false;
  initMap(); coordsChanged();
}
function renderProgress() {
  const p = progress[editN];
  $("eProgText").textContent = p ? `Gefunden am ${fmtDate(p.at)} (per ${p.via === "qr" ? "QR-Code" : "Zahlencode"}).` : "Noch nicht gefunden.";
  $("eResetRow").hidden = !p;
}
function closeEditor() { $("sheet").hidden = true; editN = 0; }
$("eClose").onclick = $("eCancel").onclick = closeEditor;
$("sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeEditor(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("printArea").hidden) $("printArea").hidden = true; else if (editN) closeEditor(); } });

function initMap() {
  if (!window.L) { $("eMap").hidden = true; return; }
  if (!emap) {
    emap = L.map("eMap");
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(emap);
    emap.on("click", ev => {
      $("eCoords").value = `${ev.latlng.lat.toFixed(6)}, ${ev.latlng.lng.toFixed(6)}`;
      coordsChanged(false);
    });
    emap.setView([51.1657, 10.4515], 6);
  }
  setTimeout(() => emap.invalidateSize(), 60);
}
function coordsChanged(recenter = true) {
  const c = parseCoords($("eCoords").value);
  $("eCoordsOut").textContent = c ? `Erkannt: ${dm(c.lat, "N", "S", 2)}  ${dm(c.lon, "E", "W", 3)}`
    : ($("eCoords").value.trim() ? "Format nicht erkannt. Beispiel: 52.516275, 13.377704" : "Aus Google Maps einfügen oder unten auf die Karte tippen.");
  if (!emap || !window.L) return;
  if (epin) { epin.remove(); epin = null; }
  if (c) {
    epin = L.marker([c.lat, c.lon], { icon: L.divIcon({ className: "", html: '<div class="pin"></div>', iconSize: [26, 26], iconAnchor: [3, 30] }) }).addTo(emap);
    if (recenter) emap.setView([c.lat, c.lon], 16);
  }
}
$("eCoords").addEventListener("input", () => coordsChanged(true));

$("editForm").addEventListener("submit", async e => {
  e.preventDefault();
  const n = editN;
  const title = $("eTitle").value.trim(), riddle = $("eRiddle").value.trim(), code = $("eCode").value.trim();
  const c = parseCoords($("eCoords").value);
  if (!title) return toast("Bitte einen Titel eingeben.", true);
  if (!riddle) return toast("Bitte ein Rätsel eingeben.", true);
  if (!c) return toast("Koordinaten fehlen oder sind nicht lesbar.", true);
  if (!code) return toast("Bitte einen Zahlencode eingeben.", true);
  $("eSave").disabled = true;
  try {
    await setDoc(doc(db, "days", pad(n)), { title, riddle, lat: c.lat, lon: c.lon, code,
      unlockAt: Timestamp.fromDate(unlockAt(n)), updatedAt: serverTimestamp() });
    toast(`Türchen ${n} gespeichert.`); closeEditor();
  } catch (err) { toast("Speichern fehlgeschlagen: " + err.code, true); }
  $("eSave").disabled = false;
});

$("eReset").onclick = () => { $("eResetConfirm").hidden = false; };
$("eResetNo").onclick = () => { $("eResetConfirm").hidden = true; };
$("eResetYes").onclick = async () => {
  try { await deleteDoc(doc(db, "progress", pad(editN))); toast(`Fund für Türchen ${editN} zurückgesetzt.`); }
  catch (err) { toast("Zurücksetzen fehlgeschlagen: " + err.code, true); }
  $("eResetConfirm").hidden = true;
};

// ---------- QR-Druckbogen ----------
$("qrBtn").onclick = () => {
  const box = $("qrSheet"); box.innerHTML = "";
  DAYS.forEach(n => {
    const d = days[n]; if (!d) return;
    const card = document.createElement("div"); card.className = "qrcard";
    const head = document.createElement("b"); head.textContent = `Türchen ${n}`;
    const q = document.createElement("div");
    const foot = document.createElement("span"); foot.textContent = `Code: ${d.code}`;
    card.append(head, q, foot); box.appendChild(card);
    if (window.QRCode) new QRCode(q, { text: qrText(n, d.code), width: 140, height: 140, correctLevel: QRCode.CorrectLevel.M });
  });
  if (!box.children.length) box.innerHTML = '<p class="hint">Noch keine Türchen angelegt.</p>';
  $("printArea").hidden = false;
};
$("printBtn").onclick = () => window.print();
$("printClose").onclick = () => { $("printArea").hidden = true; };
