from openai import OpenAI
import json
import os
from dotenv import load_dotenv
load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def generate_quiz(
    text,
    num=5,
    difficulty="Medium",
    language="Swedish",
    question_type="MCQ",
    extra_instructions="",
    document_count=1
):
    extra_part = ""
    if extra_instructions and extra_instructions.strip():
        extra_part = f"""
Extra instructions from the user:
{extra_instructions}
"""

    document_part = f"""
The uploaded material contains {document_count} document(s).

Important:
- You MUST create questions using multiple different documents when possible.
- Do NOT take all questions from only the first document.
- Spread the questions across the uploaded documents as evenly as possible.
- Use the document labels exactly as written in the material, for example:
  "filename.pdf"
- If page labels exist, include them in the source too, for example:
  "lecture2.pdf, Page 3"
"""

    if question_type == "T/F":
        options_description = (
            'Exactly 2 options. '
            'If language is Swedish, use ["Sant", "Falskt"]. '
            'If language is English, use ["True", "False"].'
        )
        options_min = 2
        options_max = 2
        correct_min = 0
        correct_max = 1
        task_text = f"You will create exactly {num} true/false questions based on the text below."
    else:
        options_description = "Exactly 4 options. Only one correct answer."
        options_min = 4
        options_max = 4
        correct_min = 0
        correct_max = 3
        task_text = f"You will create exactly {num} multiple choice questions based on the text below."

    prompt = f"""
{task_text}

Requirements:
- Language: {language}
- If Language is Auto, detect the main language of the provided material and generate ALL quiz content in that language.
- Do not mix languages in the quiz title, questions, options, hints, explanations, or answer alternatives.
- If the material contains multiple languages, use the language that appears most frequently overall.
- Never mix languages inside the same quiz.
- Difficulty: {difficulty}
- Generate a short, relevant, and catchy title for the quiz based on the content and language. Return it in the field "quiz_title".
- Return exactly {num} questions, no more and no fewer
- {options_description}
- "correct" must be an integer in the valid range
- A hint must always be included
- The hint must help the user reason toward the answer
- The hint must not reveal the correct answer directly
- An explanation must always be included
- A source must always be included in the field "source"
- The source must refer to the exact document label used in the text
- If a page is clearly used, include the page too
- Return only data matching the required schema

{document_part}
{extra_part}

TEXT:
{text}
"""

    schema = {
        "name": "quiz_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "quiz_title": {
                    "type": "string",
                    "description": "A short, relevant title for this quiz based on the provided text."
                },
                "questions": {
                    "type": "array",
                    "minItems": num,
                    "maxItems": num,
                    "items": {
                        "type": "object",
                        "properties": {
                            "question": {"type": "string"},
                            "options": {
                                "type": "array",
                                "minItems": options_min,
                                "maxItems": options_max,
                                "items": {"type": "string"}
                            },
                            "correct": {
                                "type": "integer",
                                "minimum": correct_min,
                                "maximum": correct_max
                            },
                            "hint": {"type": "string"},
                            "explanation": {"type": "string"},
                            "source": {"type": "string"}
                        },
                        "required": [
                            "question",
                            "options",
                            "correct",
                            "hint",
                            "explanation",
                            "source"
                        ],
                        "additionalProperties": False
                    }
                }
            },
            "required": ["quiz_title", "questions"],
            "additionalProperties": False
        }
    }

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "Generate quiz data that exactly matches the provided JSON schema."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        response_format={
            "type": "json_schema",
            "json_schema": schema
        }
    )

    content = response.choices[0].message.content.strip()

    try:
        parsed = json.loads(content)
        questions = parsed["questions"]
        quiz_title = parsed["quiz_title"]

        if len(questions) != num:
            raise ValueError(f"Expected {num} questions, got {len(questions)}")

        # Returnerar nu BÅDE titeln och frågorna
        return {
            "title": quiz_title,
            "questions": questions
        }

    except Exception:
        print("MODEL RETURNED:", content)
        return []