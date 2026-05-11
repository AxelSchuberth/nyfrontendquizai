# React frontend refactor notes

This refactor only changes frontend files:

- `templates/index.html` is now a minimal Flask template that mounts React into `#root`.
- `static/App.jsx` contains the React application logic and UI.
- `static/style.css` is kept from the original project so the existing visual design is preserved.
- `static/script.js` is left in the project as a backup/reference, but it is no longer loaded by `index.html`.

The backend routes are unchanged. The React app still calls the same Flask endpoints, including:

- `/generate-quiz`
- `/login`
- `/register`
- `/logout`
- `/me`
- `/my-quizzes`
- `/save-result`
- `/get-saved-quiz/<id>`
- `/update-score/<id>`
- `/delete-assignment/<id>`
- `/universities`, `/courses/<id>`, `/materials/<id>`, `/material/<id>`

This version uses CDN-loaded React and Babel so you can run it through your existing Flask app without adding a Vite build step yet. For a production setup, the next step would be moving this into a real Vite project and compiling the React bundle.
