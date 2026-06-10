# MyMovies (CineVault) 🎬

A premium, interactive, living cinematic memory wall that visualizes your watched movie history. Built with a custom GPU-accelerated canvas engine, it features an organic, physics-based magnetic grid effect that expands movie posters dynamically as your cursor dances across the screen.

Designed to showcase your personal movie vault, you can automatically ingest your watch history from Letterboxd and let the wall bring your movie memories back to life.

---

## ✨ Features

- **Magnetic Interactive Grid:** An organic, GPU-accelerated 2D Canvas poster wall that responds dynamically to touch and mouse pointer movement.
- **Spotlight Torch Effect:** A subtle radial cinematic spotlight overlay that tracks the cursor, creating depth and a theater-like atmosphere.
- **Cinematic Detail Panels:** Click on any movie poster to view its rich details (TMDB score, vote counts, genres, release year, language, and overview) in a custom backdrop-blur modal.
- **Automated Letterboxd & TMDB Integration:** A backend script parses your Letterboxd `watched.csv` export, fetches accurate metadata/posters via the TMDB API, and compiles them.
- **Performance Optimized:** Features high-performance render loops, deterministic organic staggering/jittering, image preloading, and fallback support for `prefers-reduced-motion`.
- **Auto Deployments:** Out-of-the-box configuration for GitHub Pages deployment.

---

## 🛠️ Tech Stack

- **Frontend:** Pure HTML5 semantic structure, modern Vanilla CSS (with custom properties, glassmorphism, responsive styles), and Vanilla JavaScript (ES6+).
- **Core Engine:** HTML5 Canvas API with physics-based interpolation (lerping), scale power formulas, deterministic random offsets, and spotlights.
- **Ingestion Script:** Node.js, File System (`fs`), and Fetch API for metadata collection.
- **Data Source:** [The Movie Database (TMDB) API](https://www.themoviedb.org/documentation/api) & [Letterboxd CSV export](https://letterboxd.com/).

---

## 📂 Project Structure

```text
mymovies/
├── index.html          # Web application shell & cinematic modal layout
├── styles.css          # Modern dark-mode styling & layout tokens
├── script.js           # Interactive Canvas rendering & magnetic grid engine
├── fetch_movies.js     # CLI ingestion script to search TMDB & generate movies.json
├── movies.json         # Compiled watched movies registry (loaded by script.js)
├── .github/
│   └── workflows/
│       └── static.yml  # GitHub Actions workflow for deploying to GitHub Pages
└── README.md           # This documentation file
```

---

## 🚀 Getting Started

### 1. Ingesting Your Letterboxd Watched List

To populate the grid with your own watched movies:

1. **Get a TMDB API Token:**
   Create a TMDB account and obtain a Read Access Token (Bearer Token) from your TMDB settings.
   
2. **Export Letterboxd Watch Data:**
   Go to your Letterboxd profile settings, export your data as a ZIP, and extract it. Find the `watched.csv` file.
   
3. **Configure the Ingestion Script:**
   Open [fetch_movies.js](file:///Users/yugjain/Desktop/mymovies/fetch_movies.js) and update the following settings:
   - Line 4: Replace `'YOUR_TMDB_API_TOKEN_HERE'` with your TMDB Bearer Token.
   - Line 29: Update `csvPath` to point to the absolute path of your extracted `watched.csv`.

4. **Run the Ingestion:**
   Run the script with Node.js to populate `movies.json`:
   ```bash
   node fetch_movies.js
   ```

### 2. Running the Application Locally

Since the frontend uses `fetch` to retrieve `movies.json`, it must be run from a local web server to prevent CORS issues.

You can use any simple HTTP server. For example:

- Using **Python**:
  ```bash
  python3 -m http.server 8000
  ```
  Open `http://localhost:8000` in your browser.

- Using **Node.js (npx)**:
  ```bash
  npx serve .
  ```
  Open the provided localhost URL in your browser.

---

## 🎨 Interactive Layout Customization

All physical behaviors and layout properties can be customized directly in the `TOKENS` object inside [script.js](file:///Users/yugjain/Desktop/mymovies/script.js):

- **`grid.stepXD` / `stepYD`:** Controls columns and row spacing on desktop.
- **`grid.jitter`:** Maximum random offset applied to grid positions to make the grid feel organic rather than rigid.
- **`field.radiusFraction`:** The relative mouse pointer influence range.
- **`field.scalePower`:** The exponential curve parameter of the poster expansion. Higher numbers create more dramatic/sudden expansions.
- **`opacity` / `spotlight`:** Controls minimum/maximum opacity values, spotlight brightness, and viewport edge shadowing.

---

## 🌐 Deploying to GitHub Pages

The project includes a GitHub Actions workflow that automatically builds and deploys your cinematic memory wall on every push to the `master` branch:

1. Push your repository to GitHub.
2. In your repository settings on GitHub, navigate to **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. The workflow will run automatically and host your site on `https://<your-username>.github.io/<repository-name>/`.
