# Flask Blueprint Refactor

Drag these files and folders into your project root, replacing your current `app.py`.

This refactor keeps the same endpoint URLs, so your current frontend should not need endpoint changes.

## New structure

```txt
app.py
config.py
routes/
  __init__.py
  main_routes.py
  auth_routes.py
  course_routes.py
  quiz_routes.py
  assignment_routes.py
  dev_routes.py
utils/
  __init__.py
  auth_utils.py
  file_utils.py
```

## What moved

- `/` moved to `routes/main_routes.py`
- `/login`, `/logout`, `/me`, `/register` moved to `routes/auth_routes.py`
- Course library routes moved to `routes/course_routes.py`
- `/generate-quiz` moved to `routes/quiz_routes.py`
- Saved quiz/result routes moved to `routes/assignment_routes.py`
- `/test-db` moved to `routes/dev_routes.py`
- `allowed_file()` moved to `utils/file_utils.py`
- `is_password_hash()` moved to `utils/auth_utils.py`
- Hardcoded constants moved to `config.py`

## Run

Use the same command as before:

```bash
python app.py
```

## Notes

Your existing `services/`, `templates/`, and `static/` folders should remain where they are.
