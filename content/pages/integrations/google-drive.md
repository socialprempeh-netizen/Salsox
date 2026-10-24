---
title: "Sign PDFs from Google Drive with {site}"
description: "Send a PDF stored in Google Drive for signature from your phone or computer, and keep the signed copy in Drive. What works today, step by step."
h1: "Google Drive and {site}: sign the PDFs you keep in Drive"
lede: "Your contracts already live in Google Drive. You can send any PDF from Drive for signature today, from a phone or a computer, and put the signed copy back in the folder it came from. There is nothing to connect."
primaryKeyword: "google drive esignature"
aliases: ["sign pdf from google drive", "google drive document signing", "save signed pdf to google drive", "google docs esignature"]
published: 2026-10-24
updated: 2026-10-24
breadcrumb: "Google Drive"
integration: { name: "Google Drive", status: "works-today", url: "https://drive.google.com" }
faq:
  - q: "Do I have to give {site} access to my Google Drive?"
    a: "No. You pick a file the way you pick any attachment, and only that file is uploaded. {site} never sees the rest of your Drive."
  - q: "Can I send a Google Doc, not a PDF?"
    a: "Download it as a PDF first, from File, Download, PDF document in Google Docs. {site} signs PDFs, which keeps the layout exactly as your recipient will see it."
  - q: "Will the signed PDF save itself back to Drive?"
    a: "Not automatically: there is no Drive connection that writes files. Download the signed copy from the completion email or the dashboard, then upload it to the folder you want, as described on this page."
related: ["/sign-pdf", "/send-documents-for-signature", "/integrations/gmail", "/templates", "/esignature-for/remote-teams"]
---

## How the two fit together

{site} takes a PDF, places signature fields on it and sends it to the people who must sign. It does not need a connection to Google Drive to do that, because every phone and computer can already hand it a file from Drive. That is deliberate: a document you choose is the only document {site} receives, and there is no standing permission to read your folders.

## Sending a PDF from Drive on a phone

On **Android**, open {site}, start a new document and tap the upload area. The system file picker opens; choose **Drive** from its menu, find the PDF, and tap it. On an **iPhone or iPad**, the picker is the Files app: tap **Browse**, then **Google Drive** under Locations. If Drive is not listed, open the Google Drive app once, then turn it on under **More locations** in Files. Either way the PDF uploads straight into the editor, ready for fields.

## Sending from Drive on a computer

In Google Drive, right-click the file and choose **Download**, then drag the PDF from your downloads into the {site} upload area. For a **Google Doc**, open it and use **File > Download > PDF document** first. A Google Sheet works the same way; set the print area and orientation in the download dialog so the page breaks fall where you expect.

## Keeping the signed copy in Drive

When everyone has signed, each person receives an email with a button to download the signed PDF, and the sender can also download it from the document's page in the dashboard. Upload it to Drive with **New > File upload**, or drag it into the folder in your browser. A naming habit helps later searches: the client, the document and the date, such as *Acme - Service agreement - 2026-10-24.pdf*.

On the Business plan, the signed PDF carries a certificate page listing each signer, the time and the device, so the copy in Drive holds its own evidence and does not depend on anyone keeping an account.

## Shared drives and teams

Teams that keep contracts in a shared drive can follow the same routine: one person sends from {site}, and the finished PDF goes into the shared folder for everyone. Drive's version history then shows who added the signed copy and when.

## What is not available

There is no button inside Google Drive that sends a file to {site}, and no automatic filing of signed copies into a Drive folder. If either would save your team real time, say so on the contact page. Meanwhile the steps above take under a minute, and the [templates](/templates) library avoids the round trip for common documents altogether.
