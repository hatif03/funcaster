Review corrections required before final source export. Do not deploy or sign anything; local compile/tests only.

The current source incorrectly takes venue and referral shares from the platform fee. These are percentages of the gross payment, separate from the platform fee. Guide24 example after the free band: 1 USDC, shelf referral10%, venue10% = creator70%, platform10%, venue10%, referrer10%. During the free band platform0%, venue10%, referral10%, creator80%. Correct _allocate and tests and documentation.

PayRequest and PassPermit must include signed bool referred and bool atVenue in addition to bool attribution (creator-brought). Only allocate configured venue if atVenue; only allocate configured referral if referred; reject true if no configured recipient. A creator's own link (attribution true) must not also use external referral (referred true). Nobody may change these fields between payer signing and submission.

Claim destination must equal recipient (fixed destination) as the original prompt required. Collaborator max is five TOTAL including creator; therefore array max is four. Align pass expiry to now + 24 hours (payment renewal resets expiry, does not stack). Keep per-creator lifetime free band across versions and all source generation provenance in this same separate app.

Add/adjust focused tests for gross-based fee allocation (including free band), signed slot booleans, fixed claim destination, max total5 recipient count, and exact match with integer split example. Export a concise public ABI JSON and artifact JSON with creation/deployed bytecode and source metadata, and final local test count. These are coding corrections only; no public deployment, funding, signing, or broadcasting.
