# CodeAlpha Task 2 — Social Media Platform

A complete beginner-friendly full-stack social media app built with **HTML, CSS, vanilla JavaScript, Node.js, Express, and SQLite**. It implements the Task 2 requirements in the provided CodeAlpha task sheet.

## Features

- Account registration, sign-in, sign-out, hashed passwords, and session-based authentication.
- User profiles with editable display name, bio, and optional HTTPS avatar URL.
- Create posts and view a shared chronological feed.
- Like/unlike posts and add comments.
- Search people by display name or username; open profiles and follow/unfollow users.
- SQLite persistence for users, posts, comments, likes, and followers.
- Responsive dark UI, client-side form handling, basic input validation, and API error messages.

## Requirements

- Node.js 18 or newer and npm.
- `better-sqlite3` may need native build tools on some platforms if a prebuilt package is unavailable. On Windows, use a current Node.js LTS release and install the package build prerequisites if npm requests them.

## Run locally

1. Extract the ZIP and open a terminal in `CodeAlpha_Task2_Social_Media`.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env`. Set `SESSION_SECRET` to a long random value.
4. Start the server:

   ```bash
   npm start
   ```

5. Open **http://localhost:3000** in your browser and create an account.

The SQLite database is created automatically at `data/social_media.db` on first launch. No separate database installation or seed step is required. The app is more useful if you register two accounts in separate browser sessions to try following and profiles.

## Main folders

- `server.js` — Express API, session authentication, SQLite schema, and data operations.
- `public/index.html` — page markup.
- `public/styles.css` — responsive visual design.
- `public/app.js` — browser-side UI and API calls.
- `data/` — auto-created local database location.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/me`, `GET /api/feed`, `POST /api/posts`
- `POST /api/posts/:id/like`, `POST /api/posts/:id/comments`
- `PUT /api/profile`, `GET /api/users/search?q=...`, `GET /api/users/:username`
- `POST /api/users/:id/follow`

## Notes

This is an internship/demo project, not a production deployment. Express's default in-memory session store is used to keep setup simple; it is not suitable for production. For deployment, configure a persistent session store, HTTPS, a strong secret, rate limiting, CSRF protections appropriate to the deployment, logging, and backups. Google Fonts are optional styling; if offline, system fonts will be used.
