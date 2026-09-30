---
title: Firme elettroniche
description: Il motore di firma di Salsox, dal caricamento al PDF sigillato, con Sign & Pay, Quick Send e fatturazione onesta.
translated_from: esign.md
source_checksum: a369c479047e
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
  pdf/              inspect.ts (controlli sul caricamento), coords.ts, seal.ts
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
3. **Invio.** Ogni destinatario riceve una scadenza e un'email con il proprio link. Dalla pagina del documento ogni link si può anche copiare o condividere su WhatsApp (`wa.me`) e SMS (`sms:`). "Inviato" compare solo per un'email che il provider ha accettato: ogni invio in `emails.ts` restituisce `sent`, `notConfigured` (nessuna chiave Resend, i link si condividono a mano) oppure `failed`, e il `sentAt` di un destinatario viene scritto solo in caso di successo. Un invito rifiutato lascia il documento attivo, sostituisce il banner "Sent!" con un avviso che dice quanti non sono stati consegnati, segna quei destinatari come "Email not delivered", e un promemoria o un reinvio rifiutato viene segnalato come errore con la possibilità di riprovare.
4. **Firma.** Ogni campo viene salvato appena compilato. `completeSigning` rifiuta finché mancano campi obbligatori o un pagamento.
5. **Sigillo.** Quando l'ultimo firmatario completa, `finalizeDocument`:
   - rivendica in modo atomico il passaggio a `COMPLETED`;
   - inserisce i campi e appiattisce i moduli;
   - aggiunge una pagina di certificato (hash, destinatari, registro di audit completo);
   - applica, se configurata, una firma digitale;
   - salva la copia sigillata e invia l'email a tutti.

   Se il sigillo fallisce, lo sweep del cron riprova.

## Le correzioni rispetto a DocuSign

- **Invii illimitati.** Nessun piano ha un tetto di buste e l'invio non legge l'abbonamento. Quello che vale per ogni account allo stesso modo è la protezione contro gli abusi, in `sending-limits.ts`:
  - **Mittente confermato.** L'email del mittente deve essere confermata prima di qualsiasi azione che scrive ai destinatari: invio, Quick Send, promemoria, rinnovo, reinvio e correzione di un indirizzo. La regola è attiva quando `RESEND_API_KEY` è impostata; senza, nessuna email di conferma può partire e nessun invito lascia il server, quindi la regola è spenta. Chi non ha confermato vede un avviso nelle pagine Documenti, con un pulsante per farsi rimandare il link.
  - **10 destinatari per documento.**
  - **Un tetto giornaliero**, contato dal database sulle ultime 24 ore: 100 documenti e 300 destinatari, oppure 10 e 30 nei primi 7 giorni di vita dell'account.
  - **Limiti di raffica** nelle action: 10 invii e 30 caricamenti ogni 10 minuti per utente, 3 promemoria o rinnovi all'ora per documento, 10 correzioni di destinatari all'ora per utente, 5 reinvii all'ora per destinatario. Usano il rate limiter condiviso, che vale per singola istanza finché `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` non sono impostate.
- **Correggere o rinnovare senza ricostruire.** I campi sono legati alla riga del destinatario, quindi `updateRecipient` la modifica sul posto e **ruota il token**: il link mandato all'indirizzo sbagliato smette subito di funzionare. `renewDocument` estende tutti i link non firmati e riattiva un documento `EXPIRED`; i token restano gli stessi, quindi i link già condivisi tornano a funzionare.
- **Firma pensata per il telefono.** Un campo alla volta, una barra fissa con l'azione successiva, input in bottom sheet a misura di pollice, firma ricordata, nessuno scorrimento orizzontale a 360px (coperto da `e2e/responsive.spec.ts`).
- **Sign & Pay.** Stripe (Connect, destination charges) o Paystack (subaccount), dietro un'unica interfaccia `SignAndPayProvider`. Il pagamento è sempre verificato tramite l'API del provider, mai preso per buono dal corpo di un webhook o dall'URL di ritorno, e importo e valuta devono coincidere. Dopo il pagamento, la firma si completa da sola.
- **Quick Send.** PDF + email → inviato. Per ogni firmatario vengono posizionati un campo firma e un campo data (`quick-send.ts`).
- **Fatturazione onesta.**
  - Annullamento e ripristino dall'app, non solo dal portale Stripe.
  - La data di rinnovo è mostrata nella pagina di fatturazione.
  - Un'email parte 7 giorni (mensile) o 14 giorni (annuale) prima di ogni rinnovo.
  - `/api/export` genera in streaming uno ZIP con tutti gli originali, i PDF sigillati e i registri di audit, su qualsiasi piano e anche dopo l'annullamento.

## Configurazione

| Variabile | Serve per |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Archiviazione dei file in produzione. **Obbligatoria in produzione.** In sviluppo, senza, i file vanno in `.data/storage`. |
| `CRON_SECRET` | `/api/cron/esign` (scadenze, promemoria, nuovo sigillo, avvisi di rinnovo). Gira ogni giorno secondo `vercel.json`. **Obbligatoria in produzione.** |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email. **Obbligatorie in produzione.** In sviluppo, senza, i link di firma vengono scritti nel log e si possono comunque condividere dalla dashboard. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Sign & Pay tramite Stripe. Attiva anche Connect e aggiungi `account.updated` agli eventi del webhook. |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_COUNTRY` | Sign & Pay tramite Paystack. Punta un webhook a `/api/webhooks/paystack`. Il paese predefinito è `ghana`. |
| `SIGN_AND_PAY_FEE_BPS` | Commissione della piattaforma opzionale, in punti base (150 = 1,5%). Predefinita 0. |
| `SIGNING_P12_BASE64`, `SIGNING_P12_PASSPHRASE` | Sigillo digitale opzionale: un certificato PKCS#12 in base64. Senza, i PDF sono sigillati con pagina di certificato e hash SHA-256, ma senza firma crittografica. |

## Limiti noti

- I PDF sono limitati a 4 MB. File più grandi richiedono un caricamento diretto dal browser a Blob.
- Firme digitate e testi usano i font PDF standard, quindi i caratteri fuori da Latin-1 vengono sostituiti nel PDF sigillato. Per superare il limite, incorpora un font Unicode in `pdf/seal.ts`.
- Le pagine PDF ruotate vengono stampate in coordinate non ruotate.
- Il sigillo digitale è PKCS#7 (`adbe.pkcs7.detached`), non PAdES-LTV con autorità di marcatura temporale.
