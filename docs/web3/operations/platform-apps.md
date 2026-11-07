# SL17 registration and audit preparation

2026-11-06 — **DRAFT / NOT SUBMITTED**. The owner has no platform accounts yet and will supply them later. This starts the preparation; no platform review clock is running. App IDs, callbacks, quota and legal answers are unresolved. Do not fabricate them or assert that planned controls already exist.

## Product description draft

Funcaster is a browser party-game console: a TV/laptop runs the game and players join by QR code using their phones as controllers. The working console has thirteen games. A planned streamer gateway will connect a consenting broadcaster's live chat to phone pairing and bounded cosmetic overlay effects. The gateway is not implemented yet. Platform payments will remain on the platform: their amounts will not become game currency, stakes, blockchain payments or prizes. Effects will not change game results. A broadcaster kill command, event verification, deduplication, moderation and quota controls are planned and must be demonstrated before claiming them in an application.

## Owner checklist and registration order

1. Create/select the owning Google, Twitch and Kick accounts. Retain recovery access and complete account verification/2FA yourself. Keep business identity consistent across applications.
2. Choose the HTTPS staging origin and public app/privacy/deletion pages. The exact OAuth redirect and webhook routes will be finalized when SL1/SL2 are built; **no callback URL is implemented today**. Do not register guessed endpoints.
3. Google: create/select Cloud project, record public project ID and number, enable YouTube Data API, configure consent/testing users and request the minimum scopes supported by the adapter. Store client secret only in `.env.gateway`. OAuth verification and a YouTube API quota audit are separate reviews.
4. Twitch: Developer Console → Register Application, verified email/2FA, name/category and exact callback. Complete CAPTCHA yourself. Save the client ID in the local gateway env and the secret in its secret store. Never rotate an existing app secret accidentally. [Official registration steps](https://dev.twitch.tv/docs/authentication/register-app).
5. Kick: enable 2FA → account Developer tab → create app with exact redirect. The OAuth flow uses authorization code + PKCE. Keep secrets in the gateway only. [Official setup](https://github.com/KickEngineering/KickDevDocs/blob/main/getting-started/kick-apps-setup.md).
6. YouTube audit: assemble the evidence below, review every factual answer and legal declaration, then have the owner submit. [Current form](https://support.google.com/youtube/contact/yt_api_form) and [audit guidance](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits). Do not choose periodic re-audit unless Google requested one. Do not request invented quota.

## Audit packet to complete

- Legal applicant/contact, address and website; organization/individual classification (owner supplies privately).
- Public project IDs/numbers, API client name, HTTPS app and policy URLs; actual current quota and usage from Cloud Console.
- Implemented vs planned API operations, minimal OAuth scopes, consent/revocation/deletion flows, retention behavior and actual data model. None of the streamer controls may be marked implemented yet.
- Measured calls per stream-hour and expected concurrent channels; calculate requested quota from current documented method costs and reconnect/polling behavior. Guide 25's dated quota assumptions must be rechecked against the actual project.
- A working test channel and screencast: consent → chat/phone link → cosmetic effect → kill → revoke/delete. Provide review access by the platform's supported secure method, not credentials in this repo.
- Owner-approved business model description. The guide's pricing is a hypothesis, not current revenue/traction.
- Owner review of all attestations; submission date, case ID and follow-up requests after actual submission.

## Policy clarification drafts (not sent)

For Twitch/Kick support: describe the planned cosmetic-only trigger flow, ask whether that precise model requires additional review, and request written confirmation. Explicitly state no conversion to coins, wagering, gameplay advantage or off-platform reward. Attach working evidence when available. Sending these messages is a separate owner action; no confirmation has been obtained.

## Resume log

| Platform | App created | Review submitted | Evidence / next action |
| --- | --- | --- | --- |
| Google / YouTube | No | No | Owner account + project, client evidence, quota calculation, legal review |
| Twitch | No | No | Owner account + 2FA, origin, registration and trigger-model confirmation |
| Kick | No | No | Owner account + 2FA, origin, registration and trigger-model confirmation |
