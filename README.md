# My World — Anime Catalog

This is a small self-hosted anime catalog called "My World". It includes a static frontend (HTML/CSS/vanilla JS) and a minimal Node/Express backend for persisting custom entries and accepting image/video uploads.

Quick summary
- Frontend: `index.html`, `css/style.css`, `js/app.js` (client-side rendering, favorites, admin UI, export/import)
- Backend: `server.js` (Express + multer), stores custom entries in `data/custom.json` and uploaded files in `uploads/`

Run locally

1. Install dependencies

```bash
cd /Users/korrahari/anime
npm install
```

2. Start server

```bash
npm start
# then open http://localhost:8000 in your browser
```

Optional: set an admin token to protect upload and admin endpoints

```bash
export ADMIN_TOKEN="your-secret-token"
npm start
```

Then provide the same token in the admin UI (top-right) or send it in the `x-admin-token` header for API calls.

Notes about uploads and production
- The current server stores uploaded files under the `uploads/` directory on the server's filesystem. Many cloud hosts (Render, Railway, Vercel) use ephemeral filesystems or multiple instances. For production use you should store uploads externally (S3, Cloudinary, Backblaze B2) and save the remote URL in the stored item instead of a local path.
- If you plan to host videos for public streaming, use a dedicated storage/CDN (S3 + CloudFront, Cloudinary, or a streaming provider) rather than storing large files on the app server.

Deploying so others can use it (recommended/simple option: Render)

1. Push your project to a GitHub repository.

2. Create a new web service on Render (https://render.com):
   - Connect your GitHub repository
   - Build command: `npm install`
   - Start command: `npm start`
   - Set environment variables: `ADMIN_TOKEN` (optional)
   - Deploy. Render will give you a public https URL (for example `https://myworld-yourname.onrender.com`).

Important: after deploying, uploads saved to `/uploads` may not persist across deploys or multiple instances. Use an external media host in production.

Alternative hosting options
- Railway.app — similar workflow to Render
- Fly.io — runs instances globally; persistent volumes are available but may require configuration
- Vercel — best for static frontends; you'd need to run serverless functions or separate server for uploads

Next steps I can help with
- Implement S3/Cloudinary upload support and change `/upload` to store files remotely.
- Make the frontend server-only (always persist to server) and show clear offline/fallback states.
- Initialize a Git repository, create a GitHub repo and push, then create a Render deployment (I'll provide commands and a checklist and can attempt local steps; you must supply remote repo access or run the push yourself).

If you want, tell me which deploy provider you prefer and I will produce exact, copy-paste steps to get a public URL (and optionally help implement remote uploads for persistence).

Git + Render quick-start (copy these exact commands and run locally)

1. Initialize git locally, create a repo, commit, and push to GitHub (replace <your-repo-url>):

```bash
cd /Users/korrahari/anime
git init
git add .
git commit -m "Initial My World anime catalog"
# create a repo on GitHub and set origin, then:
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```

2. Deploy on Render

 - Go to https://dashboard.render.com/new and connect your GitHub repo.
 - Choose the `myworld-anime` repository.
 - For the service, Render should auto-detect Node. Use the defaults or specify the following fields:
    - Build command: `npm install`
    - Start command: `npm start`
 - Add an environment variable `ADMIN_TOKEN` on Render if you want the admin/upload endpoints protected.
 - Deploy. Render will give you a public URL like `https://myworld-anime.onrender.com`.

3. After deploy, verify endpoints

```bash
curl -I https://<your-render-url>/
curl -sS https://<your-render-url>/api/custom | jq .
```

Notes:
- The repository includes a `render.yaml` manifest with basic settings (free plan). Adjust as needed in the Render dashboard.
- The `uploads/` directory and `data/custom.json` are ignored by `.gitignore` because mounted filesystems on cloud hosts may be ephemeral. For production persistence of uploads, use Cloudinary or S3 (see next steps in this README).

# My World — Anime Catalog

A small static site to browse and search anime. Inspired by the attached screenshots. This is intentionally simple and runs without a build step.

Files added:
- `index.html` — main page with embedded sample data (no server required).
- `css/style.css` — site styles (dark theme).
- `js/app.js` — client-side logic: rendering, search, filters, sort.
 - `js/app.js` — client-side logic: rendering, search, filters, sort, admin, export/import, and video/watch support.

How to open
1. Open `index.html` in your browser directly. (Works in most browsers.)

If the browser blocks the embedded JSON due to file:// restrictions, run a tiny local server:

```bash
# from the project folder (/Users/korrahari/anime)
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

Or run the bundled Node backend to enable uploads and server persistence (recommended if you want others to use your site):

```bash
# install dependencies once
cd /Users/korrahari/anime
npm install
# start the server (serves static files and provides upload/API endpoints)
npm start
# then open http://localhost:8000 in your browser
```

When running the Node server you can upload images and video files via the Admin panel — uploaded files are saved to `/uploads` and served by the server so other users of the deployed server can access them.

Next steps / ideas
- Replace placeholder images with real cover art (update the `image` fields in the JSON embedded in `index.html`).
- Add detail pages or a modal to show anime synopsis and episode lists.
- Persist user favorites in localStorage.
- Connect to a real API or expand the data file for a larger catalog.

New features added in this version:
- Favorites persistence (localStorage), favorites panel and favorites-only filter.
- Modal detail view with favorite toggle.
- Admin form to add new anime entries from the UI (saved to localStorage).

Shareable URLs
----------------
Each anime detail modal now has a shareable URL. When you open an anime's modal the browser address bar updates to:

```
?anime=<id>
```

You can copy that link and open it in a new tab — the modal will open automatically on load. The browser back/forward buttons will also close/open the modal appropriately.

Local assets
------------
This project includes a small `assets/` folder with SVG cover placeholders and a `assets/manifest.json` file listing available local covers. Use the Admin form's "Or choose local asset" dropdown to pick one of these assets when adding a new anime.

If you host the site via `python3 -m http.server` the assets are loaded automatically. When opening `index.html` directly via `file://` some browsers block fetch requests; if that happens run the simple server above.

Editing & removing custom entries
---------------------------------
You can manage the custom entries you add via the Admin panel. After adding entries they appear under "Custom entries" with Edit and Delete buttons.

- Edit: prefills the admin form so you can update metadata (title, genres, image or asset selection). Click "Save Changes" to persist.
- Delete: removes the custom entry from localStorage and updates the catalog.

Video / Watch support
---------------------
- The Admin form now includes a "Watch URL" field and a video upload control.
- You can paste a direct video URL (or YouTube embed link) into the Watch URL field. When viewing an anime's modal a player will appear if the Watch URL is present.
- If you run the Node backend (`npm start`) you can upload a video file using the video upload control — the server will store the file under `/uploads` and the Admin form will automatically fill the Watch URL with the uploaded file path so it can be played inline.

Security & legal note
---------------------
Hosting or distributing anime videos may require permissions and licensing. This project provides the technical mechanism to host and stream video files, but you must ensure you have legal rights to host or distribute any content you upload. For public demos, linking to official sources (YouTube, Crunchyroll) is the safest path.

Changes to custom entries are saved in the browser's localStorage under the key `myworld_custom`.

If you want, I can:
- add a modal with details for each anime
- load images from a folder in the repo
- add a small admin form to add new anime into the embedded dataset

How to use the Admin form
- Open the page and fill the fields in the "Admin — Add Anime" panel on the right.
- At minimum provide a Title. Image URL is optional (a placeholder will be used).
- New entries are saved to your browser's localStorage and will persist between reloads on the same machine.

Enjoy — open `index.html` and try the search and genres.
