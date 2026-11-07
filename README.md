# LifeOS 90 - 90-Day Disciplined Lifestyle System

A personal life-management web app (fitness trainer + nutrition planner + meditation guide + productivity strategist + career mentor) that turns your profile into a **specific daily, weekly and 90-day plan**.

**Zero dependencies**: only Node.js 18+ (no `npm install`, no heavy ORMs). Data can be stored in **Neon Postgres**, **Supabase**, or a local JSON file. Deployable across **Vercel / Cloudflare Pages** (Frontend), **Render / Koyeb** (Backend API), and **Supabase / Neon** (Database).

## What's inside
| Tab | What it does |
|---|---|
| **Profile** | The 16 intake questions (age, gender, height, weight, target, experience, conditions, diet, work hours, commute, sleep, equipment, training days, skills, target role, timeline). The plan stays locked until required fields are filled. Calories/macros are **never guessed**. |
| **Today** | Done / Not Done checklist split into **Morning, Workday, Fitness, Nutrition, Career Development, Night** (+ Sunday Weekly Review section). Items adapt to the day: workout of the day, phase targets, meditation minutes, applications due. **Minimum Day** toggle (8 items). 10 daily numbers (weight, sleep, steps, water, calories, protein, study, applications, mood, stress). |
| **Week** | 15-point weekly scorecard (auto-calculated), daily scores, auto-suggestions (e.g. "weight flat 2 weeks → +150-250 kcal"), and the **Sunday Weekly Review** form. |
| **Plan** | Overview + calorie/macro math, Healthy Lifestyle, Meditation & Mental Fitness, Fitness (4-5 day split, sets/reps/rest, overload, warm-up, cardio, stall rules), Nutrition (Indian meals, grocery list, meal prep), Supplements (useful / optional / unnecessary / risky), Career (ranked skills, 13-week curriculum, projects, interview bank, STAR), Timetable (weekday/Sat/Sun built from your hours), 90-day Roadmap (3 phases) and Minimum Day. Printable to PDF. |
| **Progress** | Monthly measurements, strength tests, weight chart. |
| **Jobs** | Application tracker with statuses and follow-up dates. |

Medical items are flagged with "Discuss with a doctor / registered dietitian" boxes. The app does not recommend medication.

---

## Supported Deployment Stack

Mix and match any combination of the following:

| Layer | Option 1 | Option 2 |
|---|---|---|
| **Frontend** | **Vercel** (`vercel.json` included) | **Cloudflare Pages** (`public/` directory + `_headers`) |
| **Backend API** | **Render** (`render.yaml` blueprint included) | **Koyeb** (`koyeb.yaml` service spec included) |
| **Database** | **Neon** (Serverless Postgres over HTTP) | **Supabase** (PostgREST table storage) |

---

## Deployment Guide

### Direct deployment to Vercel (recommended)

The repository is a single full-stack Vercel app: `public/` serves the frontend and `api/index.js` serves the same-origin API.

1. Import the GitHub repository in Vercel.
2. Keep the Framework Preset as **Other** and leave Build Command / Output Directory empty.
3. Add these environment variables in Vercel:
   - `APP_PASSWORD`: required strong password for the app.
   - `APP_USER`: optional username; defaults to `admin`.
   - One database backend:
     - Neon: `DATABASE_URL=postgresql://...`
     - Supabase: `SUPABASE_URL=...` and `SUPABASE_SERVICE_ROLE_KEY=...`
4. Deploy, then open the assigned `*.vercel.app` URL.
5. When prompted for credentials, use `admin` and your `APP_PASSWORD`.

The API is available at `/api/*` and health is available at `/healthz`. Neon and Supabase data persist between serverless invocations. Local JSON storage is only suitable for local development and is ephemeral on Vercel.

### Step 1: Provision the Database (Neon or Supabase)

#### Option A: Neon Postgres (Recommended)
1. Sign up / log in to [Neon Console](https://console.neon.tech).
2. Create a new project (e.g., `lifeos-db`).
3. Under **Dashboard**, copy your PostgreSQL connection string (`DATABASE_URL`), which looks like:
   `postgresql://alex:AbC123xyz@ep-cool-rain-123456.us-east-2.aws.neon.tech/neondb?sslmode=require`
4. *(Optional)* In Neon's **SQL Editor**, you can run [deploy/neon.sql](deploy/neon.sql) to pre-create the table (the backend will also auto-create it if it doesn't exist).

#### Option B: Supabase
1. Create a project at [Supabase](https://supabase.com).
2. Open **SQL Editor** and run [deploy/supabase.sql](deploy/supabase.sql).
3. Under **Project Settings → API**, copy:
   - **Project URL** (`SUPABASE_URL`)
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY` — keep this secret, only on Render/Koyeb).

---

### Step 2: Deploy the Backend API (Render or Koyeb)

#### Option A: Render
1. Push this repository to your GitHub account.
2. In [Render Dashboard](https://dashboard.render.com), click **New → Blueprint** and select your repository (it will automatically detect [render.yaml](render.yaml)).
3. Fill in the environment variables:
   - `APP_PASSWORD`: your desired strong password for API access.
   - `ALLOWED_ORIGIN`: your frontend URL (e.g. `https://my-lifeos.vercel.app` or `https://my-lifeos.pages.dev`). You can provide comma-separated origins if using multiple.
   - Database:
     - For **Neon**: set `DATABASE_URL` to your Neon connection string.
     - For **Supabase**: set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Click **Apply**. Render will deploy the service and provide a public URL (e.g. `https://lifeos-api.onrender.com`).
5. Verify health: visit `https://lifeos-api.onrender.com/healthz` (should return 200 with `{ status: "ok", database: { backend: "neon" | "supabase" } }`).

#### Option B: Koyeb
1. In [Koyeb Control Panel](https://app.koyeb.com), click **Create App**.
2. Select **GitHub** and choose this repository.
   - It will detect the included [koyeb.yaml](koyeb.yaml) or Dockerfile.
   - Port: `8080`, Health check path: `/healthz`.
3. Set the environment variables:
   - `APP_PASSWORD`: your chosen password.
   - `ALLOWED_ORIGIN`: your frontend domain(s) (e.g. `https://my-lifeos.vercel.app,https://my-lifeos.pages.dev`).
   - For **Neon**: set `DATABASE_URL`.
   - For **Supabase**: set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Click **Deploy**. Koyeb will generate a public URL (e.g. `https://lifeos-api.koyeb.app`).

---

### Step 3: Deploy the Frontend (Vercel or Cloudflare Pages)

#### Option A: Vercel
1. Import your GitHub repository into [Vercel](https://vercel.com).
2. Vercel automatically detects the same-origin frontend and API configuration in [vercel.json](vercel.json).
3. Set `APP_PASSWORD` and `DATABASE_URL` (Neon) or the Supabase environment variables in Project Settings → Environment Variables.
4. Click **Deploy**. Vercel will assign a URL like `https://lifeos-90.vercel.app` with both frontend and API available same-origin.

#### Option B: Cloudflare Pages
1. Go to [Cloudflare Dashboard → Workers & Pages → Create Application → Pages](https://dash.cloudflare.com/).
2. Connect your GitHub repository.
3. Configure build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `public`
4. Click **Save and Deploy**. Cloudflare assigns a URL like `https://lifeos.pages.dev`.
5. Add your Cloudflare Pages URL to your backend's `ALLOWED_ORIGIN` on Render or Koyeb.

---

### Step 4: Connect Frontend to Backend

You have two convenient ways to point the frontend to your backend API:

* **Method 1 (Direct in UI - No redeploy needed)**:
  Open your deployed frontend on Vercel or Cloudflare Pages.
  Click the **⚙️ API** button in the header (or click **Configure API & Auth** in the Profile tab).
  Enter:
  - **Backend API URL**: `https://lifeos-api.onrender.com` or `https://lifeos-api.koyeb.app`
  - **Username**: `admin`
  - **Password**: your `APP_PASSWORD`
  Click **Save & Connect**. Credentials and API URL are saved securely in your browser's `localStorage`.

* **Method 2 (Pre-configured in code)**:
  Before deploying the frontend, edit [public/config.js](public/config.js):
  ```js
  window.LIFEOS_API_BASE = 'https://lifeos-api.onrender.com'; // or https://lifeos-api.koyeb.app
  ```

---

## Local Development & Other Hosts

### Run locally
```bash
node server.js            # http://localhost:8080
# optional with password:
APP_USER=admin APP_PASSWORD=secret node server.js
```

### Self-Hosted on Oracle Cloud (OCI) VM or Docker
- **Ubuntu/Oracle Linux VM**: run `sudo APP_PASSWORD='secret' bash deploy/setup-oci.sh`
- **Docker Compose**: `docker compose up -d --build` (serves on port 80 with persistent volume)

---

## Configuration Reference (Environment Variables)

| Variable | Default | Description |
|---|---|---|
| `PORT` | 8080 | HTTP server port |
| `HOST` | 0.0.0.0 | Bind host address |
| `APP_USER` | admin | Basic Auth username |
| `APP_PASSWORD` | *(empty)* | Basic Auth password (protects data on public backends) |
| `ALLOWED_ORIGIN` | *(empty)* | Comma-separated list of allowed frontend origins (e.g. `https://app.vercel.app,https://app.pages.dev`) or `*` |
| `DATABASE_URL` | *(empty)* | Neon / Postgres connection string (`postgresql://...`) |
| `SUPABASE_URL` | *(empty)* | Supabase project URL (`https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | *(empty)* | Supabase service role secret key |
| `SUPABASE_TABLE` | `lifeos_state` | Table name for state persistence |
| `DATA_DIR` | `./data` | Directory for fallback local `db.json` |

## Notes
- **Zero build dependencies**: Native Node.js 18+ HTTP, fetch, and crypto. No npm compile steps or external database drivers required for Neon or Supabase.
- **Single-user design**: Personal discipline and life-management system. Back up anytime via **Profile → Download backup**.
- **Calorie & training math**: Uses Mifflin-St Jeor formula with customized activity factor and progressive strength splits.
