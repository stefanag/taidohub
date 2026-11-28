# Turning the staging server into production

This runbook turns the existing server `taidohub-staging` into production. Afterwards the same
machine serves `https://taidohub.se`, and `staging.taidohub.se` is retired until a new staging
server is created. The main [README](README.md) describes a setup with two servers; this is the
shortcut for starting with one.

Plan about an hour. The site is down for about 15 minutes, between step 6 and step 8.

## What changes

| | Before | After |
| --- | --- | --- |
| Address | `https://staging.taidohub.se` | `https://taidohub.se` |
| Hetzner server | `taidohub-staging`, no backup, no protection | `taidohub-production`, Hetzner Backup, delete and rebuild protection |
| GitHub environment that deploys to it | `staging`, automatically after CI on `main` | `production`, manually with your approval |
| Swagger UI at `/api/docs` | On | Off |
| Google OAuth client | The staging client | A production client |
| Database | Test and demo data | Empty, seeded fresh (option A, recommended) |

Three things in the app depend on the domain, which is why each step below matters:

- The web image has the API address built in when it is built (`VITE_API_URL`). An image built
  for staging cannot run as production; production must be built by the `production` deploy.
- `BETTER_AUTH_URL`, `WEB_ORIGIN` and `WEB_APP_URL` all come from `SITE_DOMAIN` in `.env`
  (see `compose.yaml`). Everyone is signed out when the domain changes, and links already sent by
  email (invitations, password resets) stop working.
- The seed refuses demo data when the address is `taidohub.se`.

## Decide first

**Database: start empty (A) or keep staging's data (B)?**

- **A. Start empty (recommended).** Staging holds demo users, test accounts and test acceptances
  of draft legal texts. Those acceptances would otherwise stay on record as if they were real.
  The seed recreates the sysadmin and all reference data: organisations, belt systems,
  techniques, patterns and grading requirements. Legal texts you have written in
  **Admin → Legal documents** are lost, so copy their text out before step 6 and enter it again
  in production.
- **B. Keep the data.** Only choose this if staging holds something you cannot recreate. Before
  you invite anyone, remove the demo club and the test users in **Admin → Users**. Keep the
  existing `BETTER_AUTH_SECRET` (see step 5).

**Staging afterwards.** This runbook leaves you without a staging environment. To get one back,
create a new server later (the last section).

## 0. The day before

1. At the registrar, lower the TTL on the `taidohub.se` zone to 300 seconds, so the DNS change in
   step 3 takes effect quickly.
2. Merge everything that should be in the first production release, and check that the latest
   staging deploy works.
3. In **Admin → Legal documents** on staging, copy the texts you want to keep (option A).

## 1. Stop automatic deploys to this server

Otherwise the next merge to `main` deploys a staging build onto production.

1. Settings › Secrets and variables › Actions › **Variables**: add the repository variable
   `STAGING_AUTO_DEPLOY` with the value `false`. The Deploy workflow then skips the automatic
   run after CI. Manual runs still work.
2. Settings › Environments › **staging**: delete the secrets `DEPLOY_HOST`, `DEPLOY_SSH_KEY` and
   `DEPLOY_KNOWN_HOSTS`. A manual staging run can then no longer reach the server.
3. Settings › Environments › **production** (create it if it does not exist):
   - secret `DEPLOY_HOST`: the server's IPv4, the same address staging used;
   - secret `DEPLOY_SSH_KEY`: the same deploy key as staging (the contents of `taidohub-deploy`);
   - secret `DEPLOY_KNOWN_HOSTS`: the output of `ssh-keyscan -t ed25519 <ip>`;
   - variable `SITE_URL`: `https://taidohub.se`;
   - Deployment protection rules › Required reviewers: add yourself.

## 2. Rename and protect the server in Hetzner

On your own machine, with `hcloud` and the same API token as for `provision.sh`:

```bash
export HCLOUD_TOKEN=...
hcloud server update taidohub-staging --name taidohub-production
hcloud server add-label --overwrite taidohub-production env=production
hcloud server enable-backup taidohub-production
hcloud server enable-protection taidohub-production delete rebuild
hcloud server ip taidohub-production        # IPv4, for DNS
hcloud server ip -6 taidohub-production     # IPv6, for DNS
```

You can do the same in Hetzner Console: server › Rename, Backups › Enable, and Protection.
Hetzner Backup costs 20% of the server price. Renaming does not change the IP addresses.

## 3. DNS

At the registrar, add the following records:

```
taidohub.se    A     <IPv4 from step 2>
taidohub.se    AAAA  <IPv6 from step 2>
```

Keep the `staging.taidohub.se` records until step 10. Check from your machine:

```bash
dig +short taidohub.se A
dig +short taidohub.se AAAA
```

Do not continue until both answer with the server's addresses. Caddy can only get the
certificate for `taidohub.se` once DNS points at the server.

`www.taidohub.se` is not configured. Each environment has exactly one origin; add a redirect
later if you want one.

## 4. Google and Brevo

**Google** (README, section 8): in Google Cloud Console › Credentials, create an OAuth client for
production, type Web application, with this authorised redirect URI:

```
https://taidohub.se/api/auth/callback/google
```

Keep the staging client for the future staging server, or delete it. Check that the consent
screen is **In production**, not Testing.

**Brevo** (README, section 7): the sender `noreply@emails.taidohub.se` stays the same. Create a
new SMTP key named `production` and revoke the staging key afterwards, so the old key in your
password manager no longer works.

## 5. Back up, then change `.env` on the server

```bash
ssh deploy@<ip>
cd /opt/taidohub
./backup.sh --local-only                       # dump in /var/backups/taidohub/
ls -t /var/backups/taidohub/ | head -1         # note the file name
cp .env .env.staging-backup
```

Copy the dump to your own machine. The server keeps dumps for only three days:

```bash
scp deploy@<ip>:/var/backups/taidohub/<file>.dump .
```

Edit `.env`:

```bash
sed -i 's/^SITE_DOMAIN=.*/SITE_DOMAIN=taidohub.se/' .env
sed -i 's/^ENABLE_SWAGGER=.*/ENABLE_SWAGGER=false/' .env
sed -i 's/^RESTIC_REPOSITORY=.*/RESTIC_REPOSITORY=sftp:storagebox:taidohub-production/' .env
nano .env    # GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (production client), SMTP_PASSWORD (new key)
```

The `RESTIC_REPOSITORY` line only matters if backups to the Storage Box are set up. If they are,
initialise the new repository as root before the next nightly run:
`sudo -i`, then `set -a; source /opt/taidohub/.env; set +a; restic init`.

**Option A only:** give production its own secrets. A new database picks up the new password the
first time it starts.

```bash
sed -i "s/^BETTER_AUTH_SECRET=.*/BETTER_AUTH_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
```

**Option B:** keep both values. Changing `BETTER_AUTH_SECRET` with the old database breaks the
stored signing keys, and changing `POSTGRES_PASSWORD` does not change the existing database's
password.

Save the new `.env` in the password manager as "TaidoHub production", replacing the staging
entry.

## 6. Empty the database (option A only)

This deletes all of staging's data. The dump from step 5 is the only way back.

```bash
cd /opt/taidohub
docker compose --env-file .env --env-file .image.env down
docker volume rm taidohub_pgdata
```

The site is down from here until step 8.

For option B, skip this step.

## 7. Deploy production

Actions › Deploy › Run workflow, then:

1. Choose **production** and approve the run.
2. The workflow builds the images with `https://taidohub.se`, starts a new database if step 6
   removed it, runs the migrations and starts the app.
3. The smoke test waits up to three minutes for `https://taidohub.se/api/health`. Caddy gets the
   certificate during that time.

If the smoke test fails, check `docker compose --env-file .env --env-file .image.env logs web`
on the server. The usual cause is DNS that does not point at the server yet.

## 8. Seed (option A only)

```bash
ssh deploy@<ip>
/opt/taidohub/seed.sh admin@taidohub.se      # asks for the sysadmin password
```

Never use `SEED_DEMO_DATA` (the app refuses it on `taidohub.se`) or `SEED_CLUB_MEMBERS`. The club
roster contains real names and a shared password.

## 9. Check

- [ ] `https://taidohub.se` loads, and a deep link such as `https://taidohub.se/admin/users` loads
      directly.
- [ ] Sign-in with email and password works.
- [ ] **Forgot password?** sends an email, and its link starts with `https://taidohub.se`.
- [ ] Sign-in with Google works, and so does **Profile → Ways to sign in → Connect Google**.
- [ ] `https://taidohub.se/api/docs` answers 404 (Swagger is off).
- [ ] **Admin → Feature flags**: all flags start off on a new database. Turn on the ones you
      want, for example `self-registration` once the legal texts are published.
- [ ] **Admin → Legal documents**: enter and publish the platform texts before turning on
      self-registration.
- [ ] Hetzner Console shows Backups enabled and protection on the server.
- [ ] As root: `/opt/taidohub/backup.sh` runs without errors, and
      `systemctl status taidohub-backup.timer` is active (if the Storage Box is set up).
- [ ] An external monitor checks `https://taidohub.se/api/health`.
- [ ] AI clients connected over MCP on staging must be connected again: the server address has
      changed.

Also go through "Before real member data goes in" in the README.

## 10. Retire `staging.taidohub.se`

Once production works, delete the `staging.taidohub.se` A and AAAA records at the registrar.
Nothing answers on that address now. Raise the zone's TTL again if you lowered it.

Keep `.env.staging-backup` and the staging dump for a few weeks, then delete them.

## If something goes wrong

**Before step 6 nothing is lost.** To return to staging:

1. Restore `.env` from `.env.staging-backup`.
2. Run `./deploy.sh <latest staging tag>` (the tag is in `.image.env.prev` or `.image.env`).
3. Remove `STAGING_AUTO_DEPLOY` and put the staging environment's secrets back.

**After step 6 (option A),** the staging data comes back only from the dump. Restore `.env` as
above, then:

```bash
sudo /opt/taidohub/restore.sh /var/backups/taidohub/<file>.dump
```

If the dump is no longer on the server, copy it back from your machine first.

## Later: a new staging server

1. `./provision.sh staging` creates a new `taidohub-staging` (README, section 1).
2. Point `staging.taidohub.se` at its addresses (section 2).
3. Follow sections 3 to 8 for that server, with `SITE_DOMAIN=staging.taidohub.se` and its own
   secrets.
4. Put the new server's `DEPLOY_HOST`, `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` in the `staging`
   environment.
5. Delete the repository variable `STAGING_AUTO_DEPLOY` (or set it to `true`), so merges deploy
   to staging automatically again.
