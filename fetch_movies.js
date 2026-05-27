const fs = require('fs');
const readline = require('readline');

const TMDB_TOKEN = 'YOUR_TMDB_API_TOKEN_HERE';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/';

async function tmdbGet(path) {
  const url = `${TMDB_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${TMDB_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    if (res.status === 429) {
      // Rate limit, wait and retry
      await new Promise(r => setTimeout(r, 1000));
      return tmdbGet(path);
    }
    throw new Error(`TMDB ${res.status}: ${path}`);
  }
  return res.json();
}

async function run() {
  // Read CSV
  const csvPath = '/Users/yugjain/Downloads/letterboxd-yugjain-2026-05-27-15-29-utc/watched.csv';
  const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
  
  // Skip header
  lines.shift();
  
  let moviesList = [];
  const ENDPOINT = '/search/movie';
  
  console.log(`Found ${lines.length} lines in CSV.`);

  // We can fetch genres to map them
  let genreMap = {};
  try {
    const genresData = await tmdbGet('/genre/movie/list?language=en');
    for (const g of genresData.genres) {
      genreMap[g.id] = g.name;
    }
    console.log('Fetched genres.');
  } catch (err) {
    console.error('Error fetching genres:', err.message);
  }

  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Parse CSV line correctly
    // Date,Name,Year,Letterboxd URI
    // Name might contain commas.
    // Use a simple regex to match fields.
    const fields = line.split(',');
    if (fields.length < 4) continue;
    
    let year = fields[fields.length - 2];
    let title = fields.slice(1, fields.length - 2).join(',').replace(/^"|"$/g, '');
    
    // If year is not a number, maybe it's missing or format is different
    if (isNaN(year) || year.length !== 4) {
       console.log(`Skipping invalid row: ${line}`);
       continue;
    }

    try {
      // url encode query
      const query = encodeURIComponent(title);
      const path = `${ENDPOINT}?query=${query}&year=${year}&language=en-US&page=1`;
      
      const searchRes = await tmdbGet(path);
      const results = searchRes.results;
      
      if (results && results.length > 0) {
        const m = results[0];
        moviesList.push({
          id: m.id,
          title: m.title,
          year: m.release_date ? m.release_date.slice(0, 4) : '—',
          language: (m.original_language || 'en').toUpperCase(),
          genreIds: m.genre_ids || [],
          rating: m.vote_average ? m.vote_average.toFixed(1) : 'N/A',
          votes: m.vote_count || 0,
          overview: m.overview || '',
          posterGrid: m.poster_path ? `${TMDB_IMG}w342${m.poster_path}` : null,
          posterModal: m.poster_path ? `${TMDB_IMG}w500${m.poster_path}` : null,
        });
        console.log(`Fetched: ${title} (${year})`);
      } else {
        console.log(`Not found on TMDB: ${title} (${year})`);
      }
      
      // Delay to avoid rate limit
      await new Promise(r => setTimeout(r, 100));
      
    } catch (err) {
      console.error(`Error searching for ${title}:`, err.message);
    }
  }
  
  // Save movies.json
  fs.writeFileSync('movies.json', JSON.stringify({ genreMap, movies: moviesList }, null, 2));
  console.log(`Saved ${moviesList.length} movies to movies.json`);
}

run().catch(console.error);
