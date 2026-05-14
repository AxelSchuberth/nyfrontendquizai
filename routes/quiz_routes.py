from flask import Blueprint, request, jsonify
import json

from services.quiz_service import generate_quiz
from services.textutvinnings_service import TextutvinningsService
from utils.file_utils import allowed_file

quiz_bp = Blueprint("quiz", __name__)


@quiz_bp.route("/generate-quiz", methods=["POST"])
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
        return jsonify({"error": "You must upload at least one file or choose library material."}), 400

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
