// Gemeinsame Basis für Kalender (index.html) und Admin (admin.html)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCFG4krRytsCP3IlWEUEMARSmbHNL1jxUM",
  authDomain: "leas-adventskalender-98666.firebaseapp.com",
  projectId: "leas-adventskalender-98666",
  storageBucket: "leas-adventskalender-98666.firebasestorage.app",
  messagingSenderId: "56359920874",
  appId: "1:56359920874:web:77ded606b92abcd943e393"
};

export const app = initializeApp(firebaseConfig);
// Offline-Cache: Funde werden auch bei schlechtem Netz gespeichert und später übertragen
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
export const auth = getAuth(app);

export const ADMIN_UID = "3wTztpmhJtgYYNvp0mvcr13ipX82";
export const YEAR = 2026;

export const pad = n => String(n).padStart(2, "0");
export const unlockAt = d => new Date(YEAR, 11, d, 0, 0, 0);          // 0 Uhr Ortszeit
export const fmtDate = dt => dt.toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const norm = s => String(s || "").trim().toUpperCase().replace(/\s+/g, "");
export const qrText = (day, code) => `ADVENT:${pad(day)}:${code}`;
// Klassische Adventskalender-Anordnung
export const ORDER = [7,15,1,22,10,3,18,12,24,5,20,9,14,2,17,23,6,11,19,4,13,21,8,16];

export function dm(v, pos, neg, degW) {
  const h = v >= 0 ? pos : neg; v = Math.abs(v);
  let d = Math.floor(v); let m = (v - d) * 60;
  if (m >= 59.9995) { d += 1; m = 0; }
  return `${h} ${String(d).padStart(degW, "0")}° ${m.toFixed(3).padStart(6, "0")}'`;
}
export function haversine(a, b, c, d) {
  const R = 6371e3, r = x => x * Math.PI / 180, dLa = r(c - a), dLo = r(d - b);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const ICON_LOCK = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/>
  <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="15.5" r="1.6" fill="#7d141c"/></svg>`;
export const ICON_TREE = `<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1.5l1.2 2.5 2.7.3-2 1.8.6 2.7L12 7.4 9.5 8.8l.6-2.7-2-1.8 2.7-.3z" fill="#f0c45e"/>
  <path d="M12 7l5 6h-2.5l4 5h-2.5l4.5 5.5H3.5L8 18H5.5l4-5H7z" fill="#0f3d26" stroke="#f6f1e4" stroke-width=".8"/>
  <rect x="10.3" y="23.5" width="3.4" height="3.5" fill="#6b3d1e"/><circle cx="10" cy="15" r="1.1" fill="#b3262f"/><circle cx="14.5" cy="19.5" r="1.1" fill="#f0c45e"/><circle cx="9" cy="21" r="1.1" fill="#ff8a7a"/></svg>`;

let tt = 0;
export function toast(msg, bad) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
  clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 3500);
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

export function startSnow() {
  const c = document.getElementById("snow"); if (!c) return;
  const g = c.getContext("2d"); let W, H; const flakes = [];
  const fit = () => { W = c.width = innerWidth; H = c.height = innerHeight; };
  fit(); addEventListener("resize", fit);
  for (let i = 0; i < 70; i++) flakes.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 2.2 + .6, s: Math.random() * .6 + .3, w: Math.random() * Math.PI * 2 });
  const draw = () => { g.clearRect(0, 0, W, H); g.fillStyle = "rgba(255,255,255,.8)";
    for (const f of flakes) { g.beginPath(); g.arc(f.x, f.y, f.r, 0, 7); g.fill(); } };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { draw(); return; }
  const step = () => { for (const f of flakes) { f.y += f.s; f.w += .01; f.x += Math.sin(f.w) * .3;
    if (f.y > H + 4) { f.y = -4; f.x = Math.random() * W; } } draw(); requestAnimationFrame(step); };
  step();
}

// Koordinaten aus Google Maps ("52.516275, 13.377704"), Google-Maps-Link (@52.5,13.3)
// oder Geocaching-Format ("N 52° 30.977 E 013° 22.662") lesen
export function parseCoords(s) {
  s = String(s || "").trim(); if (!s) return null;
  const g = s.match(/([NS])\s*(\d{1,2})\s*°?\s*(\d{1,2}(?:[.,]\d+)?)\s*'?\s*[,;]?\s*([EWO])\s*(\d{1,3})\s*°?\s*(\d{1,2}(?:[.,]\d+)?)/i);
  if (g) {
    const n = x => parseFloat(x.replace(",", "."));
    let lat = +g[2] + n(g[3]) / 60, lon = +g[5] + n(g[6]) / 60;
    if (/s/i.test(g[1])) lat = -lat; if (/w/i.test(g[4])) lon = -lon;
    return valid(lat, lon);
  }
  const d = s.match(/(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/);
  if (d) return valid(parseFloat(d[1]), parseFloat(d[2]));
  return null;
}
const valid = (lat, lon) => (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) ? { lat: +lat.toFixed(6), lon: +lon.toFixed(6) } : null;
