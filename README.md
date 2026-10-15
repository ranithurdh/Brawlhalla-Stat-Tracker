# Sandun Brawlding (MERN)

Upload a Brawlhalla post-match screenshot, let Gemini read the stats, check them,
and save the match to MongoDB.

- **MongoDB**: stores matches, players, saved totals and settings
- **Express** (`server/`): API, talks to Gemini
- **React + Vite** (`client/`): leaderboards, matches list, add-match page, settings page
- **Node**: the server and tooling

## What you need

- Node.js 18 or newer
- MongoDB running locally (`mongodb://127.0.0.1:27017`), or a free MongoDB Atlas
  connection string
- A free Gemini API key from https://aistudio.google.com

## Run it

Open two terminals.

**1. Server**

```bash
cd server
cp .env.example .env      # then edit .env
npm install
npm run dev
```

**2. Client**

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173.

## Free MongoDB Atlas (where the match data lives)

Everything (matches, 1v1s, players, saved totals, settings, site images) is saved in
MongoDB. The only thing the app needs is one connection string, called `MONGODB_URI`.

1. Sign up at https://www.mongodb.com/atlas and create a free **M0** cluster.
2. **Database Access** -> add a database user with a password (use letters and digits to
   avoid trouble with symbols).
3. **Network Access** -> add IP address `0.0.0.0/0` (allow from anywhere), so your host
   can connect.
4. **Database** -> your cluster -> **Connect** -> **Drivers** -> copy the string. It looks
   like `mongodb+srv://USER:<password>@cluster0.xxxxx.mongodb.net/`.
5. Replace `<password>` with the real password (remove the brackets). A database name is
   added for you (`brawlhalla-tracker`) if the string has none.
6. Paste it as `MONGODB_URI`:
   - on your computer: in `server/.env`
   - on a host: in its **Environment Variables** page

Tables ("collections") are created automatically on the first start. If the password has
symbols such as `@ : / ? # %`, URL-encode them (`@` becomes `%40`). The server prints a
plain-English reason if it can't connect.

## Deploy (one server for the whole site)

The Express server also serves the built React app, so you deploy one thing. On
Render / Railway / similar (a free Render "Web Service" works):

- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Environment variables:** `MONGODB_URI`, `ADMIN_PASSWORD`, and optionally
  `UPLOAD_CODE` (a short secret word for dorm members), and `GEMINI_API_KEY` (a key saved on
  the Settings page also works)

Leave `CLIENT_ORIGIN` unset. Free hosts sleep when idle, so the first visit after a quiet
spell can take about 30 seconds. Your data is safe in Atlas either way.

## Backup and restore

- **Download backup** (admin): on the Add match page, unlock Admin and press **Download
  backup**. You get one small `.json` file with every match, 1v1, player (with faces) and the
  Gemini model and prompt.
- **Import data** (admin): Settings > **Import data**. Pick that file and confirm. It
  **replaces** everything currently saved, then rebuilds the leaderboards. If the import fails
  half-way, the previous data is put back automatically.
- Not in the file, on purpose: the Gemini API key (a secret), the background image and tab icon
  (large), and the saved totals (rebuilt from the matches).

Take a backup now and then. Atlas's free tier has no automatic backups.

## Gemini when the site is public

- The Gemini key stays on the server and is never sent to the browser, so nothing about the key
  needs changing for deployment. Best practice: set it as the `GEMINI_API_KEY` environment
  variable on your host rather than saving it on the Settings page.
- The app calls `/api/...` on its own address, so there is no `localhost` to change.
- Calls now time out after 45 seconds and are retried up to twice when Gemini is busy
  (503 / overloaded). A used-up free quota still goes to the screenshot queue.
- **Protect your quota.** Set `UPLOAD_CODE` to a short secret word. Visitors enter it once on the
  Add match page (it is remembered on their device) before screenshots are read. Each connection
  is also limited to 40 reads per 15 minutes (`UPLOAD_LIMIT_PER_15_MIN`). Admins skip both.
- Model names change. If Gemini says it can't find the model, change it on the Settings page.

## The password

Set `ADMIN_PASSWORD` in `server/.env`. It is the admin password. If it is empty,
every admin action stays locked.

**Anyone (no password)** can read the leaderboards and matches, upload a
screenshot, and submit what Gemini read.

**Only an admin** can:

- change the numbers Gemini read before submitting
- edit a saved match, or delete one
- open the Settings page (Gemini, players, site look)

Use the small **Admin** button at the top of the Add match and Matches pages to
unlock (Settings asks for it on its own).

This is enforced on the server, not just hidden in the page. When Gemini reads a
screenshot the server signs the result. Someone without the password can only
submit that signed result, so changing the numbers in their browser does nothing.
Signed results expire after 2 hours. Set `DRAFT_SECRET` in `.env` if you want a
signing key separate from the password (optional).

To keep unrelated screenshots out, a match is only accepted if it contains at
least 2 of the players listed in Settings. Visitors link to members by exact
gamertag only; a "close spelling" guess has to be confirmed by an admin. After 10
wrong guesses an address is blocked for 15 minutes. The password is kept in the
browser tab only, so closing the tab locks it again.

## Settings page

- **Gemini**: API key (saved on the server, never sent back), model, and the
  prompt. If you edit the prompt, keep the JSON shape (players, each with
  gamertag, won, kos, falls, accidents, damageDone, damageTaken).
  A key saved here beats `GEMINI_API_KEY` in `.env`.
- **Players**: usual name, gamertag(s) and face for each member. Add new players
  here too. The site always shows the usual name. Several gamertags can be
  separated with commas.
- **Site look**: the icon shown in the browser tab, a background image for the
  whole site, and an opacity slider for the dark colour that sits on top of it.
  The image stays fixed while the page scrolls over it. Lower opacity lets more of
  the image through (100% hides it). Large photos are shrunk in the browser first.
  The slider previews live; press Save opacity to keep it.
- **Leaderboard totals**: a repair button, normally not needed.

Starting members (Ranithu, Sadaham, Nadin, Sandanu, Bhashika, Nithil) are added
automatically the first time the server starts with no players.

## Duplicate matches

Two matches with exactly the same stats are the same match. The check covers every
player's gamertag, KOs, falls, accidents, damage done, damage taken and result, in any
row order. It runs when a screenshot is read (so a match that is already saved stops
there) and again when saving, and the second one is refused with **"This match has
already been added."** A database index backs this up if two saves arrive together.
It applies to normal matches and 1v1s alike.

## Upload queue

When Gemini's limit is over, the screenshot is not lost: it goes to a queue on the
Add match page. You can also press **Add to queue instead**, or pick several files at
once and they all go to the queue.

- The queue is kept in the browser (IndexedDB), so it is still there the next time you
  open the site. It belongs to that browser on that device.
- **Process queue** reads the oldest screenshot, shows it for review and, after you
  save it, carries on with the next one. If Gemini's limit is still over it stops and
  keeps everything.
- A screenshot leaves the queue when it is saved, when it turns out to be a duplicate,
  when it can't count (for example a 1v1 with a non-member), or when you press Remove /
  Discard. Other errors (bad API key, network) leave it in the queue.

## 1v1 page (/1v1)

A match with exactly two players is a **1v1**. It is saved separately (the `duels`
collection) and never touches the usual leaderboards, home page or Matches page. It only
counts when **both players are registered members**; a 1v1 with anyone else is refused.

- **ELO**: everyone starts on 1000. Every 1v1 changes both ratings like chess (K = 32):
  the winner gains `32 x (1 - expected)` and the loser loses the same, where expected is
  `1 / (1 + 10^((opponent - you) / 400))`. ELO is replayed from the saved 1v1s in order,
  so deleting a 1v1 or changing a gamertag keeps it correct.
- **Player boxes** (3 across, ranked by ELO): face, big ELO, win-loss record and win rate,
  and the head-to-head record against every other player.
- **Boards**: highest win percentage, highest win streak, biggest rivalries (closest
  records) and biggest dominations (biggest win gap). Players or pairs need at least
  **3 matches** to appear (`MIN_MATCHES` in `server/services/duelMath.js`).
- An admin can delete a 1v1 from the Recent 1v1s list.

On the first start after upgrading, any saved match with exactly two registered members is
moved from the Matches list to the 1v1 page and the usual totals are rebuilt without it.

## Home page: best brawler

The home page ranks everyone by **best brawler score**:

```
TotalScore = DPL + (KTR x 100) + DP - MDP
```

| Term | Meaning |
| --- | --- |
| DPL | damage per life: total damage done / falls |
| KTR | KOs to falls: total KOs / falls (multiplied by 100 in the score) |
| DP | share of matches where the player was the most dominant, in percent (50% adds 50) |
| MDP | share of matches where the player was the most dominated, in percent, taken off |

A life is a fall (accidents don't count; no falls yet is divided by 1). A player
has no score until they have at least one match with every number read.

- **Podium**: the top 3 with their faces (animated; respects "reduce motion").
- **Timeline**: a line graph of each player's score, with Last month / Last year /
  All time. Points are running totals (each point is everyone's score after that
  match), so the right-hand end equals the leaderboard. The range only changes how
  much of the history is shown. Click a name to hide or show a line; hover for the
  numbers.
- **Leaderboard table**: total score with DPL, KTR (and KTR x 100), DP, MDP and matches.

The timeline is rebuilt from the matches and kept in server memory until a match or
player changes (`GET /api/stats/home`).

## Leaderboards page (/leaderboards)

Every player is ranked on each board. Faces show for the top 3 only.

| Board | How it's worked out |
| --- | --- |
| Win rate | wins / matches played |
| Damage per life | total damage done / falls (accidents do not count as lives) |
| KOs to falls | total KOs / falls |
| Most damage in one match | highest single-match damage done |
| Least damage in one match | lowest single-match damage done, counting only matches where the player lost all 3 lives (3 or more falls); lowest ranks first |
| Most dominant player | in each match, whoever has the highest damage per life (damage done / falls, minimum 1 life) of everyone (members and non-members) is the dominant player; shown as dominant matches / matches played |
| Most dominated player | in each match, whoever has the highest (damage taken - damage done) / falls (minimum 1 life) of everyone is the dominated player; shown as dominated matches / matches played. A tie counts for each, and a level match counts for nobody |
| Most won team | the combination of 2+ players with the most wins together |

A player with no falls yet is divided by 1. Only falls count as lives.

## Stats are saved, not recalculated

Each player's totals live in the `playerstats` collection. Saving a match adds
that match to the totals. Totals are rebuilt from the matches only when a match
is deleted or a player/gamertag changes (so older matches link to a gamertag you
add later). On the first start after upgrading, matches from the old version are
converted (`name` becomes `gamertag`, `suicides` becomes `accidents`,
`damageDealt` becomes `damageDone`, and the winning team becomes a won/lost flag
per player where it can be worked out) and the totals are built once.

When the stat rules change (lives are falls only, the "least damage needs 3 falls"
rule, and the dominant / dominated counts), the totals are rebuilt from your saved matches once on the
next start, so old matches follow the new rules.

If you had saved a custom prompt in the old version it is set aside and the new
default is used, because the old prompt returns the old field names.

## Uploading a match

1. Add match (no password needed), choose the screenshot.
2. Gemini reads gamertag, result, KOs, falls, accidents, damage done and damage
   taken for each player. The legend is ignored.
3. Everyone sees what Gemini read and can submit it as is. An admin can first
   fix the table: each gamertag is matched to a member (a close spelling is
   suggested and flagged). Add missing players on the Settings page first.
4. Save/submit. Rows for members need all five numbers and a won/lost result, and a match
   needs at least one winner and one loser. The winning team is shown as e.g.
   "Ranithu + Nadin".

## How it works

- `POST /api/extract` sends the image to Gemini and returns the stats plus a
  signed `draftToken`.
- `POST /api/matches` saves a match and updates the totals. Admins send `players`;
  everyone else sends only the `draftToken`. A hash of the stats blocks the same
  match from being saved twice. Two-player matches are saved as 1v1s.
- `PUT /api/matches/:id` (admin) edits a saved match and rebuilds the totals.
- `GET/PUT /api/site` is the site look (read is public, change is admin).
- `GET /api/duels` (public) is the 1v1 page; `DELETE /api/duels/:id` is admin only.
- `GET /api/stats/leaderboards` (public) reads the saved totals.
- `GET /api/stats/home` (public) is the home page: ranking, podium and timeline.

## Good to know

- **Free tier limits**: Gemini's free tier has per-minute and per-day limits, and
  Google may use free-tier inputs to improve its products.
- **Never commit `.env`**. It's already in `.gitignore`.
- **Accuracy**: always check the table before saving.
