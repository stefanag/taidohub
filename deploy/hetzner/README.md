# TaidoHub on Hetzner: staging and production

Two servers in Helsinki, one per environment. Each runs the same three containers with Docker Compose:

| Container | What | Exposed |
| --- | --- | --- |
| `web` | Caddy: TLS, the SPA, and a reverse proxy to `app` | Ports 80 and 443 |
| `app` | NestJS backend, including better-auth and, later, MCP | No, internal only |
| `db` | PostgreSQL 18 | Only on the server's `127.0.0.1` (reach it through an SSH tunnel) |

Each environment is a single origin: `https://taidohub.se` and `https://staging.taidohub.se`. Caddy
sends `/api/*` and `/.well-known/oauth-*` to the backend and everything else to the SPA.

**Backups:** `pg_dump` every night and before every deploy, encrypted and sent to a Hetzner Storage
Box with restic. Hetzner Backup also takes a daily snapshot of the whole production server.

**Deploys:** GitHub Actions builds two images per environment, pushes them to GitHub Container
Registry (GHCR) and runs `deploy.sh` on the server over SSH. Staging deploys automatically when CI
passes on `main`; production is a manual run that needs a reviewer's approval.

## Cost

List prices excluding VAT, November 2026.

| Item | Per month |
| --- | --- |
| 2 × CX23 (2 vCPU, 4 GB), IPv4 included | 2 × €5.99 |
| Hetzner Backup for the production server (20% of the server price) | about €1.20 |
| Storage Box BX11 (1 TB) for backups | €3.20 |
| **Total** | **about €16** |

If CX23 cannot be ordered (Hetzner marked plans unavailable several times in 2026), the nearest
option is CPX22 in Helsinki at €16.99 per server, about €41 in total. `provision.sh` checks what can
be ordered and stops with a list if your server type is missing.

## 0. Before you start

- **Email is not wired up.** The backend only has `ConsoleEmailService`, so invites and password
  resets are written to the log and never sent. That is fine for staging; it must be solved before
  real users are invited (a separate change, with an EU-hosted SMTP provider).
- **Seeding is safe for deployed environments.** `seed.sh` creates the sysadmin and the reference
  data. The STAF club roster (real names, shared dev password) is skipped because
  `SEED_CLUB_MEMBERS` defaults to `false` when `NODE_ENV=production`, which both servers use.

## 1. Create the servers

On your own machine, with [hcloud](https://github.com/hetznercloud/cli) and `jq` installed:

```bash
cd deploy/hetzner
export HCLOUD_TOKEN=...            # Hetzner Console › project › Security › API tokens (Read & Write)
./provision.sh                     # or: ./provision.sh staging
```

The script creates:

- the SSH key `taidohub-admin`;
- the firewall `taidohub-web` (SSH, HTTP and HTTPS from anywhere). SSH has to be reachable from
  GitHub Actions, whose runner addresses change; the servers accept SSH keys only, root login is
  off and fail2ban blocks repeated failures;
- the servers `taidohub-staging` and `taidohub-production`. Production gets Hetzner Backup and
  protection against deletion.

At the end it prints the DNS records to create.

`cloud-init.yaml` runs on first boot. It installs Docker, ufw, fail2ban, automatic security updates
and a 2 GB swapfile. It also creates the `deploy` user, with the same SSH key, and turns off root
login and passwords over SSH.

## 2. DNS

Create these records at your domain registrar:

```
taidohub.se            A     <production IPv4>
taidohub.se            AAAA  <production IPv6>
staging.taidohub.se    A     <staging IPv4>
staging.taidohub.se    AAAA  <staging IPv6>
```

Caddy gets certificates from Let's Encrypt on first start, but only once DNS points at the server.

## 3. Prepare each server

```bash
ssh deploy@<ip>
cloud-init status --wait          # wait for first boot to finish
cd /opt/taidohub
```

Create `.env` from `env.example`:

```bash
nano .env                         # paste the contents of env.example
sed -i "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
sed -i "s/^BETTER_AUTH_SECRET=$/BETTER_AUTH_SECRET=$(openssl rand -hex 32)/" .env
chmod 600 .env
```

On the production server, change:

- `SITE_DOMAIN=taidohub.se`
- `ENABLE_SWAGGER=false`
- `RESTIC_REPOSITORY=sftp:storagebox:taidohub-production`

Keep both `.env` files in a password manager. Without `POSTGRES_PASSWORD` and the restic password,
the backups are useless.

GHCR packages are private by default. Log in once on each server with a personal access token that
has only `read:packages`:

```bash
echo "<token>" | docker login ghcr.io -u stefanag --password-stdin
```

## 4. GitHub Actions

1. Create a dedicated deploy key on your machine:
   `ssh-keygen -t ed25519 -f taidohub-deploy -C github-actions`.
2. Append the public key to `/home/deploy/.ssh/authorized_keys` on both servers.
3. Under Settings › Environments, create `staging` and `production` with:
   - secrets `DEPLOY_HOST` (the server's IPv4), `DEPLOY_SSH_KEY` (the contents of
     `taidohub-deploy`) and `DEPLOY_KNOWN_HOSTS` (the output of `ssh-keyscan -t ed25519 <ip>`);
   - the variable `SITE_URL`: `https://staging.taidohub.se` and `https://taidohub.se` respectively;
   - for `production`: add yourself under Required reviewers.
4. Under Settings › Secrets and variables › Actions › Variables, set the repository variable
   `DEPLOY_ENABLED=true`. Until then the Deploy workflow skips every run.

## 5. First deploy

1. **Staging:** push to `main`, or Actions › Deploy › Run workflow › staging. The workflow builds and
   pushes the images, copies `compose.yaml` and the scripts to `/opt/taidohub/`, runs the migrations,
   starts the app and finally checks `/api/health`.
2. **Create the sysadmin and the reference data**, once per environment:

   ```bash
   ssh deploy@<ip>
   /opt/taidohub/seed.sh admin@taidohub.se    # asks for a password, at least 12 characters
   ```

   It creates organisations, belt systems, classifications, techniques, patterns and the federation's
   grading requirements (STF training matrix and dan rules), but no members.
   Running it again does not duplicate anything.

   To test staging with data (for example the MCP server), add fictional demo data:

   ```bash
   SEED_DEMO_DATA=true /opt/taidohub/seed.sh admin@taidohub.se
   ```

   It also asks for one password for the demo accounts and creates "Demo Taido Club (fictional)"
   with `demo.orgadmin@example.com`, `demo.instructor@example.com` and six students
   (`demo.student1…6@example.com`), all named "(DEMO)", with gradings and some progress. The app
   refuses to do this on production.
3. **Production:** Actions › Deploy › Run workflow › production, approve, then run `seed.sh` on the
   production server.

## 6. Backups to a Storage Box

1. Order a Storage Box BX11 in Hetzner Console, preferably in Finland, and enable SSH access in its
   settings.
2. On **each** server, as root (`sudo -i`):

   ```bash
   ssh-keygen -t ed25519 -f /root/.ssh/storagebox -N ''
   cat /root/.ssh/storagebox.pub | ssh -p 23 u12345@u12345.your-storagebox.de install-ssh-key
   cat >> /root/.ssh/config <<'EOF'
   Host storagebox
     HostName u12345.your-storagebox.de
     User u12345
     Port 23
     IdentityFile /root/.ssh/storagebox
   EOF
   openssl rand -hex 32 > /root/.restic-password && chmod 600 /root/.restic-password
   set -a; source /opt/taidohub/.env; set +a
   restic init
   /opt/taidohub/backup.sh                     # first run; check the output
   systemctl enable --now taidohub-backup.timer
   ```

   Replace `u12345` with your Storage Box user. Check the `install-ssh-key` step against Hetzner's
   Storage Box documentation; it is the one step here that has not been verified.
3. Copy `/root/.restic-password` from both servers into the password manager.
4. **Practise a restore on staging** before real data exists:
   `sudo /opt/taidohub/restore.sh --latest-offsite`.

Retention is 14 daily, 8 weekly and 12 monthly snapshots. At worst one day of data is lost (RPO 24
hours). If that is not good enough later, add WAL archiving (for example WAL-G); it is not needed to
start.

## 7. Email through Brevo

Invitations, admin-triggered password resets and "Forgot password?" links are sent over SMTP
through Brevo (free tier: 300 emails a day). Without `SMTP_HOST` the app still starts, but emails
only end up in `docker compose logs app`.

1. Create an account at brevo.com and add the domain `emails.taidohub.se` (the subdomain, not
   `taidohub.se`) under **Senders, domains and dedicated IPs → Domains**. Sending from a subdomain
   keeps Brevo's reputation and DNS records apart from any other mail on `taidohub.se`.
2. Brevo shows the DNS records to add in the `taidohub.se` zone at the registrar. They look like
   this; copy the exact values from Brevo and choose the two-CNAME DKIM option if offered:

   ```
   emails                       TXT    brevo-code:<code from Brevo>
   brevo1._domainkey.emails     CNAME  b1.<value from Brevo>.dkim.brevo.com
   brevo2._domainkey.emails     CNAME  b2.<value from Brevo>.dkim.brevo.com
   _dmarc.emails                TXT    v=DMARC1; p=none; rua=mailto:admin@taidohub.se
   ```

   Most DNS editors append `.taidohub.se` to the name themselves, so enter `emails`, not
   `emails.taidohub.se`. No SPF record is needed on Brevo's shared IPs: DMARC passes through DKIM.
   Start DMARC with `p=none` and tighten it to `quarantine` once Brevo's reports look clean; the
   record covers only the subdomain.
3. Wait until Brevo marks the domain as authenticated, then add `noreply@emails.taidohub.se` as a
   sender. If Brevo asks for a code sent to that address, forward it to a real mailbox for the
   verification.
4. Under **SMTP & API → SMTP**, create an SMTP key. Put the login and key in `/opt/taidohub/.env`
   on each server (`SMTP_USER`, `SMTP_PASSWORD`), never in the repo or a workflow.
5. Restart the app: `docker compose up -d app`. Test with **Forgot password?** on the sign-in page
   and with an invitation from **Admin → Users**.

Use the same Brevo account and domain for staging and production; each server gets its own SMTP
key, so one can be revoked without affecting the other.

## 8. Google sign-in

Optional. With `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set, the sign-in page offers "Sign in
with Google" and, while `self-registration` is on, the registration page offers "Register with
Google". Google only signs in existing accounts (linked by their verified email); a new account
can only be created from the registration page, after date of birth, federation and the platform's
texts are checked.

1. In Google Cloud Console, create a project (for example `taidohub`) and set up the **OAuth
   consent screen**: type External, app name TaidoHub, support email, authorised domain
   `taidohub.se`, links to `https://taidohub.se/legal/platform/privacy?audience=self_registered`
   and the terms. Scopes: only `openid`, `email` and `profile`, which need no Google review.
2. Under **Credentials → Create credentials → OAuth client ID**, create a **Web application**
   client per environment:
   - staging: authorised redirect URI `https://staging.taidohub.se/api/auth/callback/google`
   - production: `https://taidohub.se/api/auth/callback/google`
3. Put the client ID and secret in `/opt/taidohub/.env` on that server (`GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`), never in the repo or a workflow. They take effect at the next deploy,
   or with `docker compose up -d app`.
4. Publish the consent screen (status "In production") once it works on staging; while it is in
   "Testing", only the test users listed there can sign in.
5. Mention Google as a way to sign in in the platform's privacy notice.

## Day-to-day operations

```bash
# on the server, as deploy, in /opt/taidohub
./deploy.sh staging-3f2c1ab                               # deploy a specific tag
./deploy.sh --rollback                                    # back to the previous tag (migrations are not reverted)
docker compose --env-file .env --env-file .image.env logs -f app
docker compose --env-file .env --env-file .image.env exec db psql -U taidohub
sudo ./restore.sh /var/backups/taidohub/taidohub-<timestamp>.dump

# from your machine: Postgres through an SSH tunnel, e.g. for Drizzle Studio or TablePlus
ssh -N -L 5433:127.0.0.1:5432 deploy@<ip>
# then connect to postgres://taidohub:<POSTGRES_PASSWORD>@localhost:5433/taidohub
```

## Before real member data goes in

- [ ] Email works: Brevo is set up as in section 7 and an invitation and a password reset
      have been received on both servers.
- [ ] A data processing agreement (AVV) with Hetzner is signed in Hetzner Console.
- [ ] A restore from the Storage Box has been tested on staging.
- [ ] External monitoring of `https://taidohub.se/api/health` (for example Better Stack or
      UptimeRobot, free tier).
- [ ] `sudo fail2ban-client status sshd` shows the SSH jail running on both servers.
- [ ] Note: a new major PostgreSQL version later needs a dump and restore, not just a new image tag.

## What has been verified

| Part | Status |
| --- | --- |
| Backend bundle (`pnpm deploy`): build, migrate, seed and start against Postgres | Tested (Node 22, PostgreSQL 16) |
| Seed fix (`nest-cli.json` assets, `SEED_CLUB_MEMBERS`) | Typecheck, lint, unit tests |
| `compose.yaml` | Validated with `docker compose config` |
| Shell scripts | `bash -n` and shellcheck with no warnings |
| Docker images | Not built yet: Docker Hub was not reachable from the environment that wrote this |
| `Caddyfile`, `cloud-init.yaml`, `provision.sh` against the Hetzner API, the workflow | Not run; YAML syntax checked |

The first real run on staging is therefore the test for the last two rows. Check in particular that
deep links (for example `/admin/users`) load and that sign-in works.
