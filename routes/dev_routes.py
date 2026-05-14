from flask import Blueprint

from services.db2 import get_connection

dev_bp = Blueprint("dev", __name__)


@dev_bp.route("/test-db")
def test_db():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1;")
        result = cur.fetchone()
        cur.close()
        conn.close()
        return {"result": result}
    except Exception as e:
        return {"error": str(e)}
