# Plan: Terms and privacy texts per platform, federation and club

Status: **planned**, not started. Requested 2026-11-26.

## Goal

Terms of use and privacy notices that can differ by context: the platform itself (for
self-registered users), a national federation and a club. Each text can exist in several
languages; when it does, one language is marked as legally binding and takes precedence if the
translations differ. Users see the texts that apply to them, accept terms, acknowledge privacy
notices, and are asked again when a text changes materially.

## Decisions (owner, 2026-11-26)

- Texts can differ per club, per federation and for self-registration.
- Texts can have several language variants; exactly one language per version is legally binding
  and takes precedence over translations.
- TaidoHub is operated by Stefan Agnvall as a private individual for now; this may change (see
  "Operator").
- Data processing agreements with clubs and federations are accepted in TaidoHub.
- No simplified version of the texts for users aged 13–17.
- The owner arranges legal review of the texts; Claude may draft starting points.

## Principles (not legal advice; have them reviewed)

- **Terms are accepted, privacy notices are acknowledged.** A privacy notice is information the
  GDPR requires (art. 13), not something the user consents to; processing of member data normally
  rests on the membership agreement or legitimate interest. The UI therefore says "I accept the
  terms" but "I have read the privacy notice", and the log records `accepted` vs `received`.
- **The privacy notice comes from whoever is controller.** For club members that is most likely the
  club or federation (TaidoHub's operator is then a processor and needs a data processing agreement
  with them); for self-registered users it is TaidoHub's operator.
- **Evidence:** the log must show exactly which text a user saw and in which language, so content
  hashes are stored with every acknowledgement.

## Data

- `legal_document`
  - `id`, `kind` (`terms` | `privacy` | `dpa`; `dpa` = data processing agreement, platform only)
  - `organisation_id` (null = the platform; otherwise a club or national/international federation)
  - `audience` (`members` | `self_registered` | `organisations`; the last two only for the
    platform, `organisations` only with `kind = 'dpa'`)
  - `mandatory_for_descendants` (boolean, federations only; see "Which texts apply")
  - unique on (`kind`, `organisation_id`, `audience`)
- `legal_document_version`
  - `id`, `document_id`, `version` (1, 2, 3 …), `status` (`draft` | `published` | `retired`)
  - `authoritative_locale`: the legally binding language. Required; a translation in that locale
    must exist before publishing.
  - `requires_reacceptance` (material change → users must accept again; editorial → notice only)
  - `change_summary`, `published_at`, `published_by_user_id`
- `legal_document_translation`
  - `version_id`, `locale`, `title`, `body` (same rich-text format as the profile's "About me"),
    `revision` (1, 2 …), `content_hash` (sha256 of title + body), `updated_at`,
    `updated_by_user_id`
  - unique on (`version_id`, `locale`, `revision`); the latest revision per locale is current
- `user_document_acknowledgement` (append-only)
  - `user_id`, `version_id`, `type` (`accepted` | `received`)
  - `displayed_locale`, `displayed_translation_revision`, `displayed_content_hash`
  - `authoritative_locale`, `authoritative_content_hash` (what legally applied at that moment)
  - `context` (`registration` | `invitation` | `club_join` | `new_version`), `organisation_id`
    (the membership that made the text apply; null for platform texts), `acknowledged_at`
  - kept when the user leaves a club; deleted only with the user account

- `organisation_agreement_acceptance` (append-only): `organisation_id`, `version_id` (a `dpa`
  version), `accepted_by_user_id` (an orgadmin of that organisation at the time),
  `displayed_locale`, `displayed_content_hash`, `authoritative_locale`,
  `authoritative_content_hash`, `operator_snapshot` (operator details in force, see below),
  `accepted_at`.
- `platform_operator` (single current row plus history): legal name, type (`private_individual` |
  `organisation`), organisation number if any, postal address, contact email, valid from. Edited
  by sysadmin only.

Supported content locales: start with the app locales (sv, en, fi), but keep `locale` a validated
BCP 47 tag from a configured list so a federation can add another language without a migration.

## Language rules

- **The authoritative translation of a published version can never change.** Changing the binding
  text means publishing a new version.
- **Other translations can be added or corrected after publishing**, because they do not change
  what legally applies. Every correction is a new `revision`, recorded in the audit log;
  acknowledgements keep pointing at the revision the user actually saw.
- **Every non-authoritative translation shows a fixed notice** at the top, written in the language
  of the translation, for example: "This is a translation. The Swedish version is legally binding
  and takes precedence if the versions differ." with a link to the binding text. The notice comes
  from the app's own i18n strings, not from the document, so an editor cannot remove it.
- **The binding language is marked** in the language switcher on every legal page.
- **Language shown:** the user's interface language if a translation exists; otherwise the
  authoritative language, with a short notice that the text is not available in their language.
- **New version:** the editor can copy the previous version's translations as a starting point;
  copied translations are flagged "needs review" until saved, and only reviewed translations are
  shown to users. A version can be published with the authoritative translation alone.

## Operator

TaidoHub's operator is controller for self-registered users and processor for clubs and
federations, so the operator is named in the platform texts and the data processing agreement.
Because the operator can change (today a private individual, later perhaps an association or
company):

- Platform texts and the DPA refer to the operator through placeholders (`{{operator.name}}`,
  `{{operator.contact}}` …) filled from `platform_operator` when rendered; the hash covers the
  rendered text, so the evidence shows the operator as it was.
- Changing the operator is a material change: it requires publishing new versions of the platform
  terms, the self-registration privacy notice and the DPA with `requires_reacceptance`, and the
  editor refuses to save an operator change without them. Users then accept the new terms, and
  orgadmins accept the new DPA, through the normal flows.
- The privacy notice must say where the operator's contact details are; with a private individual
  as operator, use a dedicated contact address rather than a private one.

## Data processing agreement

- One platform document of kind `dpa`, audience `organisations`, versioned and multilingual like
  every other text.
- An organisation is **covered** when it, or an ancestor whose texts it inherits, has accepted the
  current DPA version. This matches text inheritance: whoever's privacy notice applies is the
  controller, and that organisation signs.
- An orgadmin of an organisation that is not covered sees an interstitial asking them to accept on
  the organisation's behalf. Acceptance is recorded in `organisation_agreement_acceptance` and the
  audit log.
- Until covered, the organisation cannot invite or add members, approve join requests or create
  students; existing data stays readable so nothing is lost. (Default; easy to relax.)
- Sysadmin sees every organisation's DPA status in the admin area.

## Which texts apply

- **Platform texts** (`organisation_id` null): `members` terms apply to everyone;
  `self_registered` terms and privacy notice apply to users who registered themselves.
- **Organisation texts:** for each of the user's memberships, per `kind`, the club's own text if it
  has one, otherwise the nearest ancestor's (`OrganisationsRepository.getAncestorIds()`, same walk
  as requirement sets). In addition, any ancestor document with `mandatory_for_descendants` applies
  on top of the club's own.
- **A self-registered user's reference federation does not bring its texts:** the federation does
  not process their data. Revisit only if a federation takes on that responsibility by agreement.

| Situation | Terms | Privacy notice |
| --- | --- | --- |
| Self-registration | Platform | Platform (self-registered) |
| Invited to a club | Platform + club or nearest federation | Club or nearest federation |
| Self-registered user joins a club | + club or nearest federation | + club or nearest federation |
| Member of several clubs | Each club's (or federation's) | Each club's (or federation's) |

## Backend

- New module `legal-documents` (via `/add-module`): schema, repository, service, controller,
  ability contributor, contracts, tests.
- CASL subject `LegalDocument`: sysadmin manages platform documents and any other; orgadmin manages
  documents with `organisationId` of their organisation. Publishing is a separate action
  (`publish`) so it can be restricted later. Published versions are read-only for everyone.
- Public endpoints (no session): the published texts of an organisation or the platform, with the
  current translation per locale and the authoritative locale, so texts can be read before
  registering or accepting an invitation.
- `GET /api/me/legal/pending`: the versions the user still has to accept or acknowledge, resolved
  by the rules above. `POST /api/me/legal/acknowledgements`: record acceptance/receipt; the server
  computes the hashes from what it served, never trusting hashes from the client.
- Enforcement: a guard refuses API calls (except sign-out, the pending/acknowledge endpoints and
  account deletion) while a `terms` version with `requires_reacceptance` is pending. Privacy
  updates never block.
- Registration, invitation acceptance and club joining record their acknowledgements in the same
  transaction as the action itself.
- Audit log entries for create, publish, retire and every translation revision.

## Frontend

- Public pages: `/legal/platform/terms`, `/legal/platform/privacy`, `/legal/<organisation-slug>/<kind>`
  with a language switcher marking the binding language and an optional "show binding version"
  side-by-side view.
- Registration and set-password pages: the applicable texts as links that open in a panel;
  "I accept the terms" checkbox; "I have read the privacy notice" checkbox.
- Interstitial page after sign-in when terms require re-acceptance: change summary, links to the
  texts, accept button. A dashboard notice for privacy and editorial updates.
- Profile: "My acknowledgements": which versions, which language, when.
- Admin editor (platform under Admin; organisation texts under the organisation): drafts per
  language, choose the binding language, preview every language with the translation notice,
  publish with change summary and the "requires re-acceptance" choice, version history.
- All UI strings, including the fixed translation notice, in en, sv and fi.

## Phases

1. **Foundation:** data model, editor for drafts and publishing, public pages, language rules, and
   acknowledgement at registration and invitation. Needed before self-registration phase 1
   (`2026-11-26-self-registration.md`), which uses these texts.
2. **Change handling:** pending/acknowledge endpoints, the re-acceptance interstitial and guard,
   the dashboard notice, "My acknowledgements", `mandatory_for_descendants`.
3. **Operator and agreements:** `platform_operator` with placeholders and the operator-change
   rule, the DPA flow and its gate on member administration, the sysadmin DPA overview, and
   platform templates that organisations copy and adapt. Phase 3 must be in place before a club
   that is not run by the operator uses TaidoHub with real member data.

## Tests

- Resolution: club's own text, fallback to the nearest ancestor, mandatory ancestor texts on top,
  platform texts for self-registered users, nothing from the reference federation.
- Language: publishing refused without the authoritative translation; authoritative translation
  immutable after publishing; corrections create revisions; fallback to the authoritative language;
  the translation notice is always rendered for non-authoritative languages.
- Acknowledgements store displayed and authoritative hashes computed on the server; the guard
  blocks only for pending terms with `requires_reacceptance`.
- e2e: registration and invitation each record the right acknowledgements; publishing a material
  terms change blocks API access until accepted.
- DPA: coverage through an ancestor; invitations refused for an uncovered organisation and allowed
  after an orgadmin accepts; only an orgadmin of that organisation can accept; an operator change
  without new versions is refused.

## Open decisions

None at the moment. The texts themselves (platform terms, privacy notices, DPA and templates) are
written and legally reviewed outside this plan before phase 1 ships to production.
