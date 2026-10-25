---
title: L'estensione Chrome per le firme
description: Come l'estensione Chrome invia PDF da firmare tramite l'API pubblica, come si collega a un account e cosa configurare sul server.
translated_from: signing-extension.md
source_checksum: 4f892188420d
---

# L'estensione Chrome per le firme

`extensions/salsox-signing` è un'estensione Chrome Manifest V3 che invia un PDF da firmare dal browser: si collega un account esistente, si sceglie un PDF, si posizionano campi di firma, data e testo, si aggiungono i firmatari, si invia. Non ha un backend proprio: chiama l'API pubblica (`docs/webhooks.md`) con una chiave API che riceve quando la persona si collega. Il README dell'estensione descrive i suoi file, i permessi e il pacchetto; questa guida riguarda il lato server.

## Dove si trova

| Parte | File |
|---|---|
| Le regole di collegamento (quale estensione può ricevere una chiave) | `src/lib/extension-connect.ts` |
| La pagina di collegamento | `src/app/(auth)/extension/connect/page.tsx`, `src/components/auth/extension-consent.tsx` |
| La creazione della chiave | `src/app/actions/extension-connect.ts` (chiama `createApiKey`) |
| Il controllo della politica di accesso fuori dalla dashboard | `src/lib/security-enrollment.ts` |
| Piano e documenti rimasti per il popup | `GET /api/v1/me` (`plan`) |
| La revoca alla disconnessione | `DELETE /api/v1/keys/current` |
| L'invio | `POST /api/v1/documents`, invariato |
| Le regole dell'estensione, testate | `extensions/salsox-signing/lib/fields.js`, `src/lib/signing-extension.test.ts` |
| Da capo a fondo, caricata in Chromium | `e2e/signing-extension.spec.ts` |

## Il collegamento

L'estensione chiama `chrome.identity.launchWebAuthFlow` con `/extension/connect?redirect_uri=https://<id estensione>.chromiumapp.org/connected`. La finestra condivide la sessione del browser, quindi chi ha già effettuato l'accesso deve solo confermare. Con **Connect** il server crea una chiave API chiamata "Salsox Signing (Chrome extension)" e manda la finestra all'indirizzo di ritorno con la chiave nel frammento. Chrome intercetta ogni navigazione verso `<id>.chromiumapp.org` e la consegna solo a quell'estensione; la chiave non passa mai per la rete.

Gli altri esiti tornano allo stesso modo come `#error=`: `signed_out` (l'estensione apre `/login` in una scheda; la pagina di accesso non è cambiata, quindi funzionano tutti i metodi e la 2FA, e la persona preme di nuovo Connect), `setup_required` (la politica dell'amministratore richiede la 2FA e non è configurata; l'estensione apre la dashboard, che mostra la configurazione), `cancelled`, `limit` (l'account ha già il numero massimo di chiavi API).

**L'elenco degli id consentiti è il confine di sicurezza.** Qualsiasi estensione può aprire la pagina con il proprio indirizzo di ritorno, quindi ricevono una chiave solo gli id in `SIGNING_EXTENSION_IDS` (separati da virgole). In sviluppo è accettato qualsiasi id, così si può provare una copia non pacchettizzata. Se in produzione non è impostato, nessuna estensione può collegarsi.

## Configurazione

- `SIGNING_EXTENSION_IDS`: l'id dell'estensione. Il Chrome Web Store lo assegna al primo caricamento (è nella pagina dell'elemento nella dashboard); aggiungerlo sul server prima che la scheda sia pubblicata, altrimenti Connect mostra "This link is not from the extension".
- `/extension/` è tra i percorsi non localizzati del proxy (`src/proxy.ts`), quindi la pagina è servita esattamente a quell'indirizzo.

## Cosa non fa

Niente Sign & Pay (un account Business viene indirizzato alla dashboard), niente approvatori o copie, niente modelli. Ognuno di questi è già nell'API o nella dashboard e si può aggiungere al popup in seguito senza modifiche al server, tranne Sign & Pay, che `POST /api/v1/documents` non accetta ancora.
