# MissYouHelen
I miss you Helen

## Local dev
Open index.html directly, or run a simple server:

python3 -m http.server 8000

Then visit http://localhost:8000

## Audio
Drop your MP3 at assets/audio/mistakes.mp3 to enable the player in index.html.

## Cloudflare Pages deploy (GitHub Actions)
1) Create a Cloudflare Pages project for this repo.
2) Add these GitHub repo secrets:
	- CLOUDFLARE_API_TOKEN
	- CLOUDFLARE_ACCOUNT_ID
3) Update .github/workflows/cloudflare-pages.yml with your Cloudflare project name if needed.

Every push to main or master triggers a deploy.
