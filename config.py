import os
from dotenv import load_dotenv

load_dotenv()

# Keep these values here so route files do not contain project-level configuration.
# For production, set SECRET_KEY as an environment variable instead of using the fallback.
SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-to-a-random-secret-key")
SESSION_PERMANENT = False

ALLOWED_EXTENSIONS = {"pdf", "txt"}

SUPABASE_BUCKET_NAME = "Materials"
SUPABASE_PROJECT_REF = "ckwfsakidrsjlsiwgyng"


def _get_required_env(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


DB_HOST = _get_required_env("DB_HOST")
DB_NAME = os.environ.get("DB_NAME", "postgres")
DB_USER = _get_required_env("DB_USER")
DB_PASSWORD = _get_required_env("DB_PASSWORD")
DB_PORT = int(os.environ.get("DB_PORT", "5432"))
DB_SSLMODE = os.environ.get("DB_SSLMODE", "require")
