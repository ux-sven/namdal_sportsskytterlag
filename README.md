# namdal_sportsskytterlag

Digitale løsninger for Namdal Sportsskytterlag (NSSL).

| Mappe | Innhold |
|---|---|
| [`web/`](web/README.md) | Ny nettside for namdalssl.no – Astro, publisert på GitHub Pages, innhold fra WordPress |
| [`apps-script/`](#oppmøteregistrering) | Oppmøteregistrering for skytetrening – Google Apps Script og Google Sheets |
| [`wordpress/`](wordpress/nssl-github-deploy.php) | Lite WordPress-tillegg som oppdaterer nettsiden når noe publiseres |
| `.github/workflows/` | Bygging og publisering av nettsiden |

Designet følger Figma-fila [Medlemsregister](https://www.figma.com/design/YdgLlyP99S3HhM5W4iX2zc/Medlemsregister).

---

## Oppmøteregistrering

En **Google Apps Script web-app**. Medlemslisten ligger i et Google-regneark i klubbens Drive
(konvertert fra Excel), og registreringene skrives tilbake til samme regneark.
Appen bygges inn på nettsiden under `/oppmoteregistrering/`.

### Funksjoner

- Søkbar medlemsliste (combobox): skriv for å filtrere, eller trykk på pilen for å bla i hele listen.
- Skyteleder velges av første skytter på en treningsdag og huskes for alle som registrerer seg etterpå. Kan endres.
- Gjester registreres med fritekstnavn og valgfritt «Invitert av».
- Hindrer dobbeltregistrering samme dag, og en lås hindrer at to setter skyteleder samtidig.
- Kvitteringsside som nullstiller skjemaet automatisk – laget for et delt nettbrett ved standplass.
- Valgfri tilgangskode (PIN) slik at medlemslisten ikke er åpen for alle som har lenken.

### Filer

```
apps-script/
  Code.gs          Serverlogikk (lese medlemmer, registrere, huske skyteleder, Excel-import)
  Index.html       Hele brukergrensesnittet (HTML, CSS og JS i én fil)
  appsscript.json  Manifest: tidssone Europe/Oslo, Drive API, web-app-innstillinger
```

### Regnearket

| Fane | Kolonner | Innhold |
|---|---|---|
| **Medlemmer** | `Navn` (eller `Fornavn` + `Etternavn`), `Medlemsnr`, `Aktiv`, `Skyteleder` | Medlemslisten. `Aktiv = Nei` skjuler medlemmet. `Skyteleder = Ja` gjør at personen kan velges som skyteleder. Mangler kolonnen, kan alle aktive velges. |
| **Økter** | `Dato`, `Skyteleder`, `Satt kl.`, `Endret kl.` | Én rad per treningsdag. Skrives automatisk. |
| **Registreringer** | `Tidspunkt`, `Dato`, `Navn`, `Type`, `Invitert av`, `Skyteleder` | Én rad per registrering. Skrives automatisk. |

Kolonnenavnene som gjenkjennes kan justeres i `CONFIG.COLUMNS` øverst i `Code.gs`.

### Oppsett (ca. 15 minutter)

1. **Lag regnearket.** Last opp medlemslisten (.xlsx) til Google Drive, åpne den og velg
   *Fil → Lagre som Google Regneark*. Gi fanen med medlemmene navnet `Medlemmer`.
2. **Legg inn koden.** I regnearket: *Utvidelser → Apps Script*. Erstatt innholdet i `Code.gs` med
   `apps-script/Code.gs`, legg til en HTML-fil som heter `Index` med innholdet fra `apps-script/Index.html`,
   og lim inn `apps-script/appsscript.json` (vis manifestet under *Prosjektinnstillinger → Vis «appsscript.json»*).
   – Alternativt med [clasp](https://github.com/google/clasp): kopier `.clasp.json.example` til `.clasp.json`,
   sett inn script-ID og kjør `clasp push`.
3. **Kjør `setup`** én gang fra editoren. Den oppretter fanene `Økter` og `Registreringer` og ber om tilgang.
4. **(Anbefalt) Sett en tilgangskode:** *Prosjektinnstillinger → Script-egenskaper* → `ACCESS_PIN` (velg en egen kode).
   Nettbrettet husker koden etter første innlogging.
5. **Publiser:** *Distribuer → Ny distribusjon → Web-app*. «Kjør som: meg», «Hvem har tilgang: Alle».
   Åpne lenken på nettbrettet og legg den til på startskjermen.
6. **Bygg den inn på nettsiden:** legg web-app-adressen inn som GitHub-variabelen `PUBLIC_REGISTRATION_URL`
   (se [web/README.md](web/README.md)).

Etter endringer i koden: *Distribuer → Administrer distribusjoner → Rediger → Ny versjon*, så beholdes lenken.

### Automatisk import fra Excel (valgfritt)

1. Legg Excel-fila i en egen Drive-mappe og sett script-egenskapen `EXCEL_FOLDER_ID` til mappens ID.
2. Kjør `importLatestExcel` én gang for å teste, og deretter `installNightlyImport` for import hver natt kl. 03.

### Script-egenskaper

| Navn | Påkrevd | Beskrivelse |
|---|---|---|
| `ACCESS_PIN` | Nei (anbefalt) | Tilgangskode for nettbrettet. |
| `SPREADSHEET_ID` | Nei | Bare nødvendig hvis scriptet ikke er knyttet til regnearket. |
| `EXCEL_FOLDER_ID` | Nei | Drive-mappe for automatisk Excel-import. |

### Forhåndsvisning lokalt

Åpne `apps-script/Index.html` direkte i nettleseren. Uten Apps Script kjører siden med lokale testdata
(merket «Demo»). Legg til `?state=husket` for å se tilstanden der skyteleder allerede er valgt,
og `?embed=1` for slik den ser ut innebygd på nettsiden.

### Personvern

Medlemsnavn er personopplysninger. Dataene blir liggende i klubbens Google-konto. Ikke bruk
«Publiser på nettet» i Google Sheets, og bruk `ACCESS_PIN` når web-appen er åpen for «Alle».
Vurder å slette gamle rader i `Registreringer` når de ikke lenger trengs.

### Kjente begrensninger

- To medlemmer med nøyaktig samme navn kan ikke skilles fra hverandre i listen.
- Web-appen krever nettforbindelse ved standplass.
