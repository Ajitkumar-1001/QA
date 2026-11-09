# Operations

Every piece of environment and deploy state lives here, not in anyone's head. Fill in each entry when the thing it describes is created.

| Item | Value |
|---|---|
| Vercel team | `ajits-projects-b59ab691` (Hobby) |
| Vercel project | _not created yet_. Exactly one project. |
| GitHub repo | _not created yet_. Branch protection and a required check from the first commit. No auto-merge. |
| Databases | _not created yet_. Separate dev and prod databases. |
| Migrations | _not set up yet_. Gated: prod is migrated before deploy, never as a side effect of a push. |
| Env schema | _not set up yet_. A checked-in, validated schema. `.env*` files are never committed. |
| Encryption keys | _none yet_. Each ciphertext stores a key id so keys can be rotated. |

## Rules

- A red `main` blocks feature work.
- One feature is in flight at a time.
- No swarm or daemon tooling layer.
