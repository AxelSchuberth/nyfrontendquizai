from flask import Blueprint, jsonify
import io
import os
from urllib.parse import quote

import requests

from config import SUPABASE_BUCKET_NAME, SUPABASE_PROJECT_REF
from services.db2 import get_connection
from services.textutvinnings_service import TextutvinningsService

course_bp = Blueprint("course", __name__)


def build_supabase_file_url(file_path):
    """Build a public Supabase Storage URL from a DB file_path value.

    Supports both:
    - plain object paths stored in the DB, e.g. "folder/file name.pdf"
    - paths that accidentally include the bucket, e.g. "Materials/folder/file.pdf"
    - full URLs, e.g. "https://.../storage/v1/object/public/Materials/file.pdf"
    """
    if not file_path:
        return ""

    normalized_path = str(file_path).strip()

    if normalized_path.startswith(("http://", "https://")):
        return normalized_path

    normalized_path = normalized_path.lstrip("/")

    bucket_prefix = f"{SUPABASE_BUCKET_NAME}/"
    if normalized_path.startswith(bucket_prefix):
        normalized_path = normalized_path[len(bucket_prefix):]

    encoded_path = quote(normalized_path, safe="/")

    return (
        f"https://{SUPABASE_PROJECT_REF}.supabase.co/storage/v1/object/public/"
        f"{SUPABASE_BUCKET_NAME}/{encoded_path}"
    )


def extract_text_from_downloaded_file(file_bytes, file_path):
    """Extract text based on the downloaded file extension."""
    extension = os.path.splitext(str(file_path).split("?")[0])[1].lower()
    file_obj = io.BytesIO(file_bytes)

    if extension == ".txt":
        return TextutvinningsService.extract_text_from_txt(file_obj)

    # The course library has primarily used PDFs. Defaulting to PDF keeps
    # backwards compatibility for old DB rows without a clear extension.
    return TextutvinningsService.extract_text_from_pdf(file_obj)


@course_bp.route("/universities", methods=["GET"])
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


@course_bp.route("/courses/<int:university_id>", methods=["GET"])
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


@course_bp.route("/materials/<int:course_id>", methods=["GET"])
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


@course_bp.route("/material/<int:material_id>", methods=["GET"])
def get_single_material(material_id):
    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT material_id, title, file_path
            FROM materials
            WHERE material_id = %s
        """, (material_id,))
        row = cur.fetchone()

        if not row:
            return jsonify({"error": "Material not found"}), 404

        mat_id, title, file_path = row

        if not file_path:
            return jsonify({"error": "This material does not have a file path in the database."}), 404

        file_url = build_supabase_file_url(file_path)
        response = requests.get(file_url, timeout=30)

        if response.status_code != 200:
            return jsonify({
                "error": f"Could not fetch the file from Supabase. Status: {response.status_code}"
            }), 404

        extracted_text = extract_text_from_downloaded_file(response.content, file_path)

        if not extracted_text.strip():
            return jsonify({
                "error": "The material file was found, but no readable text could be extracted."
            }), 422

        return jsonify({
            "id": mat_id,
            "title": title,
            "content": extracted_text
        })

    except requests.RequestException as e:
        return jsonify({"error": f"Could not connect to Supabase Storage: {str(e)}"}), 502

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
