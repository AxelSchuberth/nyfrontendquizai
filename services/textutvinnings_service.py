import pypdf


class TextutvinningsService:

    @staticmethod
    def extract_text_from_pdf(pdf_file) -> str:
        try:
            pdf_file.seek(0)
            reader = pypdf.PdfReader(pdf_file)

            parts = []

            for page_num, page in enumerate(reader.pages, start=1):
                text = page.extract_text()
                if text and text.strip():
                    parts.append(f"[Page {page_num}]\n{text.strip()}")

            return "\n\n".join(parts).strip()

        except pypdf.errors.PdfReadError:
            print("Error: Could not read PDF file.")
            return ""
        except Exception as e:
            print(f"Unexpected error while reading PDF: {e}")
            return ""

    @staticmethod
    def extract_text_from_txt(txt_file) -> str:
        try:
            if hasattr(txt_file, "read"):
                txt_file.seek(0)
                text_bytes = txt_file.read()
                text = text_bytes.decode("utf-8").strip()
                return text

            elif isinstance(txt_file, str):
                with open(txt_file, "r", encoding="utf-8") as f:
                    return f.read().strip()

            else:
                print("Error: Invalid txt input.")
                return ""

        except UnicodeDecodeError:
            print("Error: File must be UTF-8 encoded.")
            return ""
        except Exception as e:
            print(f"Unexpected error while reading txt: {e}")
            return ""