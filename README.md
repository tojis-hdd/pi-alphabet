# π Alphabet

Verwandelt eine Million Nachkommastellen von π in Buchstaben und sucht darin nach Wörtern oder Zahlen.

## Features

- Suche nach Wörtern (Umlaute werden zu AE, OE, UE) oder Ziffernfolgen
- Regler für den Suchbereich von 100 bis 1.000.000 Nachkommastellen
- Drei Alphabete
  - **Basis 26**: π direkt im 26er-System, A = 0 … Z = 25
  - **Paare 01–26**: Zweiergruppen 01–26 werden zu A–Z, der Rest bleibt Lücke
  - **Ziffern A–J**: jede Ziffer wird zu einem Buchstaben, 0 = A … 9 = J
- Band mit allen Treffern, Verteilungskarte über den ganzen Bereich, Galaxie der ersten 5.000 Zeichen und Buchstabenverteilung
- Teilbare Links, der Zustand steht im URL-Hash (`#q=JAZZ&n=1000000&m=b26`)
- Pfeiltasten springen zwischen Treffern, `/` fokussiert die Suche

## Lokal starten

Die Seite ist komplett statisch, braucht aber einen Webserver wegen `fetch`:

```bash
npx http-server . -p 5173
```

## Daten neu erzeugen

`data/pi-10.txt` und `data/pi-26.txt` werden mit dem Chudnovsky-Algorithmus erzeugt:

```bash
node scripts/generate.mjs 1000000
```

Kontrolle: Die letzten zehn der ersten Million Stellen sind `5779458151`, der Feynman-Punkt `999999` beginnt an Stelle 762.
