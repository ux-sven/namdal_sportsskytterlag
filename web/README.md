# Nettsiden namdalssl.no

Statisk nettside bygget med [Astro](https://astro.build) og publisert på **GitHub Pages**.
Innholdet redigeres fortsatt i **WordPress**, og hentes inn hver gang siden bygges.

```
WordPress (redigering)  ──REST API──▶  GitHub Actions (npm run build)  ──▶  GitHub Pages
        │                                        ▲
        └── publiserer → varsel (mu-plugin) ─────┘
```

## Slik fungerer det

- `scripts/fetch-content.mjs` henter sider, innlegg og bilder fra `WP_URL/wp-json/wp/v2/`, vasker bort
  Avada-temaets HTML og stiler, laster ned bildene til `public/media/` og skriver `src/data/content.json`.
- Astro bygger forsiden, nyhetsoversikten, alle innlegg og alle WordPress-sider med ny design.
  Innleggene beholder de gamle adressene (`/2026/02/24/namdal-open-2026-22-23-august/`), så lenker
  fra Facebook og Google fortsatt virker.
- Forsiden, menyen og bunnteksten er definert i koden (`src/pages/index.astro`, `src/lib/site.js`).
  Nyheter og sider kommer fra WordPress.
- Hvis WordPress er utilgjengelig under byggingen, brukes innholdet fra forrige henting (lokalt).

## Design og farger

- Layouten er inspirert av referansen «Fishing and Hunting Club Landing Page» (Dribbble): flytende
  pille-meny, stor fotohero med revnet kant, papirtekstur, skrå fotokort, skog-seksjon med nålede
  polaroider og kursiv serif-aksent i overskriftene.
- **Alle farger kommer fra fargepaletten på dagens namdalssl.no** (Avada-temaets globale farger):
  natt `#040922` (tekst, meny, bunntekst), marine `#0f2385` (mørk seksjon, knapp-hover), blå `#3269ff`
  (knapper og lenker), dueblå `#425a9e` (sekundærtekst), lavendel `#b8a9d8` (lyse flater), lys gul `#ffe9b3`
  (aksent på mørk bakgrunn) og hvit.
  `src/styles/nssl-tokens.json` er kilden, `npm run tokens` lager `src/styles/tokens.css` (`--c-…`),
  og `src/styles/global.css` gir dem semantiske navn (f.eks. `--accent: var(--c-bla)`).
  Gjennomsiktighet og hover lages med `color-mix()` av de samme fargene.
- `npm run check:tokens` (kjøres i hver bygging) stopper byggingen hvis en farge er hardkodet et sted i `src/`.

## Oppmøteregistrering

Siden `/oppmoteregistrering/` er bygget inn i nettsiden (`src/pages/oppmoteregistrering.astro` og
`src/scripts/registration.js`). Den leser medlemslisten og lagrer registreringer i Google-regnearket
via Apps Script-API-et (`../apps-script/Code.gs`, `doPost`). Uten `PUBLIC_REGISTRATION_URL` kjører den
med testdata (merket «Demo»). Legg til `?state=husket` i adressen for å se tilstanden med husket skyteleder.

### Nettbrettmodus (iPad ved standplass)

`/oppmoteregistrering/nettbrett/` viser bare skjemaet – uten meny, lenker og bunntekst – og åpnes fra
knappen «Åpne nettbrettmodus» på registreringssiden. I nettbrettmodus:

- tømmes et halvutfylt skjema etter 90 sekunder uten aktivitet,
- hentes medlemsliste og dagens skyteleder på nytt hvert 10. minutt og når nettbrettet vekkes (ny dag),
- holdes skjermen våken der nettleseren støtter det (Screen Wake Lock),
- kan siden legges på Hjem-skjermen og åpnes i fullskjerm som en egen app («NSSL Oppmøte»).

Oppsett på iPad:
1. Åpne nettbrettmodus i Safari → Del-knappen → **Legg til på Hjem-skjerm**. Åpne appen og skriv inn tilgangskoden én gang.
2. **Innstillinger → Skjerm og lysstyrke → Automatisk lås: Aldri** (og la iPaden stå til lading).
3. Lås iPaden til appen med **Veiledet tilgang**: Innstillinger → Tilgjengelighet → Veiledet tilgang → på, og velg en kode.
   Åpne appen og trippeltrykk sideknappen for å starte. Trippeltrykk og koden avslutter.

## Utvikle lokalt

```bash
cd web
npm install
npm run content   # hent innhold fra WordPress
npm run dev       # http://localhost:4321
```

## Publisering – førstegangsoppsett

1. **Slå på GitHub Pages:** repoet → *Settings → Pages → Build and deployment → Source: GitHub Actions*.
2. **Push til `main`.** Workflowen `.github/workflows/deploy-web.yml` bygger og publiserer siden til
   `https://ux-sven.github.io/namdal_sportsskytterlag/`. Den kan også startes manuelt under *Actions*.
3. **(Valgfritt) Variabler** under *Settings → Secrets and variables → Actions → Variables*:
   - `PUBLIC_REGISTRATION_URL` – adressen til den publiserte Apps Script-web-appen (slutter på `/exec`).
   - `WP_URL` – hvis WordPress flyttes, f.eks. `https://cms.namdalssl.no`.

## Automatisk oppdatering fra WordPress

1. Lag en *fine-grained personal access token* i GitHub (*Settings → Developer settings*) med tilgang
   **bare** til dette repoet og rettigheten *Contents: Read and write*.
2. Last opp `../wordpress/nssl-github-deploy.php` til `wp-content/mu-plugins/` på WordPress-serveren.
3. Legg inn i `wp-config.php`:
   ```php
   define('NSSL_GITHUB_REPO', 'ux-sven/namdal_sportsskytterlag');
   define('NSSL_GITHUB_TOKEN', 'github_pat_...');
   ```
Når noen publiserer, endrer eller sletter et innlegg eller en side, bygges nettsiden på nytt etter
ca. ett minutt. I tillegg bygges siden hver sjette time som reserve.

## Flytte domenet til GitHub Pages (når dere er klare)

1. Flytt WordPress til en underadresse, f.eks. `cms.namdalssl.no`, og sett
   *Innstillinger → Lesing → Be søkemotorer om ikke å indeksere* i WordPress.
2. Sett variabelen `WP_URL` til den nye adressen.
3. Under *Settings → Pages → Custom domain*: skriv `namdalssl.no` og pek DNS dit
   ([GitHub-veiledning](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site)).
   Base-stien blir da automatisk tom.

## Kjente begrensninger

- Skjemaene fra Avada (kontakt og påmelding til sikkerhetskurs) kan ikke kjøre på en statisk side.
  Sidene viser i stedet en «Send e-post»-knapp. Kan erstattes med f.eks. Formspree eller et Apps Script-skjema.
- Passordbeskyttede WordPress-sider tas ikke med.
- Siden *Aktivitetskalender* har i dag ingen hendelser i WordPress. En Google-kalender kan bygges inn senere.
- Lenken til `/baneregler/` på siden *Dokumenter* peker til en side som ikke er publisert i WordPress.
- Repoet må være offentlig for gratis GitHub Pages. Det inneholder ingen hemmeligheter.
