# π Alphabet

Durchsucht eine Milliarde Nachkommastellen von π nach Wörtern, Namen und Zahlen.

**Live:** https://tojis-hdd.github.io/pi-alphabet/

## Features

- Suche nach Wörtern (Umlaute werden zu AE, OE, UE) oder Ziffernfolgen
- Regler für den Suchbereich von 100 bis 1.000.000.000 Nachkommastellen
- Drei Alphabete
  - **Basis 26**: π direkt im 26er-System, A = 0 … Z = 25 (bis 100 Mio. Stellen)
  - **Paare 01–26**: Zweiergruppen 01–26 werden zu A–Z, der Rest bleibt Lücke
  - **Ziffern A–J**: jede Ziffer wird zu einem Buchstaben, 0 = A … 9 = J
- Streaming-Suche in einem Web Worker: Datenblöcke werden nur bei Bedarf geladen und im Browser-Cache gehalten
- Band mit allen Treffern, Verteilungskarte über den ganzen Bereich, Galaxie der ersten 5.000 Zeichen und Buchstabenverteilung
- Teilbare Links, der Zustand steht im URL-Hash (`#q=JAZZ&n=1000000000&m=pairs`)
- Pfeiltasten springen zwischen Treffern, `/` fokussiert die Suche

## Daten

| Datei | Inhalt | Format |
| --- | --- | --- |
| `data/10/*.bin` | 1.000.000.000 Dezimalstellen | 6 Mio. Stellen pro Block, je 3 Ziffern in 10 Bit |
| `data/26/*.bin` | 70.669.000 Basis-26-Stellen | 4 Mio. Buchstaben pro Block, je 5 Bit |
| `data/meta.json` | Längen und Blockgrößen | |

So werden sie erzeugt:

```bash
y-cruncher custom pi -dec:1b -hex:0 -o build/yc -C:0 -verify:1 -mode:ram
node scripts/generate.mjs 100000000
node scripts/pack.mjs --dec "build/yc/Pi - Dec - Chudnovsky.txt" --b26 build/pi-26.txt
```

`generate.mjs` rechnet π selbst per Chudnovsky (für Basis 26 und als Gegenprobe zu y-cruncher), `pack.mjs` packt beides in Blöcke.

## Lokal starten

```bash
npx http-server . -p 5173
```

## Design

Look angelehnt an den 0x701 Client: Glass-Panels mit Accent-Outline, Höhenlinien-Shader und Halftone-Dots im Hintergrund.
