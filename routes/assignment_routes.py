from flask import Blueprint, request, jsonify, session

from services.db2 import get_connection

assignment_bp = Blueprint("assignment", __name__)


@assignment_bp.route("/save-result", methods=["POST"])
def save_result():
    if "user_id" not in session:
        return jsonify({"error": "You must be logged in to save results"}), 401

    data = request.get_json()

    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    assignment_name = data.get("assignment_name", "Quiz")
    total_questions = data.get("total_questions")
    correct_questions = data.get("correct_questions")
    star_rating = data.get("star_rating", 0)
    questions_to_save = data.get("questions", [])

    if total_questions is None or correct_questions is None:
        return jsonify({"error": "Missing required fields"}), 400

    if total_questions == 0:
        return jsonify({"error": "total_questions cannot be 0"}), 400

    correct_percent = (correct_questions / total_questions) * 100

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO assignment (
                assignment_name, total_questions, correct_questions,
                correct_percent, date, star_rating, user_id
            )
            VALUES (%s, %s, %s, %s, NOW(), %s, %s)
            RETURNING assignment_id
        """, (
            assignment_name, total_questions, correct_questions,
            correct_percent, star_rating, session["user_id"]
        ))

        assignment_id = cur.fetchone()[0]

        for q in questions_to_save:
            opts = q.get("options", [])

            cur.execute("""
                INSERT INTO questions (
                    assignment_id, question_text, option_a, option_b,
                    option_c, option_d, correct_option, hint, explanation, source
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                assignment_id,
                q.get("question"),
                opts[0] if len(opts) > 0 else None,
                opts[1] if len(opts) > 1 else None,
                opts[2] if len(opts) > 2 else None,
                opts[3] if len(opts) > 3 else None,
                int(q.get("correct", 0)),
                q.get("hint"),
                q.get("explanation"),
                q.get("source")
            ))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            "success": True,
            "assignment_id": assignment_id
        })

    except Exception as e:
        if "conn" in locals():
            conn.rollback()
        return jsonify({"error": str(e)}), 500


@assignment_bp.route("/get-saved-quiz/<int:assignment_id>", methods=["GET"])
def get_saved_quiz(assignment_id):
    if "user_id" not in session:
        return jsonify({"error": "You must be logged in"}), 401

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
                q.correct_option, q.hint, q.explanation, q.source
            FROM questions q
            JOIN assignment a ON q.assignment_id = a.assignment_id
            WHERE a.assignment_id = %s AND a.user_id = %s
            ORDER BY q.question_id ASC
        """, (assignment_id, session["user_id"]))

        rows = cur.fetchall()
        cur.close()
        conn.close()

        if not rows:
            return jsonify({"error": "Quiz not found or you don't have access"}), 404

        formatted_questions = []
        for row in rows:
            options = [row[1], row[2], row[3], row[4]]
            clean_options = [opt for opt in options if opt is not None]

            formatted_questions.append({
                "question": row[0],
                "options": clean_options,
                "correct": row[5],
                "hint": row[6],
                "explanation": row[7],
                "source": row[8]
            })

        return jsonify(formatted_questions)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@assignment_bp.route("/update-score/<int:assignment_id>", methods=["PUT"])
def update_score(assignment_id):
    if "user_id" not in session:
        return jsonify({"error": "You must be logged in"}), 401

    data = request.get_json()

    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    total_questions = data.get("total_questions")
    correct_questions = data.get("correct_questions")

    if total_questions is None or correct_questions is None or total_questions == 0:
        return jsonify({"error": "Invalid score data"}), 400

    correct_percent = (correct_questions / total_questions) * 100

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            UPDATE assignment
            SET correct_questions = %s,
                correct_percent = %s,
                date = NOW()
            WHERE assignment_id = %s AND user_id = %s
            RETURNING assignment_id
        """, (
            correct_questions,
            correct_percent,
            assignment_id,
            session["user_id"]
        ))

        updated = cur.fetchone()

        if not updated:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({"error": "Quiz not found or you don't have access"}), 404

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"success": True})

    except Exception as e:
        if "conn" in locals():
            conn.rollback()
        return jsonify({"error": str(e)}), 500


@assignment_bp.route("/update-assignment/<int:assignment_id>", methods=["PUT"])
def update_assignment(assignment_id):
    if "user_id" not in session:
        return jsonify({"error": "You must be logged in"}), 401

    data = request.get_json()

    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    assignment_name = data.get("assignment_name", "").strip()
    star_rating = data.get("star_rating")

    if not assignment_name:
        return jsonify({"error": "Quiz name cannot be empty"}), 400

    try:
        star_rating = int(star_rating)
    except Exception:
        return jsonify({"error": "Invalid rating"}), 400

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            UPDATE assignment
            SET assignment_name = %s,
                star_rating = %s
            WHERE assignment_id = %s AND user_id = %s
            RETURNING assignment_id
        """, (
            assignment_name,
            star_rating,
            assignment_id,
            session["user_id"]
        ))

        updated = cur.fetchone()

        if not updated:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({"error": "Quiz not found or you don't have access"}), 404

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"success": True})

    except Exception as e:
        if "conn" in locals():
            conn.rollback()
        return jsonify({"error": str(e)}), 500


@assignment_bp.route("/delete-assignment/<int:assignment_id>", methods=["DELETE"])
def delete_assignment(assignment_id):
    if "user_id" not in session:
        return jsonify({"error": "You must be logged in"}), 401

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            DELETE FROM assignment
            WHERE assignment_id = %s AND user_id = %s
            RETURNING assignment_id
        """, (
            assignment_id,
            session["user_id"]
        ))

        deleted = cur.fetchone()

        if not deleted:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({"error": "Quiz not found or you don't have access"}), 404

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"success": True})

    except Exception as e:
        if "conn" in locals():
            conn.rollback()
        return jsonify({"error": str(e)}), 500


@assignment_bp.route("/my-quizzes", methods=["GET"])
def my_quizzes():
    if "user_id" not in session:
        return jsonify({"error": "You must be logged in"}), 401

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                assignment_id, assignment_name, total_questions,
                correct_questions, correct_percent, date, star_rating
            FROM assignment
            WHERE user_id = %s
            ORDER BY date DESC
        """, (session["user_id"],))

        rows = cur.fetchall()

        cur.close()
        conn.close()

        quizzes = []
        for row in rows:
            quizzes.append({
                "id": row[0],
                "name": row[1],
                "numQuestions": row[2],
                "correctQuestions": row[3],
                "scorePercent": round(float(row[4])),
                "date": row[5].strftime("%Y-%m-%d") if row[5] else "",
                "rating": row[6] if row[6] is not None else 0
            })

        return jsonify({"quizzes": quizzes})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
