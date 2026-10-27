---
title: Offerte lifetime su AppSumo
description: Come Salsox vende un piano a vita su AppSumo con la Licensing API, i webhook, i livelli e il riscatto.
translated_from: appsumo.md
source_checksum: 645024aea2e5
---

# Offerte lifetime su AppSumo

Vendere un piano a vita su AppSumo, tramite la Licensing API di AppSumo (v2). Disattivato finché non si imposta `APPSUMO_API_KEY`.

| Parte | Dove |
|---|---|
| Regole: firma, eventi, livelli, chi può riscattare | `src/lib/appsumo.ts` (testato in `appsumo.test.ts`) |
| Database, chiamate ad AppSumo e Stripe | `src/lib/appsumo-store.ts` |
| Webhook | `POST /api/webhooks/appsumo` |
| Dove AppSumo manda l'acquirente dopo l'attivazione (redirect URL OAuth) | `/redeem` |
| La licenza dell'account e il modulo di riscatto | `/dashboard/redeem` |
| Una chiave inserita prima di accedere, riscattata dopo | `components/appsumo/resume-pending.tsx`, montato dal layout della dashboard |

## Perché le licenze e non i codici

AppSumo offre due modi di evadere un'offerta. Un'offerta a codici è un CSV di stringhe che AppSumo vende e poi non nomina più, quindi nulla avvisa l'app quando un acquirente viene rimborsato. Un'offerta a licenze invia un webhook firmato per ogni cambiamento di una licenza, e un rimborso arriva come `deactivate`. È questo che permette a un acquirente rimborsato di perdere il piano invece di tenerlo per sempre.

## Livelli

| Livello AppSumo | Piano | |
|---|---|---|
| 1 | Personal | documenti illimitati, Quick Send, modelli salvati, link WhatsApp/SMS |
| 2 | Business | tutto Personal, più Sign & Pay, ordine di firma e approvatori, PDF sigillati |

Un account è un solo utente, quindi un livello più alto sblocca funzioni, mai posti, e un account ha una sola licenza attiva. L'acquirente cambia livello su AppSumo: un upgrade o un downgrade emette una nuova chiave e disattiva la vecchia, e la nuova chiave eredita l'account da sola.

Il livello della licenza entra nelle regole dei piani in un solo punto, `accountTier` in `src/lib/esign/sender.ts`, accanto alla fatturazione e ai mesi da referral. Ogni limite di piano lo legge lì, quindi una disattivazione vale dalla richiesta successiva, senza job da eseguire.

## Nessun addebito ricorrente

Una licenza è un piano a vita, quindi riscattarla ferma l'abbonamento Stripe che copre: l'abbonamento termina con il periodo già pagato, come fa il pulsante Annulla della pagina di fatturazione. Un abbonamento a un piano più alto della licenza resta com'è. Finché una licenza è attiva, la pagina di fatturazione lo dice e non propone gli abbonamenti.

## Configurazione

1. Nel Partner Portal di AppSumo, impostare l'evasione dell'offerta a licenze, il webhook URL a `<site>/api/webhooks/appsumo` e il redirect URL OAuth a `<site>/redeem`.
2. Impostare `APPSUMO_API_KEY` con la chiave API delle licenze. Firma i webhook e autorizza le verifiche.
3. Facoltativo: impostare `APPSUMO_CLIENT_ID` e `APPSUMO_CLIENT_SECRET`, il client OAuth. Con questi, la chiave di chi arriva da AppSumo viene letta per lui; senza, la incolla.
4. Applicare la migrazione (`20261027090000_appsumo_licenses`) e pubblicare.
5. Eseguire il test delle licenze di AppSumo. Richiede `/redeem` (deve rispondere 200 senza redirect) e invia un evento di prova al webhook (risposta `{ event, success: true }`, non applicato).

## Il webhook

- **Firma**: `X-Appsumo-Signature` è l'HMAC-SHA256 esadecimale di `X-Appsumo-Timestamp` seguito dal corpo grezzo, con la chiave API. Una richiesta fuori di 15 minuti dall'orologio del server viene rifiutata, così una richiesta intercettata non può essere ripetuta.
- **Risposta**: `200 { event, success: true }` per ogni evento firmato, anche quelli che non cambiano nulla. AppSumo tiene una licenza inattiva finché la sua attivazione non viene confermata. Un errore di registrazione risponde 500, e AppSumo riprova.
- **Ordine**: ogni riga conserva il timestamp dell'ultimo evento applicato, e un evento più vecchio consegnato in ritardo viene ignorato. Un `purchase` tardivo non annulla mai un'attivazione.
- **Add-on** (`parent_license_key`) e `migrate` vengono confermati e ignorati: questa offerta non ha add-on.

## Riscatto

Una chiave viene confrontata prima con quanto registrato dai webhook. Se quella registrazione non dice attiva (il webhook di attivazione non è ancora arrivato, o è fallito), si chiede all'API di AppSumo (`GET /v2/licenses/:key`). Rifiutata, con un messaggio per ciascun caso: non è una chiave, sconosciuta ad AppSumo, disattivata, non ancora attivata, riscattata da un altro account, oppure l'account ha già una licenza. La rivendicazione è un aggiornamento condizionato, così due account che si contendono una chiave non possono vincere entrambi.

Senza accesso, una chiave resta per un'ora in un cookie httpOnly. La prima visita alla dashboard dopo la registrazione o l'accesso la riscatta e mostra il risultato su `/dashboard/redeem`.
