# HTTPS staging — pending owner destination

Updated 2026-11-06. Vercel is the owner's tentative preference, not a final deployment decision. No account, domain or budget has been supplied, and nothing has been deployed.

Vercel now supports WebSockets/Socket.IO. Its [current documentation](https://vercel.com/docs/functions/websockets) states that connections close at the function's duration limit, reconnects can land on another instance, and durable rooms/presence need external storage. Funcaster currently keeps rooms in one Node process and uses a filesystem outbox shared with a separate worker. Therefore **uploading this repository as a Vercel Function is not a verified deployment path**. That is a code/runtime mismatch, not a blanket claim that Vercel lacks WebSockets.

Retain the guide 08 architecture for the first staging deployment: one persistent relay process, one isolated worker process, a writable persistent volume, a same-host TLS proxy and one public HTTPS origin. A gateway is separate when built. Vercel may host public static pages, or a suitable backend may sit alongside it, but the phone/socket origin and room affinity must be tested before choosing that split. Do not change the game's room architecture as an incidental hosting workaround.

Pending owner inputs: account/project, final domain, maximum spend. Then verify cold start/restart, four phones on cellular, reconnect after connection lifetime, room continuity, shared outbox durability, worker kill/restart, callback/webhook HTTPS and privacy/deletion pages. Deploy only the integration branch as a separate staging service; never replace main's service.
