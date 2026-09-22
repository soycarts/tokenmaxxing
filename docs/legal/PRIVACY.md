# Privacy policy

**Draft for legal review. Not yet in force.** Effective date: to be set at launch. Controller: Bountify, Inc. Contact: privacy@tokenmaxxing.fyi (to be created).

## The short version

tokenmaxxing.fyi receives hourly token counts per AI model from a small tool you run on your own machine. It never receives your prompts, your code, your file paths, your project names, or your credentials. Everything you upload is deleted when you delete your account. We publish statistics only in aggregate, never about one person.

## What the CLI reads on your machine

`tokenmaxxing-cli` reads the local session logs that Claude Code, Codex and Gemini CLI already write to your home directory. From each log entry it keeps only: a timestamp rounded to the hour, the tool (source), the model name, and token counts (input, cache read, cache write, output, reasoning), plus a count of requests and conversations. It does not read your credentials, API keys, OAuth tokens or keychain. It does not edit your tools' configuration unless you run `tokenmaxxing hook install` yourself. It sends nothing anywhere until you run `tokenmaxxing link` and `tokenmaxxing push`. The CLI is open source; you can read exactly what it does.

## What we receive and store

When you push, we receive the hourly rows described above, together with a random device id the CLI generated. When you sign in with GitHub we receive your GitHub id, login, display name, email address and avatar URL from GitHub. We store the handle you choose, whether your profile is public, and any subscription plans you tell us you have, which we use only to compute a value multiple.

We do not receive: prompts, responses, code, file paths, project or repository names, git branches, IP-derived location beyond what our hosting provider logs for security, or anything typed into your tools.

## How we use it

- To show you your own usage and its API-equivalent value.
- To run the public leaderboards, which show only people who have set their profile to public, and orgs whose owner has set the org to public.
- To render badges and profile cards that you choose to embed elsewhere.
- To publish aggregate statistics about agentic coding usage, for example model share, cache-hit rates or spend distributions. Aggregates are computed over groups of at least 20 people and never identify or allow re-identification of an individual. We may publish these as reports or live pages and may use them commercially.
- To operate, secure and improve the service.

We do not sell personal data. We do not sell or license individual-level usage rows. We do not use your data to train models.

## Sponsors

Leaderboards and profiles may carry clearly labelled sponsored placements. Sponsors receive no personal data about you. We report to sponsors only aggregate impression counts.

## Who we share with

Hosting and infrastructure providers that process data on our behalf: Vercel (application hosting and logs), Supabase (database and authentication), GitHub (sign-in). Each is bound by its own terms and processes data only to provide the service to us. We share personal data with no one else unless required by law.

## Retention and deletion

Usage rows, devices, tokens and your profile are kept while your account exists. Deleting your account on the Account page removes all of them immediately; aggregate statistics already published are not affected because they cannot be traced back to you. Infrastructure logs held by our providers expire on their schedules, typically within 30 days. Link codes expire after 10 minutes.

## Your rights

Wherever you are, you can see everything we hold about you on your Account page, export it via the public API for your own handle, correct your plans and handle settings, and delete it all yourself. If you are in the UK, EEA or a jurisdiction with similar rights, you also have the right to object, to restrict processing, and to complain to your data protection authority. Email the contact above for anything the Account page does not cover.

## Children

The service is not directed at anyone under 16 and we do not knowingly collect their data.

## Changes

We will post changes here with a new effective date and, for material changes, notify signed-in users on the site.
