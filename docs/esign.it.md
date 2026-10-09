---
title: Firme elettroniche
description: Il motore di firma di Salsox, dal caricamento al PDF sigillato, con Sign & Pay, Quick Send e fatturazione onesta.
translated_from: esign.md
source_checksum: 7325fc17636c
---

# Firme elettroniche (Salsox)

Come è costruito il motore di firma, dove si trova ogni parte e come configurarlo.

## Da dove viene

Il motore è un'**implementazione clean-room**. [Documenso](https://github.com/documenso/documenso) è stato studiato come riferimento per la forma del problema: token per destinatario, ordine di firma, campi salvati in percentuali della pagina, registro di audit solo in aggiunta e PDF sigillato con certificato. Nessuna parte del suo codice è usata. Documenso è AGPL-3.0 (e la cartella `ee/` ha una licenza commerciale), e copiarlo obbligherebbe Salsox a pubblicare tutto il proprio codice sorgente.

Tutte le librerie usate hanno licenze permissive:

| Libreria | Licenza | Uso |
|---|---|---|
| `pdf-lib` | MIT | lettura dei caricamenti, inserimento dei campi, pagina del certificato |
| `pdfjs-dist` | Apache-2.0 | visualizzazione delle pagine nel browser |
| `perfect-freehand` | MIT | firme disegnate |
| `@signpdf/*` | MIT | sigillo digitale PKCS#7 opzionale |
| `@vercel/blob` | Apache-2.0 | archiviazione privata dei file |
| `jszip` | MIT (doppia licenza MIT/GPL) | ZIP di esportazione completa |
| `nanoid` | MIT | token dei link di firma |

## Struttura

```
src/lib/esign/
  rules.ts          la macchina a stati, funzioni pure (rules.test.ts)
  schemas.ts        forme dei dati condivise tra form e azioni
  documents.ts      caricamento, configurazione, invio, Quick Send, rinnovo, annullamento, sigillo, sweep
  recipients.ts     correzione di un destinatario sul posto (rotazione del token), reinvio
  sending-limits.ts chi può inviare e quanto, funzioni pure (sending-limits.test.ts)
  sender.ts         carica la situazione del mittente per quelle regole
  signing.ts        operazioni del firmatario tramite token, avvio/conferma di Sign & Pay
  renewal.ts        avviso prima di ogni rinnovo dell'abbonamento
  audit.ts          eventi di audit solo in aggiunta
  storage.ts        Vercel Blob (privato) o .data/storage in locale
  tokens.ts, share.ts, files.ts, quick-send.ts, emails.ts
  pdf/              inspect.ts (controlli sul caricamento), signature-image.ts (controlli sulle firme), coords.ts, seal.ts
  payments/         types.ts (interfaccia), stripe.ts, paystack.ts, select.ts, index.ts
src/app/actions/    documents.ts, signing.ts, payouts.ts, billing.ts
src/app/sign/[token]/            pagina pubblica di firma, route per file e download
src/app/(dashboard)/dashboard/   documents/, documents/quick-send, documents/[id](/edit), payouts
src/app/api/        documents/[id]/[variant], export, webhooks/paystack, cron/esign
src/components/esign/            pdf-pages, signing-wizard, signature-pad, document-editor, …
```

Vale la regola di `AGENTS.md`: le decisioni stanno in `src/lib/esign` come funzioni con i test accanto; i componenti mostrano; le azioni server autenticano, riconvalidano l'input e traducono gli errori.

## Ciclo di vita

`DRAFT → PENDING → COMPLETED`, con `REJECTED`, `CANCELLED` ed `EXPIRED` come uscite. `EXPIRED` si può riattivare.

1. **Caricamento.** `inspectPdf` controlla i magic byte, la leggibilità, la cifratura e il limite di 4 MB (sotto il limite di 4,5 MB di Vercel). L'originale viene salvato una volta e mai modificato.
2. **Configurazione.** Destinatari (firmatario, approvatore, lettore, CC), campi in percentuali della pagina, ordine di firma, scadenza, Sign & Pay opzionale.
3. **Invio.** Ogni destinatario riceve una scadenza e un'email con il proprio link. Dalla pagina del documento ogni link si può anche copiare o condividere su WhatsApp (`wa.me`) e SMS (`sms:`). "Inviato" compare solo per un'email che il provider ha accettato: ogni invio in `emails.ts` restituisce `sent`, `notConfigured` (nessuna chiave Resend, i link si condividono a mano) oppure `failed`, e il `sentAt` di un destinatario viene scritto solo in caso di successo. Un invito rifiutato lascia il documento attivo, sostituisce il banner "Sent!" con un avviso che dice quanti non sono stati consegnati, segna quei destinatari come "Email not delivered", e un promemoria o un reinvio rifiutato viene segnalato come errore con la possibilità di riprovare. Senza un provider email configurato, nemmeno lì si dichiara una consegna: `sentAt` resta vuoto, la pagina mostra "Email isn't configured: share the signing links manually" al posto del banner "Sent!", i destinatari sono segnati "Share link manually", e un promemoria o un reinvio viene rifiutato con lo stesso consiglio invece di essere registrato come inviato.
4. **Firma.** Ogni campo viene salvato appena compilato. Una firma disegnata o caricata viene controllata prima di essere salvata (`signature-image.ts`): il PNG o JPEG deve essere integro, di dimensioni ragionevoli e incorporabile da pdf-lib, altrimenti a chi firma viene chiesto di ridisegnarla. Conta perché pdf-lib entra in un ciclo infinito su un PNG danneggiato, quindi un'immagine rovinata già salvata impedirebbe per sempre di sigillare il documento; il sigillo esegue lo stesso controllo strutturale e fallisce con un errore invece di bloccarsi. `completeSigning` rifiuta finché mancano campi obbligatori o un pagamento.
5. **Sigillo.** Quando l'ultimo firmatario completa, `finalizeDocument`:
   - inserisce i campi e appiattisce i moduli;
   - aggiunge una pagina di certificato (hash, destinatari, registro di audit completo, evento di completamento incluso);
   - applica, se configurata, una firma digitale;
   - salva la copia sigillata sotto una chiave che porta il suo SHA-256;
   - poi, in **una sola transazione**, scrive lo stato `COMPLETED`, l'evento di audit `DOCUMENT_COMPLETED`, la chiave della copia sigillata e la sua impronta; solo dopo invia l'email a tutti.

   Due ultimi firmatari che completano insieme costruiscono entrambi un sigillo, ma solo un commit può rivendicare il documento: l'altro annulla e cancella il proprio file, quindi il file salvato è sempre quello di cui è registrato l'hash e il registro ha un solo completamento. Il commit viene rifiutato anche se un evento di audit è arrivato dopo la stampa del certificato, e il sigillo viene ricostruito. Una firma e il suo evento `RECIPIENT_SIGNED` sono a loro volta scritti in una sola transazione.
6. **Recupero.** Un errore prima di quel commit lascia il documento `PENDING` con tutti i firmatari completati, e niente scritto a metà. `recoverStuckFinalizations` (il cron giornaliero) completa questi documenti quando l'ultima firma ha più di 5 minuti (`FINALIZE_GRACE_MS` in `rules.ts`), e la pagina del documento del proprietario fa lo stesso dopo la risposta, così il proprietario raramente aspetta il cron. Un documento che la versione precedente in due passi aveva lasciato `COMPLETED` senza copia sigillata viene completato allo stesso modo.

In un documento sequenziale il firmatario successivo viene rivendicato (una scrittura protetta di `sentAt`) prima che parta la sua email "tocca a te", così due firmatari dello stesso gruppo che completano insieme la inviano una volta sola. Se l'email non parte, la rivendicazione viene rilasciata. `src/lib/esign/finalize-concurrency.db.test.ts` mette alla prova tutto questo contro un database vero (`ESIGN_DB_TESTS=1`).

## Le correzioni rispetto a DocuSign

- **Piani, applicati.** Cosa sblocca ogni piano è scritto una volta sola, in `plans.ts`, e controllato dal motore, non solo mostrato nella pagina dei prezzi:

  | | Gratuito | Personal | Business (e Lifetime) |
  |---|---|---|---|
  | Documenti da firmare | 1 in tutto (`FREE_SIGNATURE_REQUESTS`; erano 3 per mese solare) | illimitati | illimitati |
  | Quick Send, link WhatsApp/SMS | sì | sì | sì |
  | Sign & Pay, ordine di firma, approvatori | no | no | sì |
  | Pagina di certificato e sigillo digitale nel PDF firmato | no | no | sì |

  Il livello viene da `getEntitlement` (`senderPlan` in `sender.ts`): i piani `starter-*` sono Personal, `pro-*` e `lifetime` sono Business, qualsiasi altro piano a pagamento conta come Personal. `saveDocumentSetup` e `sendDocument` rifiutano una funzione Business su un piano inferiore con un codice di errore `plan_*`, che l'azione segna come `upgrade` perché il modulo mostri un pulsante Upgrade; il limite gratuito si controlla all'invio, perché è l'invio a consumarlo. L'editor blocca gli stessi controlli, e le pagine di caricamento mostrano a un account gratuito se la sua unica richiesta è ancora disponibile; una volta usata, un pannello di upgrade prende il posto del modulo di invio, e lo strumento pubblico per richiedere una firma mostra lo stesso upgrade a chi ha già effettuato l'accesso (`signatureRequestsLeft` in `src/app/actions/documents.ts`). I documenti inviati non si possono eliminare, quindi contarli dà un totale che nessuna eliminazione può azzerare. Il certificato dipende dal piano del proprietario al completamento del documento, ed è registrato sull'evento di audit `DOCUMENT_COMPLETED` (`data.certificate`), così la pagina del documento e l'email di completamento descrivono il PDF effettivamente prodotto. Un documento già inviato continua a funzionare dopo un downgrade: chi firma non viene mai fermato a metà. Enterprise si vende su contatto e gira sul piano Business; posti per il team e SSO non esistono ancora e non sono pubblicizzati.
- **Invii illimitati sui piani a pagamento.** Personal e Business non hanno tetto di buste. Quello che vale per ogni account allo stesso modo è la protezione contro gli abusi, in `sending-limits.ts`:
  - **Mittente confermato.** L'email del mittente deve essere confermata prima di qualsiasi azione che scrive ai destinatari: invio, Quick Send, promemoria, rinnovo, reinvio e correzione di un indirizzo. La regola è attiva quando `RESEND_API_KEY` è impostata; senza, nessuna email di conferma può partire e nessun invito lascia il server, quindi la regola è spenta. Chi non ha confermato vede un avviso nelle pagine Documenti, con un pulsante per farsi rimandare il link.
  - **10 destinatari per documento.**
  - **Un tetto giornaliero**, contato dal database sulle ultime 24 ore: 100 documenti e 300 destinatari, oppure 10 e 30 nei primi 7 giorni di vita dell'account.
  - **Limiti di raffica** nelle action: 10 invii e 30 caricamenti ogni 10 minuti per utente, 3 promemoria o rinnovi all'ora per documento, 10 correzioni di destinatari all'ora per utente, 5 reinvii all'ora per destinatario. Usano il rate limiter condiviso, che vale per singola istanza finché `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` non sono impostate.
- **Correggere o rinnovare senza ricostruire.** I campi sono legati alla riga del destinatario, quindi `updateRecipient` la modifica sul posto e **ruota il token**: il link mandato all'indirizzo sbagliato smette subito di funzionare. `renewDocument` estende tutti i link non firmati e riattiva un documento `EXPIRED`; i token restano gli stessi, quindi i link già condivisi tornano a funzionare.
- **Firma pensata per il telefono.** Un campo alla volta, una barra fissa con l'azione successiva, input in bottom sheet a misura di pollice, firma ricordata, nessuno scorrimento orizzontale a 360px (coperto da `e2e/responsive.spec.ts`).
- **Sign & Pay.** Stripe (Connect, destination charges) o Paystack (subaccount), dietro un'unica interfaccia `SignAndPayProvider`. Il pagamento è sempre verificato tramite l'API del provider, mai preso per buono dal corpo di un webhook o dall'URL di ritorno, e importo e valuta devono coincidere. Dopo il pagamento, la firma si completa da sola.
- **Riconciliazione di Sign & Pay.** Tutto quello che succede dopo il checkout è in `payments/settle.ts`, deciso da `payments/reconcile-rules.ts`:
  - **Un checkout per documento.** `startPayment` rivendica il pagamento sotto un lock per documento nel database. Chi ha già un checkout aperto ci viene rimandato (l'URL è sull'evento `PAYMENT_STARTED`), oppure gli si chiede di attendere mentre un'altra richiesta lo sta ancora aprendo, oppure ne riceve uno nuovo solo se il precedente è fallito o è stato abbandonato.
  - **Niente resta in sospeso.** `reconcilePayments` chiede al provider di ogni pagamento in sospeso da più di 10 minuti: dal cron giornaliero, e per un singolo documento quando il proprietario lo apre. Un checkout senza risposta per 48 ore viene chiuso.
  - **I documenti chiusi non incassano.** Annullare, far scadere o rifiutare un documento chiude i suoi checkout aperti (le sessioni Stripe vengono fatte scadere; Paystack non ha una chiamata equivalente). Un pagamento che arriva comunque, o un secondo pagamento di chi ha già pagato, viene rimborsato per intero: su Stripe con `reverse_transfer` e `refund_application_fee`, così tornano indietro anche il trasferimento al mittente e la commissione della piattaforma. Proprietario e pagante ricevono entrambi un'email.
  - **Rimborsi e chargeback vengono registrati** dai webhook, una volta per evento del provider: `PAYMENT_REFUNDED` (un rimborso totale rende il pagamento `REFUNDED`), `PAYMENT_DISPUTED` (il mittente riceve un'email) e `PAYMENT_DISPUTE_CLOSED` (una contestazione persa lo rende `REFUNDED`). Compaiono nel registro di audit del documento e in `/admin/moderation`.
  - **Eventi webhook da abilitare.** Stripe: `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` (oltre agli eventi degli abbonamenti e ad `account.updated`). Paystack: `charge.success`, `refund.processed`, `charge.dispute.create`, `charge.dispute.resolve`.

  `payments/reconcile.db.test.ts` mette alla prova tutto questo contro un database vero (`ESIGN_DB_TESTS=1`).
- **Quick Send.** PDF + email → inviato. Per ogni firmatario vengono posizionati un campo firma e un campo data (`quick-send.ts`).
- **Fatturazione onesta.**
  - Annullamento e ripristino dall'app, non solo dal portale Stripe.
  - La data di rinnovo è mostrata nella pagina di fatturazione.
  - Un'email parte 7 giorni (mensile) o 14 giorni (annuale) prima di ogni rinnovo.
  - `/api/export` genera in streaming uno ZIP con tutti gli originali, i PDF sigillati e i registri di audit, su qualsiasi piano e anche dopo l'annullamento.

## Verifica pubblica

Ogni copia sigillata riporta sulla pagina di certificato un codice di verifica (`XXXX-XXXX-XXXX`) e un codice QR. Entrambi portano a `/verify`, una pagina pubblica dove chiunque abbia il PDF può controllare che sia un documento autentico e completato: quando è stato sigillato, chi l'ha firmato (nomi, ruoli, date di firma, email mascherate come `a•••@example.com`) e le sue impronte SHA-256. Titolo e contenuto non vengono mai mostrati. Il visitatore può anche trascinare il PDF sulla pagina: viene calcolata l'impronta nel suo browser e si confronta solo quella, così un file modificato o salvato di nuovo viene segnalato.

Si verificano solo i documenti completati e sigillati; tutto il resto risponde "non trovato", così la pagina non rivela che esiste un documento in attesa. Le ricerche sono limitate per IP. I documenti sigillati prima dei codici si verificano con l'ID del documento, che il loro certificato già riporta. Le regole sono in `src/lib/esign/verify.ts`.

## Promemoria via SMS

Chi invia può attivare i promemoria via SMS per un documento, nell'editor o in seguito dalla pagina del documento. Ogni promemoria (quello automatico ogni tre giorni, o il pulsante Ricorda) invia allora anche un SMS a ogni firmatario in attesa che abbia un numero con prefisso internazionale. Gli inviti restano solo via email. Il fornitore è la REST API di Twilio (`src/lib/esign/sms.ts`). Senza credenziali reali l'opzione non compare e non parte nulla, quindi i segnaposto di `.env.example` si possono pubblicare senza rischi.

## Configurazione

| Variabile | Serve per |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Archiviazione dei file in produzione. **Obbligatoria in produzione.** In sviluppo, senza, i file vanno in `.data/storage`. |
| `CRON_SECRET` | `/api/cron/esign` (scadenze, promemoria, recupero dei sigilli rimasti a metà, avvisi di rinnovo). Gira ogni giorno secondo `vercel.json`. **Obbligatoria in produzione.** |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email. **Obbligatorie in produzione.** In sviluppo, senza, i link di firma vengono scritti nel log e si possono comunque condividere dalla dashboard. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Sign & Pay tramite Stripe. Attiva anche Connect e aggiungi `account.updated` agli eventi del webhook. |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_COUNTRY` | Sign & Pay tramite Paystack. Punta un webhook a `/api/webhooks/paystack`. Il paese predefinito è `ghana`. |
| `SIGN_AND_PAY_FEE_BPS` | Commissione della piattaforma opzionale, in punti base (150 = 1,5%). Predefinita 0. |
| `SIGNING_P12_BASE64`, `SIGNING_P12_PASSPHRASE` | Sigillo digitale opzionale: un certificato PKCS#12 in base64. Senza, i PDF sono sigillati con pagina di certificato e hash SHA-256, ma senza firma crittografica. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (o `TWILIO_MESSAGING_SERVICE_SID`) | Promemoria via SMS opzionali. La funzione resta spenta finché tutti i valori non sembrano reali (`AC` + 32 cifre esadecimali, un token di 32, un numero con `+` o un servizio `MG`). `SMS_REMINDERS_ENABLED="false"` la spegne lasciando le credenziali al loro posto. |

## Limiti noti

- I PDF sono limitati a 4 MB. File più grandi richiedono un caricamento diretto dal browser a Blob.
- Firme digitate e testi usano i font PDF standard, quindi i caratteri fuori da Latin-1 vengono sostituiti nel PDF sigillato. Per superare il limite, incorpora un font Unicode in `pdf/seal.ts`.
- Le pagine PDF ruotate vengono stampate in coordinate non ruotate.
- Il sigillo digitale è PKCS#7 (`adbe.pkcs7.detached`), non PAdES-LTV con autorità di marcatura temporale.
