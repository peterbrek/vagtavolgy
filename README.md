# Vágtavölgy

3D lovas játék iPhone-ra (és iPadre). Saját lovad van, akivel szabadon lovagolhatsz egy völgyben: réten, erdőben, a tó partján és a hegyek lábánál. Útközben akadályokat ugratsz, aranypatkókat gyűjtesz, otthon pedig gondozod és felszereled a lovat.

Az app egyetlen statikus weboldal. Nincs szükség szerverre, fiókra vagy telepítésre. A kezdőképernyőre téve az első betöltés után internet nélkül is működik.

## Mi van benne

- **Szabad lovaglás** egy kb. 700 × 700 méteres völgyben. Van benne ösvény, erdő, tó és hegyek.
- **Négy járásmód:** lépés, ügetés, vágta és galopp, mindegyik saját lábmozgással. A lovas ügetésben könnyít, galoppban előrehajol.
- **Ugratás:** 8 akadályos díjugrató pálya időméréssel és hibapontokkal, plusz farönkök, sövények, kőfalak és korlátok az ösvény mentén.
- **Gondozás az istállónál:** széna, víz, zab, alma, répa, csutakolás (ujjal kell húzni a lovon), patakaparás, simogatás.
- **Felszerelés:** nyereg, kantár, nyeregalátét, fásli és takaró, többféle színben.
- **Kinézet:** a ló neve és szőrszíne (pej, sárga, fekete, szürke, palomino, tarka), hóka, fehér zokni, valamint a lovas kabátja, sisakja és haja.
- **25 aranypatkó** van elrejtve a völgyben. Darabja 5 érmét ér, az érmékből zabot és csemegét lehet venni.

## Irányítás

| Mit | Hogyan |
| --- | --- |
| Irány és tempó | Bal oldalon húzd az ujjad arra, amerre menni szeretnél. Kicsit húzva lépés, félig ügetés, teljesen vágta. |
| Galopp | Tartsd nyomva a kék **Galopp** gombot. Fárasztó, az energia lépésben vagy állva töltődik vissza. |
| Ugrás | Ügetésben vagy vágtában nyomd meg a narancs **Ugrás** gombot az akadály előtt. Ha korán nyomod, a ló kivárja a jó elugrási pontot. |
| Körbenézés | Jobb oldalon húzd az ujjad. |
| Istálló | Az istálló közelében megjelenik az **Istálló** gomb, de a menüből bárhonnan haza lehet menni. |
| Itatás | Sétálj be a tóba, és nyomd meg az **Itatás** gombot. |

## Díjugratás

Az aréna zöld **START** kapuján átlovagolva indul az idő. Az akadályokat sorban, 1-től 8-ig kell átugrani (a narancs nyíl mutatja a következőt), utána a piros **CÉL** kapun kell átmenni. A leverés és a megtorpanás 4-4 hibapontot ér, a harmadik megtorpanás kiesést jelent. A legjobb eredményt a játék megjegyzi.

## Cím

**https://peterbrek.github.io/vagtavolgy/**

A játék a `main` ágból, a repó gyökeréből fut GitHub Pagesen. Ha a fájlok változnak, 1–2 perc múlva él az új változat.

## iPhone-ra telepítés

1. Nyisd meg a címet **Safariban**.
2. Koppints a **Megosztás** gombra, majd a **Főképernyőhöz adás** lehetőségre.
3. Az app saját ikonnal, teljes képernyőn indul. Fektetve a legnagyobb a látótér, de állva is játszható.

Hang csak akkor szól, ha a telefon nincs némítva (a némító kapcsoló a weboldalak hangját is elnémítja).

## Grafika és sebesség

A menüben (☰ gomb) a **Grafika** beállítás háromállású: *Gyors*, *Normál* és *Szép*. Telefonon a *Normál* az alapértelmezett. Ha a játék akadozik, magától csökkenti a felbontást, szükség esetén *Gyors* módra vált. iPhone 11-től felfelé a *Normál* mód folyamatosan fut.

## Mentés

- A ló, a felszerelés, az állapotjelzők, az érmék, a megtalált aranypatkók és a legjobb köridő automatikusan mentődik a telefonra.
- A mentés ahhoz a helyhez tartozik, ahol a játék fut: **a Safari és a kezdőképernyős ikon külön tárol**, ezért mindig az ikonról induljatok.
- Az **Új ló** gomb a címlapon új játékot kezd, a régi mentés helyére.

## Frissítés

Új változatnál a `sw.js` elején a verzió átíródik (`vagtavolgy-v1` → `vagtavolgy-v2`), így a telefon biztosan az újat tölti le. Ehhez egyszer internettel kell megnyitni az appot, bezárni teljesen (az alkalmazásváltóban felhúzva), majd újraindítani.

## Fájlok

| Fájl | Mire való |
| --- | --- |
| `index.html` | Maga a játék (minden kód, a 3D-motor is, egyben) |
| `manifest.webmanifest` | Név, ikon és teljes képernyős indítás |
| `sw.js` | Offline működés |
| `icon-180.png`, `icon-192.png`, `icon-512.png` | App ikonok |
| `README.md` | Ez a leírás |
| `LICENSE-three.txt` | A Three.js 3D-motor licence (MIT) |

A `forraskod` mappában a játék forráskódja van modulokra bontva (`src/`). Az `index.html` ebből készül: `cd forraskod && npm install && node build.mjs --pwa`, az eredmény a `dist/pwa/index.html`, ami a repó gyökerébe kerül. Módosításnál Claude közvetlenül ezt a repót frissíti.
