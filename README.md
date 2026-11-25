# Vágtavölgy

3D lovas játék iPhone-ra (és iPadre). Saját lovad van, akivel szabadon lovagolhatsz egy völgyben: réten, erdőben, szurdokban, a tó partján, a tanyán és a várromnál. Útközben akadályokat ugratsz, aranypatkókat, virágokat és almát gyűjtesz, vadlovakkal barátkozol, otthon pedig gondozod és felszereled a lovat.

Az app egyetlen statikus weboldal. Nincs szükség szerverre, fiókra vagy telepítésre. A kezdőképernyőre téve az első betöltés után internet nélkül is működik.

## Mi van benne

- **Szabad lovaglás** egy kb. 1000 × 1000 méteres völgyben, körbefutó ösvénnyel. Tájak:
  - **Szurdok** homokkő sziklafalakkal, a falon lezúduló **vízeséssel** és medencével, ahonnan **patak** fut le a tóba (gázlóval).
  - **Tó** kacsákkal, a partján **nyírfás**.
  - **Tanya** házzal, csűrrel, kúttal, **almáskerttel**, **veteményessel** és **birkakarámmal**, mellette **levendulamező** pillangókkal.
  - **Várrom** egy dombtetőn, toronnyal és zászlóval.
  - **Őszi erdő** narancs és vörös lombbal, nagy **fenyves** és **lombos erdő** őzekkel, **sziklás fennsík**.
  - **Vadlovak rétje**, ahol öt vadló, köztük egy csikó legel.
- **Állatok:** vadló-ménes (megijed, ha vágtában rohansz feléjük, de ha lassan közelítesz és megállsz, odajönnek), őzek, nyulak, birkák, kacsák, madárrajok, egy sas a szurdok fölött és pillangók.
- **Négy járásmód:** lépés, ügetés, vágta és galopp, mindegyik saját lábmozgással. A lovas ügetésben könnyít, galoppban előrehajol.
- **Ugratás:** 8 akadályos díjugrató pálya és 10 akadályos **terepugrató pálya**, időméréssel és hibapontokkal. Az ösvény mentén a tájhoz illő akadályok: farönk, sövény, kőfal, korlát, tyúkól, hordók, szalmabála-fal, kapu, sziklafal, az erdőkben kidőlt fák.
- **Gondozás az istállónál:** széna, víz, zab, alma, répa, csutakolás (ujjal kell húzni a lovon), patakaparás, simogatás.
- **Felszerelés:** nyereg, kantár, nyeregalátét, fásli és takaró, többféle színben.
- **Kinézet:** a ló neve és szőrszíne (pej, sárga, fekete, szürke, almásszürke, palomino, tarka), hóka, fehér zokni, valamint a lovas kabátja, sisakja és haja.
- **Grafika:** fényes szőr, szálas sörény és farok, levélkártyás lombos fák és fenyők, felhők, ragyogás és színkorrekció.
- **Gyűjtenivalók:** 40 aranypatkó (darabja 5 érme), 6 féle ritka virág (pipacs, búzavirág, harangvirág, gyöngyvirág, havasi gyopár, tavirózsa, mindből 3), 12 felfedezhető hely (darabja 10 érme), valamint alma az almáskertben és répa a veteményesben. Az alma és a répa újranő, a lovad megeheti, egy almával pedig vadló barátot szerezhetsz.
- **Gyűjtemény** a menüben: patkók, virágok, felfedezések, készlet és vadló barátok.

## Irányítás

| Mit | Hogyan |
| --- | --- |
| Irány és tempó | Bal oldalon húzd az ujjad arra, amerre menni szeretnél. Kicsit húzva lépés, félig ügetés, teljesen vágta. |
| Galopp | Tartsd nyomva a kék **Galopp** gombot. Fárasztó, az energia lépésben vagy állva töltődik vissza. |
| Ugrás | Ügetésben vagy vágtában nyomd meg a narancs **Ugrás** gombot az akadály előtt. Ha korán nyomod, a ló kivárja a jó elugrási pontot. |
| Körbenézés | Jobb oldalon húzd az ujjad. |
| Istálló | Az istálló közelében megjelenik az **Istálló** gomb, de a menüből bárhonnan haza lehet menni. |
| Itatás | Sétálj be a tóba, a patakba vagy a vízesés medencéjébe, és nyomd meg az **Itatás** gombot. |
| Vadló etetése | Ha van almád, és egy vadló mellett állsz, megjelenik az **Almát adok** gomb. |

## Díjugratás és terepugratás

A zöld **START** kapun átlovagolva indul az idő. A díjugrató pálya az arénában van (8 akadály), a terepugrató pálya az istállótól keletre eső réten (10 akadály). Az akadályokat sorban kell átugrani (a narancs nyíl és a térkép mutatja a következőt), utána a piros **CÉL** kapun kell átmenni. A leverés és a megtorpanás 4-4 hibapontot ér, a harmadik megtorpanás kiesést jelent. A legjobb eredményt pályánként megjegyzi a játék. Mindkét pályára a menüből is oda lehet ugrani.

## Cím

**https://peterbrek.github.io/vagtavolgy/**

A játék a `main` ágból, a repó gyökeréből fut GitHub Pagesen. Ha a fájlok változnak, 1–2 perc múlva él az új változat.

## iPhone-ra telepítés

1. Nyisd meg a címet **Safariban**.
2. Koppints a **Megosztás** gombra, majd a **Főképernyőhöz adás** lehetőségre.
3. Az app saját ikonnal, teljes képernyőn indul. Fektetve a legnagyobb a látótér, de állva is játszható.

Hang csak akkor szól, ha a telefon nincs némítva (a némító kapcsoló a weboldalak hangját is elnémítja).

## Grafika és sebesség

A menüben (☰ gomb) a **Grafika** beállítás háromállású: *Gyors*, *Normál* és *Szép*. Telefonon a *Normál* az alapértelmezett. A *Normál* és a *Szép* módban ragyogás, élsimítás és színkorrekció is van, a *Gyors* ezeket kikapcsolja, és kisebb körzetben rajzol füvet. Ha a játék akadozik, magától csökkenti a felbontást, szükség esetén *Gyors* módra vált. iPhone 11-től felfelé a *Normál* mód folyamatosan fut.

## Mentés

- A ló, a felszerelés, az állapotjelzők, az érmék, a megtalált aranypatkók és a legjobb köridő automatikusan mentődik a telefonra.
- A mentés ahhoz a helyhez tartozik, ahol a játék fut: **a Safari és a kezdőképernyős ikon külön tárol**, ezért mindig az ikonról induljatok.
- Az **Új ló** gomb a címlapon új játékot kezd, a régi mentés helyére.
- A világ kibővítésekor (2. változat) a ló, a felszerelés, az érmék és a legjobb idők megmaradtak, de az aranypatkók új helyre kerültek, ezért a patkógyűjtés nulláról indul.

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
