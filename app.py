from flask import Flask, render_template, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from services.quiz_service import generate_quiz
from services.textutvinnings_service import TextutvinningsService
from services.db2 import get_connection
import json
import io
import requests
from urllib.parse import quote

app = Flask(__name__)
app.secret_key = "change-this-to-a-random-secret-key"

ALLOWED_EXTENSIONS = {"pdf", "txt"}

app.config["SESSION_PERMANENT"] = False


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def is_password_hash(stored_password):
    if not stored_password:
        return False

    return (
        stored_password.startswith("scrypt:")
        or stored_password.startswith("pbkdf2:")
        or stored_password.startswith("argon2:")
    )


@app.route("/")
def home():
    return render_template("index.html")


# ------------------- LOGIN -------------------

@app.route("/login", methods=["POST"])
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


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})


@app.route("/me", methods=["GET"])
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


# ------------------- REGISTER -------------------

@app.route("/register", methods=["POST"])
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


# ------------------- COURSE LIBRARY -------------------

@app.route("/universities", methods=["GET"])
def get_universities():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT university_id, name
            FROM universities
            ORDER BY name ASC
        """)
        rows = cur.fetchall()

        cur.close()
        conn.close()

        universities = [
            {"id": row[0], "name": row[1]}
            for row in rows
        ]

        return jsonify(universities)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/courses/<int:university_id>", methods=["GET"])
def get_courses(university_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT course_id, name
            FROM courses
            WHERE university_id = %s
            ORDER BY name ASC
        """, (university_id,))
        rows = cur.fetchall()

        cur.close()
        conn.close()

        courses = [
            {"id": row[0], "name": row[1]}
            for row in rows
        ]

        return jsonify(courses)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/materials/<int:course_id>", methods=["GET"])
def get_materials(course_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT material_id, title
            FROM materials
            WHERE course_id = %s
            ORDER BY title ASC
        """, (course_id,))
        rows = cur.fetchall()

        cur.close()
        conn.close()

        materials = [
            {"id": row[0], "title": row[1] if row[1] else "Untitled material"}
            for row in rows
        ]

        return jsonify(materials)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/material/<int:material_id>", methods=["GET"])
def get_single_material(material_id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT material_id, title, file_path
            FROM materials
            WHERE material_id = %s
        """, (material_id,))
        row = cur.fetchone()

        cur.close()
        conn.close()

        if not row:
            return jsonify({"error": "Material not found"}), 404

        mat_id, title, file_path = row
        extracted_text = ""

        if file_path:
            BUCKET_NAME = "Materials"
            SUPABASE_PROJECT_REF = "ckwfsakidrsjlsiwgyng"
            safe_file_path = quote(file_path)
            file_url = f"https://{SUPABASE_PROJECT_REF}.supabase.co/storage/v1/object/public/{BUCKET_NAME}/{safe_file_path}"

            response = requests.get(file_url)

            if response.status_code == 200:
                pdf_file = io.BytesIO(response.content)
                extracted_text = TextutvinningsService.extract_text_from_pdf(pdf_file)
            else:
                return jsonify({"error": f"Kunde inte hämta filen från Supabase. Status: {response.status_code}"}), 404

        return jsonify({
            "id": mat_id,
            "title": title,
            "content": extracted_text
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------- GENERATE QUIZ -------------------

@app.route("/generate-quiz", methods=["POST"])
def generate():
    extra_instructions = request.form.get("extraInstructions", "")
    num = int(request.form.get("num", 5))
    difficulty = request.form.get("difficulty", "Medium")
    language = request.form.get("language", "Auto")
    question_type = request.form.get("type", "MCQ")

    combined_text = ""
    document_count = 0

    library_materials_json = request.form.get("libraryMaterials", "[]")

    try:
        library_materials = json.loads(library_materials_json)
        for mat in library_materials:
            mat_content = mat.get("content", "").strip()
            if mat_content:
                document_count += 1
                mat_title = mat.get("title", "Library material")
                combined_text += f"\n\n=== DOCUMENT {document_count}: {mat_title} ===\n{mat_content}"
    except Exception as e:
        print("Error parsing library materials:", e)

    if "files" in request.files:
        uploaded_files = request.files.getlist("files")

        for file in uploaded_files:
            if not file or file.filename == "":
                continue

            if not allowed_file(file.filename):
                return jsonify({"error": f"File type for '{file.filename}' is not supported."}), 400

            ext = file.filename.rsplit(".", 1)[1].lower()

            try:
                if ext == "pdf":
                    extracted_text = TextutvinningsService.extract_text_from_pdf(file)
                elif ext == "txt":
                    extracted_text = TextutvinningsService.extract_text_from_txt(file)
                else:
                    return jsonify({"error": f"File type '{ext}' is not implemented."}), 400

                if extracted_text and extracted_text.strip():
                    document_count += 1
                    combined_text += f"\n\n=== DOCUMENT {document_count}: {file.filename} ===\n{extracted_text}"

            except Exception as e:
                return jsonify({"error": f"Could not read file '{file.filename}': {str(e)}"}), 400

    if not combined_text.strip():
        return jsonify({"error": "You must upload at least one file, choose library material."}), 400

    try:
        quiz = generate_quiz(
            combined_text,
            num=num,
            difficulty=difficulty,
            language=language,
            question_type=question_type,
            extra_instructions=extra_instructions,
            document_count=document_count
        )

        print(json.dumps(quiz, ensure_ascii=False, indent=2))
        return jsonify(quiz)

    except Exception as e:
        return jsonify({"error": f"An error occurred while generating the quiz: {str(e)}"}), 500


# ------------------- SAVE & REVIEW SAVED QUIZ -------------------

@app.route("/save-result", methods=["POST"])
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


@app.route("/get-saved-quiz/<int:assignment_id>", methods=["GET"])
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


@app.route("/update-score/<int:assignment_id>", methods=["PUT"])
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


@app.route("/update-assignment/<int:assignment_id>", methods=["PUT"])
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
    except:
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


@app.route("/delete-assignment/<int:assignment_id>", methods=["DELETE"])
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


# ------------------- GET USER QUIZZES -------------------

@app.route("/my-quizzes", methods=["GET"])
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


# ------------------- TEST DB -------------------

@app.route("/test-db")
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


# ------------------- RUN -------------------

if __name__ == "__main__":
    app.run(debug=True)