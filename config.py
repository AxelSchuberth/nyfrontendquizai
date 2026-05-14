import os

# Keep these values here so route files do not contain project-level configuration.
# For production, set SECRET_KEY as an environment variable instead of using the fallback.
SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-to-a-random-secret-key")
SESSION_PERMANENT = False

ALLOWED_EXTENSIONS = {"pdf", "txt"}

SUPABASE_BUCKET_NAME = "Materials"
SUPABASE_PROJECT_REF = "ckwfsakidrsjlsiwgyng"
