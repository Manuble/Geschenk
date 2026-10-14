# Geschenk

- Kalender: https://manuble.github.io/Geschenk/
- Testmodus: https://manuble.github.io/Geschenk/#test (vorher im Admin anmelden)
- Admin: https://manuble.github.io/Geschenk/admin.html

Daten liegen in Firebase Firestore (Projekt leas-adventskalender-98666):
- `days/01..24`: title, riddle, lat, lon, code, unlockAt
- `progress/01..24`: foundAt, via

Regeln: siehe `firestore.rules` (in der Firebase-Konsole unter Firestore → Regeln einfügen).
