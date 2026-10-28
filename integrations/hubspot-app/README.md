# HubSpot app (developer project)

The HubSpot public app Salsox connects through (docs/integrations.md). It
exists because HubSpot stopped creating new public apps from its website in
2026: an app is now a "developer project" uploaded with the HubSpot CLI
(`@hubspot/cli`), and these files are that project. The JSON files cannot
carry comments, so this note explains them.

- `hsproject.json`: the project's name (fixed once uploaded), where its
  source lives, and the developer platform version.
- `src/app/app-hsmeta.json`: the app itself.
  - `auth.redirectUrls` must be exactly where the app's callback is,
    `<site>/api/integrations/hubspot/callback` (src/lib/integrations/hubspot.ts).
  - `auth.requiredScopes` must match HUBSPOT_DEFAULT_SCOPES in that file, or
    HUBSPOT_SCOPES when it is set, or HubSpot refuses the connection.
  - `permittedUrls` is empty because the app has no UI extensions yet.

Changing either file does nothing until it is uploaded, from this folder:
`hs project validate`, then `hs project upload`, with the CLI signed in
(`hs account auth`; the key is kept in the user's home folder, never here).

The app's Client ID and Client secret are shown in HubSpot under
Development, Projects, salsox, the app, Auth tab, "Client credentials". They
go in HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET, never in this folder.
