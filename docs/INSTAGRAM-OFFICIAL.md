# Instagram row: official API setup (prepared, not active yet)

## How the row works today

- The home page asks `/api/instagram` for the latest 9 posts. That function tries Instagram's public
  profile page, but Instagram blocks Cloudflare's servers, so it nearly always serves `data/instagram.json`.
- Thumbnails are **self-hosted** in `assets/ig/<post code>.jpg` (640x800). Instagram's own image links
  are signed and expire after a few days, which is what broke the row in October 2026; we never link
  to them any more. (Live posts we don't have a copy of yet go through `/api/igthumb`, which caches them.)
- `tools/refresh_instagram.py` downloads new posts' thumbnails, rewrites `data/instagram.json`
  (newest first, latest 9), deletes images that dropped off, and with `--commit` pushes to `main`
  only when something changed. The site redeploys automatically.
- If an image ever fails to load the page drops that tile; if none load, the whole section stays hidden.

Without a token the script reads the public profile like a logged-out visitor. That works from some
networks and not from others, and Instagram can change it at any time. The official API is the
reliable long-term route.

## Switching to the official API (Instagram API with Instagram Login)

This works with a Professional (Creator or Business) account. No Facebook Page is needed.

### 1. Emily: switch the account to Creator (about 2 minutes, in the Instagram app)

1. Open Instagram, then tap your **profile picture** (bottom right).
2. Tap the **menu** (three lines, top right), then **Settings and activity**.
3. Scroll to **For professionals** and tap **Account type and tools**, then **Switch to professional account**.
4. Tap **Continue** through the intro screens. Pick a category (for example "Photographer"),
   choose **Creator**, then tap **Done**.
   Posts, followers and the public profile stay the same. You can switch back later.

### 2. Jett: create the Meta app (developers.facebook.com, about 15 minutes)

1. Go to <https://developers.facebook.com>, log in with **your own** Facebook account, and register
   as a developer if it asks.
2. Click **My Apps**, then **Create app**. Name it something like "ecoffeen site feed".
   - If it asks for a use case, pick **Other**, then the app type **Business**.
3. In the app dashboard, find **Instagram** and click **Set up**. Choose
   **API setup with Instagram login** (the product often called "Instagram API with Instagram Login").
4. Go to **App roles, Roles, Instagram testers** (or "Add Instagram testers"), then add
   `emily_coffeen_photography`.
5. **Emily** accepts the invite. In Instagram on the web, go to **Settings, Apps and websites,
   Tester invites** and tap **Accept**. A development-mode app with her as a tester is enough for
   reading her own posts, so no App Review is needed.
6. Back in the app under **Instagram, API setup with Instagram login, Generate access tokens**,
   click **Add account**. Emily logs in to **her** Instagram in that pop-up (this is the one-time
   login) and approves `instagram_business_basic`. Then click **Generate token** next to her account.
   The token shown is a **long-lived** token (valid 60 days, renewable).
   Copy it, and don't paste it into chat, email or the repo.

### 3. Where the token goes

- **GitHub (hands-off):** repo **N100LX/ecoffeen-site, Settings, Secrets and variables, Actions,
  New repository secret**. Name: `IG_ACCESS_TOKEN`, value: the token.
  The daily workflow `.github/workflows/refresh-instagram.yml` then uses the API automatically.
- **Token renewal (~every 50 days):** the script calls
  `graph.instagram.com/refresh_access_token` once the last refresh is 50 or more days old (the date
  is in `data/ig-token-state.json`; the token itself is never committed). The workflow's built-in
  token cannot write secrets, so to let it save the renewed token, create a **fine-grained personal
  access token** limited to this repo with **Secrets: Read and write**, and store it as a second repo
  secret named `GH_SECRETS_PAT`. Without it, set a calendar reminder for every ~50 days: generate a
  new token (step 2.6) and paste it over `IG_ACCESS_TOKEN`.
  (A refreshed token stays valid 60 days from the refresh, so a missed renewal just means the next
  run renews it, as long as it hasn't fully expired.)
- **Box alternative:** put the token in a file (for example `~/.config/ecoffeen/ig_token`, chmod 600) and run
  `IG_TOKEN_FILE=~/.config/ecoffeen/ig_token python3 tools/refresh_instagram.py --commit`.
  The renewed token is written back to that file.

### What the API call is

`GET https://graph.instagram.com/me/media?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp`
For videos and reels the script uses `thumbnail_url`, and for photos and carousels `media_url`. Each
thumbnail is downloaded once and self-hosted like today.

### If something goes wrong

- Token expired or revoked: the workflow logs a warning, keeps the existing row, and does not fail.
  Generate a new token (step 2.6) and update the secret.
- To go back to the no-token mode, delete the `IG_ACCESS_TOKEN` secret.
