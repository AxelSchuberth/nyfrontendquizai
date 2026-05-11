import psycopg2


def get_connection():
    return psycopg2.connect(
        host="aws-0-eu-west-1.pooler.supabase.com",
        database="postgres",
        user="postgres.ckwfsakidrsjlsiwgyng",
        password="5rMldH4d3IspLGdD",
        port=5432,
        sslmode="require"
    )