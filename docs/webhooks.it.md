---
title: Webhook e API
description: Inviare gli eventi dei documenti ad altri software, chiavi API per le integrazioni, e come le consegne restano sicure.
translated_from: webhooks.md
source_checksum: aaa02eac6971
---

# Webhook e API

Ogni account può inviare gli eventi dei propri documenti ad altri software come JSON firmato, e le integrazioni (Zapier, Make, HubSpot) possono iscriversi, e inviare e cercare documenti, con una chiave API. Questa guida spiega come è costruito e cosa configurare. Il riferimento pubblico per chi riceve i webhook è l'articolo del Centro assistenza `content/help/articles/webhooks-and-api.md`, servito su `/resources/help/webhooks-and-api`.

## Dove si trova

| Parte | File |
|---|---|
| Eventi, e da quale evento del motore nasce ciascuno | `src/lib/webhooks/events.ts` |
| Payload, payload di esempio, firma e verifica | `src/lib/webhooks/payload.ts` |
| Quali URL si possono chiamare (regole SSRF) | `src/lib/webhooks/url-safety.ts` |
| Calendario dei nuovi tentativi | `src/lib/webhooks/retry.ts` |
| Cifratura dei segreti | `src/lib/webhooks/secret-box.ts` |
| Invio HTTP (controllo dell'IP alla connessione, niente redirect) | `src/lib/webhooks/deliver.ts` |
| Endpoint, coda, tentativi, prove | `src/lib/webhooks/store.ts` |
| Chiavi API | `src/lib/api-keys.ts`, `src/lib/api-keys-store.ts` |
| Route dell'API pubblica | `src/app/api/v1/` con `src/lib/api/v1.ts` |
| Lettura di una richiesta di invio o di ricerca (pura) | `src/lib/api/documents.ts` |
| Ricerca dei documenti | `src/lib/api/documents-store.ts` |
| Download di un `file_url` (stesse regole SSRF dei webhook) | `src/lib/api/fetch-file.ts` |
| Invio dall'API, nel motore | `src/lib/esign/api-send.ts` |
| Pagina Sviluppatori | `src/app/(dashboard)/dashboard/developers/page.tsx`, `src/components/developers/` |

## Eventi

`document.sent`, `document.viewed`, `document.signed`, `document.completed`, `payment.sent`, `document.declined` e `document.expired`. Ognuno è un evento di audit che il motore di firma registra già una volta per occorrenza (`src/lib/esign/audit.ts`), quindi i webhook non devono eliminare duplicati.

`recordAudit` mette in coda il webhook subito dopo la riga di audit quando riceve il client dell'app (`prisma`), cioè fuori da una transazione. (Prima controllava la presenza di un metodo `$transaction`, che anche il client di transazione di Prisma 7 ha, quindi una firma veniva messa in coda due volte.) Dentro una transazione (una firma, un completamento) l'evento potrebbe ancora essere annullato, quindi è il chiamante a metterlo in coda dopo il commit (`signing.ts`, `documents.ts`). La coda non lancia mai eccezioni: un problema di webhook non deve fermare una firma. Un crash nell'istante tra il commit e la coda perderebbe quel solo webhook.

## Consegna

Ogni endpoint iscritto riceve una riga `WebhookDelivery` con il payload fissato in quel momento. L'invio avviene dopo la risposta (`after` di `next/server`), così chi firma non aspetta il server di qualcun altro. Un tentativo prima "prenota" la riga, così il cron, un nuovo evento e un Reinvia manuale non mandano due volte la stessa consegna.

Qualsiasi risposta diversa da 2xx entro 10 secondi è un fallimento, ritentato dopo circa 1 minuto, 5 minuti, 30 minuti, 2 ore, 12 ore e 24 ore, poi segnato come fallito. I nuovi tentativi partono dal cron giornaliero `/api/cron/esign` (passo `webhooks`). **Con un piano che consente solo cron giornalieri, un nuovo tentativo può aspettare fino a un giorno in più del previsto.** Un cron ogni pochi minuti sulla stessa route, o uno dedicato che chiama `deliverDue()`, li rende puntuali.

## Sicurezza

- **SSRF.** Gli utenti scrivono l'URL e il nostro server lo chiama. Gli URL devono essere https (http verso localhost solo in sviluppo), senza credenziali né porte privilegiate. Alla connessione si controlla ogni indirizzo risolto, quindi un nome pubblico che punta a un indirizzo privato, di loopback o link-local (i metadati cloud su 169.254.169.254) viene rifiutato anche se il DNS cambia dopo il controllo dell'URL. I redirect non vengono mai seguiti.
- **Firme.** `Webhook-Signature: t=<unix>,v1=<HMAC-SHA256 esadecimale di "t.body">`, con un segreto per endpoint mostrato una sola volta. Chi riceve dovrebbe rifiutare timestamp più vecchi di cinque minuti.
- **Segreti salvati.** Il server deve leggerli per firmare, quindi sono cifrati con AES-256-GCM e una chiave derivata da `AUTH_SECRET`. Cambiare `AUTH_SECRET` li rende illeggibili: le consegne falliscono con l'indicazione di rigenerare il segreto nella pagina Sviluppatori.
- **Le chiavi API** sono `ak_` più 40 caratteri casuali, salvate solo come SHA-256, mostrate una volta, revocabili. Ogni chiave ha un limite di 120 richieste al minuto.
- **I payload** non contengono mai token di firma (ognuno apre un documento), numeri di telefono o indirizzi IP.

## L'API

Autenticazione con `Authorization: Bearer ak_…`, 120 richieste al minuto per chiave. Gli errori sono `{ "error": { "code", "message" } }`.

| Richiesta | Fa |
|---|---|
| `GET /api/v1/me` | L'account della chiave: le integrazioni la chiamano per provare una chiave. |
| `GET`, `POST /api/v1/webhooks`, `DELETE /api/v1/webhooks/{id}` | Iscrizioni, nello schema "REST hook" che Zapier e Make usano per i trigger istantanei. |
| `GET /api/v1/webhooks/sample?event=` | Un payload di esempio per un evento. |
| `GET /api/v1/events?event=&limit=` | Gli ultimi eventi reali di un tipo dell'account (fino a 100, il massimo previsto dalle regole di polling di Zapier), ricostruiti dall'audit trail da `recentEvents` in `store.ts`, nella forma del payload. Il "perform list" di Zapier lo usa, e ripiega sull'esempio quando è vuoto. Gli id sono `evt_a_<id dell'audit>`, stabili tra una chiamata e l'altra; il documento è mostrato com'è adesso. |
| `POST /api/v1/documents` | Crea e invia un documento, da un PDF o da un modello. |
| `GET /api/v1/documents` | Cerca documenti: `status`, `recipient`, `title`, `created_after`, `created_before`, `limit` (fino a 100), `cursor`. |
| `GET /api/v1/documents/{id}` | Un documento. |
| `GET /api/v1/documents/{id}/pdf` | Il PDF: la copia firmata, con il suo certificato, una volta completato; l'originale fino ad allora. `?version=signed` o `?version=original` per scegliere; `signed` prima del completamento è un `409 not_signed`. L'header di risposta `X-Document-Version` dice quale si è ricevuto. |
| `GET /api/v1/templates` | I modelli della libreria (ruoli e campi da compilare) e quelli salvati dall'account. |

I documenti tornano nella forma del payload dei webhook (`documentResource` in `payload.ts`): i campi del documento con un array `recipients`. Una sola forma per ciò che consegna un webhook e ciò che trova una ricerca, così un'integrazione li mappa una volta sola.

### Invio

`POST /api/v1/documents` accetta JSON, oppure `multipart/form-data` con una parte `file` e lo stesso JSON in una parte `data`. La fonte è esattamente una tra una parte `file`, `file_url`, `file_base64`, `template` (lo slug di un modello della libreria) o `saved_template_id`, con `values` per i campi da compilare del modello. Poi `recipients` (`email`, `name`, `role`, `order`, `template_role`), `fields` facoltativi (`recipient` come posizione o email, `type`, `page`, `x`, `y`, `width`, `height` in percentuale della pagina), `title`, `message`, `expires_in_days` e `signing_order`.

Non è un secondo percorso di invio. `sendFromApi` sceglie uno di quelli che il prodotto ha già, quindi le regole dei piani, i controlli sul mittente, l'audit trail e i webhook (`document.sent` tramite `recordAudit`) sono quelli della dashboard:

- un PDF a firmatari in parallelo senza campi passa da Quick Send (`quickSend`), che colloca una firma e una data per ciascuno;
- un PDF con campi, approvatori, visualizzatori, copie o un ordine di firma passa dal percorso dell'editor, `createDraftFromUpload`, `saveDocumentSetup`, `sendDocument`. Senza campi è rifiutato con `fields_required`, perché il motore non indovina dove firma un approvatore;
- un modello passa da `createDraftFromTemplate`, poi dal percorso dell'editor con le persone compilate. Il ruolo del mittente (`you`) è l'account della chiave; gli altri ruoli si assegnano con `template_role`, o nell'ordine.

Se la bozza è stata creata ma l'invio viene rifiutato (email non confermata, regola del piano), la bozza viene eliminata, così una chiamata fallita non lascia nulla nell'account. Le richieste consumano anche i limiti a raffica della dashboard (`esign:send:<user>`, `esign:upload:<user>`), quindi l'API non è un modo per aggirarli. Un rifiuto porta il codice del motore e il messaggio in inglese che la dashboard mostra per quel codice; i limiti di piano sono 402.

**File.** Il limite del PDF è quello della dashboard (4 MB). Una funzione Vercel accetta al massimo 4,5 MB di corpo, quindi un PDF vicino al limite passa come upload multipart o come `file_url`, non in base64. Il `file_url` viene scaricato con le regole dei webhook: solo https, ogni indirizzo risolto controllato alla connessione, fino a tre redirect (i link ai file di Zapier rimandano allo storage), ciascuno ricontrollato, 10 secondi, e il corpo letto solo fino al limite di dimensione.

## L'app per Zapier

`integrations/zapier` è l'app di Salsox sulla Zapier Platform, costruita con la Zapier CLI sugli endpoint qui sopra e su nient'altro: trigger istantanei su sei eventi tramite `/api/v1/webhooks` (dati di prova da `/api/v1/events`, poi l'esempio), "Send Document From Template" e "Send Document From PDF" tramite `POST /api/v1/documents`, "Find Document" tramite `GET /api/v1/documents`, e il PDF firmato di un documento completato da `/api/v1/documents/{id}/pdf`. Come provarla, caricarla e pubblicarla è nel suo `README.md`; i suoi test girano con `npm test`.

## Configurazione

Niente di nuovo: i webhook usano `AUTH_SECRET` (già obbligatoria) e l'URL dell'app (`NEXT_PUBLIC_APP_URL`) per i link ai documenti nei payload. Applica la migrazione `20261025180000_webhooks_api_keys`.
