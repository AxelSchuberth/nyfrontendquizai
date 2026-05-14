from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash

from services.db2 import get_connection
from utils.auth_utils import is_password_hash

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT user_id, user_name, email, password
            FROM users
            WHERE user_name = %s
        """, (username,))

        user = cur.fetchone()

        if not user:
            cur.close()
            conn.close()
            return jsonify({"error": "Invalid username or password"}), 401

        stored_password = user[3]
        valid_password = False

        if is_password_hash(stored_password):
            valid_password = check_password_hash(stored_password, password)
        else:
            # Temporary compatibility for old plain-text passwords.
            # If login succeeds, immediately upgrade the stored password to a hash.
            valid_password = stored_password == password

            if valid_password:
                new_password_hash = generate_password_hash(password)
                cur.execute("""
                    UPDATE users
                    SET password = %s
                    WHERE user_id = %s
                """, (new_password_hash, user[0]))
                conn.commit()

        cur.close()
        conn.close()

        if not valid_password:
            return jsonify({"error": "Invalid username or password"}), 401

        session.permanent = False
        session["user_id"] = user[0]
        session["user_name"] = user[1]

        return jsonify({
            "success": True,
            "user": {
                "id": user[0],
                "user_name": user[1],
                "email": user[2]
            }
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})


@auth_bp.route("/me", methods=["GET"])
def me():
    if "user_id" not in session:
        return jsonify({"logged_in": False})

    return jsonify({
        "logged_in": True,
        "user": {
            "id": session["user_id"],
            "user_name": session["user_name"]
        }
    })


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    username = data.get("username", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "").strip()

    if not username or not email or not password:
        return jsonify({"error": "Username, email, and password are required"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM users WHERE user_name = %s", (username,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Username already exists"}), 409

        cur.execute("SELECT 1 FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Email already exists"}), 409

        password_hash = generate_password_hash(password)

        cur.execute("""
            INSERT INTO users (user_name, email, password)
            VALUES (%s, %s, %s)
            RETURNING user_id, user_name, email
        """, (username, email, password_hash))

        new_user = cur.fetchone()
        conn.commit()

        cur.close()
        conn.close()

        session["user_id"] = new_user[0]
        session["user_name"] = new_user[1]

        return jsonify({
            "success": True,
            "user": {
                "id": new_user[0],
                "user_name": new_user[1],
                "email": new_user[2]
            }
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500
