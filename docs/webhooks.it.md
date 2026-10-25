---
title: Webhook e API
description: Inviare gli eventi dei documenti ad altri software, chiavi API per le integrazioni, e come le consegne restano sicure.
translated_from: webhooks.md
source_checksum: 625cc9386093
---

# Webhook e API

Ogni account può inviare gli eventi dei propri documenti ad altri software come JSON firmato, e le integrazioni (Zapier, Make, HubSpot) possono iscriversi con una chiave API. Questa guida spiega come è costruito e cosa configurare. Il riferimento pubblico per chi riceve i webhook è l'articolo del Centro assistenza `content/help/articles/webhooks-and-api.md`, servito su `/resources/help/webhooks-and-api`.

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
| Pagina Sviluppatori | `src/app/(dashboard)/dashboard/developers/page.tsx`, `src/components/developers/` |

## Eventi

`document.sent`, `document.viewed`, `document.signed`, `document.completed`, `payment.sent`, `document.declined` e `document.expired`. Ognuno è un evento di audit che il motore di firma registra già una volta per occorrenza (`src/lib/esign/audit.ts`), quindi i webhook non devono eliminare duplicati.

`recordAudit` mette in coda il webhook subito dopo la riga di audit quando lavora fuori da una transazione. Dentro una transazione (una firma, un completamento) l'evento potrebbe ancora essere annullato, quindi è il chiamante a metterlo in coda dopo il commit (`signing.ts`, `documents.ts`). La coda non lancia mai eccezioni: un problema di webhook non deve fermare una firma. Un crash nell'istante tra il commit e la coda perderebbe quel solo webhook.

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

`GET /api/v1/me`, `GET` e `POST /api/v1/webhooks`, `DELETE /api/v1/webhooks/{id}`, `GET /api/v1/webhooks/sample?event=`. Autenticazione con `Authorization: Bearer ak_…`. È lo schema "REST hook" che Zapier e Make usano per i trigger istantanei. Non esiste ancora un endpoint per creare o inviare documenti.

## Configurazione

Niente di nuovo: i webhook usano `AUTH_SECRET` (già obbligatoria) e l'URL dell'app (`NEXT_PUBLIC_APP_URL`) per i link ai documenti nei payload. Applica la migrazione `20261025180000_webhooks_api_keys`.
