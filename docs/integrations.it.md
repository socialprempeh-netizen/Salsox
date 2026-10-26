---
title: Integrazioni
description: HubSpot, Salesforce e il server OAuth di Salsox, come si collegano e cosa scrivono.
translated_from: integrations.md
source_checksum: 202ca3f95098
---

# Integrazioni: HubSpot, Salesforce e il server OAuth

Tre parti, ciascuna disattivata finché non si impostano le sue variabili d'ambiente:

| Parte | Direzione | Codice |
|---|---|---|
| Collegamento a HubSpot | Salsox è client OAuth di HubSpot | `src/lib/integrations/hubspot*.ts` |
| Collegamento a Salesforce e scrittura di ritorno | Salsox è client OAuth dell'org e vi scrive | `src/lib/integrations/salesforce*.ts` |
| Server OAuth | Salsox è il server di autorizzazione, per il pacchetto Salesforce | `src/lib/oauth-server` |

Le persone collegano e scollegano in **Dashboard → Developers → Integrations**, dove sono elencate anche le app a cui hanno dato accesso tramite il server OAuth, con Disconnect.

## Collegare HubSpot e Salesforce

Entrambi usano l'authorization code grant da `/api/integrations/{hubspot|salesforce}/connect`, che torna a `/api/integrations/{provider}/callback`. Il callback è accettato solo con uno `state` firmato da Salsox (HMAC con una chiave derivata da `AUTH_SECRET`), per la persona che ha effettuato l'accesso, nel browser che ha avviato il flusso (un nonce in un cookie httpOnly), entro dieci minuti (`oauth-state.ts`). Salesforce usa anche PKCE; il suo verifier sta in quel cookie, mai in un URL. I token sono conservati cifrati con AES-256-GCM (la cassaforte dei segreti dei webhook), rinnovati quando scadono e revocati presso il provider con Disconnect.

| Variabile | Note |
|---|---|
| `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` | Dalle impostazioni Auth dell'app HubSpot. Redirect URL: `<site>/api/integrations/hubspot/callback`. |
| `HUBSPOT_SCOPES` | Facoltativa. Deve coincidere esattamente con gli scope dell'app. Predefinita `oauth crm.objects.contacts.read crm.objects.deals.read`. |
| `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` | Una External Client App (o connected app): scope `api` e `refresh_token`, PKCE obbligatorio, callback `<site>/api/integrations/salesforce/callback`. |

Un collegamento Salesforce è verso un'org di produzione (login.salesforce.com) o una sandbox (test.salesforce.com, "Connect a sandbox"). Le chiamate vanno solo all'indirizzo d'istanza restituito da Salesforce, e solo se è un host Salesforce.

Oggi il collegamento a HubSpot fa il collegamento: l'account, i suoi scope e token validi. Le funzioni della scheda (eventi sulla timeline, la scheda sul deal, il PDF firmato sul deal) si costruiscono su `hubSpotAccessToken` e non sono ancora costruite; `marketing/marketplace-listings/hubspot.md` le descrive.

## Scrittura di ritorno su Salesforce

Un documento inviato tramite l'API con `salesforce_record_id` (15 o 18 caratteri) ricorda il record. Quando è completato, il PDF firmato viene archiviato sul record (una `ContentVersion` pubblicata su di esso) e viene registrata una Task completata; quando qualcuno rifiuta, una Task dice chi e perché. Una Task si collega a un Contact o a un Lead tramite `WhoId` e a qualsiasi altra cosa tramite `WhatId`.

Ogni scrittura di ritorno è un `IntegrationJob`, uno per documento ed evento. Viene eseguito appena avviene l'evento e, se fallisce, dal cron dell'e-sign con attese crescenti (1, 5, 30 minuti, 2 e 12 ore), fino a otto tentativi; la pagina Developers mostra quanti sono falliti definitivamente. Un job registra ogni passo appena concluso, quindi un nuovo tentativo non archivia mai il PDF due volte. Un 401 dall'org rinnova il token una volta.

## Il server OAuth

Per il pacchetto Salesforce, la cui Named Credential deve contenere credenziali OAuth anziché una chiave API incollata. Costruito internamente e volutamente ridotto, perché il plugin provider di Better Auth richiede una versione di Better Auth più recente di quella usata dall'app:

- authorization code grant con PKCE (S256) obbligatorio, e refresh token; nient'altro;
- un solo client confidenziale dall'ambiente, con indirizzi di redirect esatti;
- token opachi conservati come hash SHA-256: codici di dieci minuti e monouso (un codice riusato revoca ciò che aveva prodotto), access token di un'ora, refresh token di novanta giorni ruotati a ogni uso (uno già ruotato usato di nuovo revoca l'intero collegamento);
- scope che limitano `/api/v1`: `documents:send`, `documents:read`, `templates:read`, `webhooks:manage`. Una chiave API raggiunge ancora ogni percorso.

| Endpoint | |
|---|---|
| `GET /oauth/authorize` | La pagina di consenso. Un client sconosciuto o un indirizzo di redirect non registrato viene spiegato lì e mai usato per un redirect. Senza accesso, la persona accede e viene riportata qui. |
| `POST /api/oauth/token` | `authorization_code` (con `code_verifier`) o `refresh_token`. Autenticazione del client con HTTP Basic o nel corpo. |
| `POST /api/oauth/revoke` | RFC 7009: chiude il collegamento del token. |

| Variabile | Note |
|---|---|
| `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` | Quello che si dà al pacchetto. Il secret ha almeno 32 caratteri. |
| `OAUTH_REDIRECT_URIS` | Gli indirizzi di callback del pacchetto, separati da virgole, confrontati esattamente. |
| `OAUTH_CLIENT_NAME` | Il nome sulla pagina di consenso. Predefinito "Salesforce". |

Un access token si usa come una chiave API: `Authorization: Bearer sxo_at_…`. `DELETE /api/v1/keys/current` con uno di essi chiude il suo collegamento.

## Test

I test unitari stanno accanto a ogni file. Su un database reale, solo se richiesto: `ESIGN_DB_TESTS=1 npx vitest run src/lib/oauth-server/store.db.test.ts src/lib/integrations/salesforce-store.db.test.ts` (codici, rotazione, concorrenza e la scrittura di ritorno con Salesforce simulato). Niente di tutto questo è ancora stato eseguito contro un vero account HubSpot o una vera org Salesforce: servono prima le app descritte sopra.
