---
title: SEO
description: Come il sito pubblico è costruito per essere trovato, come aggiungere pagine senza creare duplicati e come collegare Search Console, Bing e gli analytics.
translated_from: seo.md
source_checksum: 02eb42f949d7
---

# SEO

Come il sito pubblico è costruito per essere trovato: le pagine, le regole che le rendono degne di essere indicizzate, l'infrastruttura tecnica e i servizi da collegare dopo il deploy.

## Cosa è già incluso

| Area | Dove |
|---|---|
| Titolo, descrizione, canonical, Open Graph e Twitter card unici per pagina | `src/lib/metadata.ts`, `src/lib/seo/page-metadata.ts` |
| Immagine social per ogni pagina di atterraggio, strumento e confronto | `opengraph-image.tsx` accanto a ogni route, `src/components/seo/og-card.tsx` |
| Sitemap con date di ultima modifica reali | `src/app/sitemap.ts` |
| robots.txt | `src/app/robots.ts` |
| `noindex` su dashboard, admin, pagine di accesso, API e link di firma | `next.config.ts` (`X-Robots-Tag`), il layout `(auth)` |
| Redirect 301 per URL che si sovrappongono | `src/lib/seo/redirects.ts` |
| Dati strutturati (Organization, WebSite, SoftwareApplication, WebApplication, BreadcrumbList, FAQPage, Article) | `src/lib/structured-data.ts`, `src/lib/seo/jsonld.ts`, `src/lib/seo/page-graph.ts` |
| Validazione dei dati strutturati | `src/lib/seo/validate-jsonld.ts`, eseguita nei test e nella scansione |
| IndexNow (Bing e altri) | `src/lib/indexnow.ts`, cron giornaliero |
| Pagina di salute SEO | `/admin/seo` |
| Attribuzione delle iscrizioni, di prima parte | `src/lib/seo/attribution.ts` |
| Google Analytics 4 (opzionale) | `src/components/analytics/google-analytics.tsx` |

## Le pagine

Le pagine di atterraggio, gli strumenti, i confronti e i casi d'uso sono file Markdown con frontmatter, in cartelle per tipo:

```
content/pages/
  solutions/      /online-esignature, /free-esignature, …
  tools/          /sign-pdf, /add-signature-to-pdf, …  (lo strumento funzionante sta sopra il testo)
  compare/        /compare/docusign, …
  alternatives/   /alternatives/docusign
  use-cases/      /esignature-for/real-estate, …
```

Le guide stanno in `content/blog` (vedi [la guida al blog](./blog.it.md)); il frontmatter `related:` di un articolo lo collega alle pagine che supporta.

Scrivi `{site}` dove va il nome del prodotto: viene sostituito con il valore di `siteConfig`, così le pagine seguono un cambio di nome.

### Aggiungere una pagina senza creare un duplicato

Ogni pagina possiede un intento di ricerca: il suo `primaryKeyword`, più gli `aliases` che significano la stessa cosa. Prima di scrivere una pagina per una nuova ricerca, controlla se una pagina esistente possiede già quell'intento. Se sì, aggiungi la ricerca ai suoi `aliases` e, se è probabile che qualcuno digiti quell'URL, aggiungi un redirect in `src/lib/seo/redirects.ts`. Due pagine in competizione per la stessa ricerca danneggiano entrambe.

`npm test` verifica ogni pagina con queste regole (`src/lib/seo/pages.test.ts`):

- titolo, descrizione, H1 e parola chiave principale unici, e nessun intento posseduto due volte;
- una quantità minima di testo (450 parole per le soluzioni, 300 per gli strumenti più passaggi e FAQ, 500 per i confronti);
- nessuna coppia di pagine, o di pagina e articolo, che condivida più del 12% delle sequenze di cinque parole;
- almeno tre link correlati, tutti verso pagine esistenti;
- i confronti indicano il concorrente, citano le fonti e dicono quando i fatti sono stati verificati.

Quando il test fallisce sul contenuto, correggi il contenuto: le soglie sono volute.

### I confronti restano fattuali

Scrivi solo ciò che l'altra azienda pubblica, collega la fonte in `sources:` e aggiorna `checked:` a ogni nuova verifica. Di' dove il concorrente è più forte. I prezzi cambiano: ricontrolla le pagine di confronto almeno ogni trimestre.

## Internazionalizzazione

Una traduzione è un file accanto a quello inglese: `content/pages/tools/sign-pdf.it.md`. Solo le pagine tradotte ricevono un URL localizzato, gli alternate hreflang e una voce nella sitemap in quella lingua, così lo stesso testo non viene mai pubblicato a due indirizzi. Con una sola lingua il layout radice non legge la richiesta, e le pagine pubbliche restano statiche (`src/i18n/static-locale.ts`).

## Dopo il deploy

1. **Imposta `NEXT_PUBLIC_APP_URL`** all'indirizzo pubblico `https://`. Canonical, sitemap e dati strutturati sono costruiti da qui.
2. **Google Search Console.** Aggiungi il sito come proprietà. Verifica via DNS, oppure incolla il contenuto del meta tag in `GOOGLE_SITE_VERIFICATION`. Invia `https://tuodominio.com/sitemap.xml` nella sezione Sitemap.
3. **Bing Webmaster Tools.** Importa il sito da Search Console, o verifica con `BING_SITE_VERIFICATION`. Invia la stessa sitemap.
4. **IndexNow** è già attivo quando `CRON_SECRET` è impostato: gli URL nuovi e aggiornati della sitemap vengono inviati ogni giorno. L'invio chiede ai motori di scansionare; non garantisce l'indicizzazione.
5. **Apri `/admin/seo`** e avvia una scansione. Correggi tutto ciò che è segnato come errore.

## Analytics

- **Query di ricerca, impressioni e posizionamento** arrivano solo da Search Console e Bing Webmaster Tools. Nessun sito può vedere la ricerca digitata da un visitatore.
- **Iscrizioni per canale** sono registrate in prima parte. La prima volta che qualcuno arriva su una pagina pubblica, un cookie (`sx_src`, 30 giorni) registra il percorso di arrivo, l'host del referrer e gli eventuali tag `utm_*`. Non viene registrato nulla se il browser invia Global Privacy Control o Do Not Track. Quando viene creato un account, il server salva questi dati e il canale sull'utente. `/admin/seo` mostra le iscrizioni per canale e le pagine di arrivo delle iscrizioni da ricerca organica.
- **Google Analytics 4** si carica solo quando `NEXT_PUBLIC_GA_MEASUREMENT_ID` è impostato, dopo che la pagina è inattiva, e solo allora la Content-Security-Policy consente gli host di Google. Riceve le visualizzazioni di pagina e questi eventi: `tool_opened`, `tool_downloaded`, `cta_clicked` e `sign_up` (con il canale). Non inviare mai agli analytics nomi di file, email o contenuti dei documenti. GA imposta cookie: a seconda di dove si trovano i tuoi visitatori, potrebbe servire un banner di consenso prima di attivarlo.
- **Vercel Analytics** riceve gli stessi eventi quando è montato (gli eventi personalizzati richiedono un piano Vercel che li includa).

## Test

- `npm test` copre le regole sui contenuti, i dati strutturati, i redirect, i dati della sitemap, l'attribuzione e le regole di audit.
- `npx playwright test e2e/seo.spec.ts` scansiona il sito in esecuzione: robots.txt, la sitemap, ogni URL della sitemap (stato, canonical, metadati, un solo H1, dati strutturati, testo alternativo, segreti esposti), i redirect, la pagina 404, le pagine private, e che ogni URL della sitemap sia raggiungibile seguendo i link dalla home.
- `e2e/responsive.spec.ts` verifica le pagine pubbliche, compreso ogni strumento, a 360px e 390px.
- Per i Core Web Vitals, esegui Lighthouse in modalità mobile su una build di produzione (`npm run build && npm start`), e segui i dati reali nel report Core Web Vitals di Search Console quando c'è traffico.
