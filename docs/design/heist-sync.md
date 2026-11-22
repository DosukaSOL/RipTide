# Heist Ops crew rooms (planned, not built)

Heist Ops plans live on one device today. You share a plan by exporting a file and sending it to your crew. Crew rooms would let everyone edit the same plan live. This note records the plan.

## What a crew room is

- One plan, shared by up to 8 people through an invite link.
- Changes appear for everyone within a second.
- Works offline. Edits merge when you reconnect.
- The plan owner can remove people and close the room.

## How it would work

- **Data:** the plan format already in `packages/tools/src/heist.ts`. Sync would use a CRDT (for example Yjs) so offline edits merge without conflicts. Notes are text, roles and phases are lists, checklist items are toggles.
- **Transport:** a small relay that forwards encrypted updates. It stores the latest encrypted state so late joiners can catch up.
- **Privacy:** end-to-end encrypted. The key is in the invite link's `#fragment`, which browsers never send to a server, so the relay can't read plans. No accounts: a display name is enough. Rooms expire after 30 days without activity.
- **Abuse limits:** rate limits per room and per connection, plan size capped by the existing schema limits (16 roles, 12 phases, 8,000 characters of notes).

## What it won't do

- No voice or chat. Crews already have Discord.
- No GTA VI data. Plans stay templates the crew fills in.
- No reading the game to tick phases off automatically.

## Open questions

- Who runs the relay, and what it costs. It would arrive with RipTide hosting.
- Whether Discord sign-in is worth adding so rooms can be tied to a server's members.

## When

With RipTide hosting (Roadmap phase 2). The file export works until then.
