from flask import Flask

from config import SECRET_KEY, SESSION_PERMANENT
from routes.main_routes import main_bp
from routes.auth_routes import auth_bp
from routes.course_routes import course_bp
from routes.quiz_routes import quiz_bp
from routes.assignment_routes import assignment_bp
from routes.dev_routes import dev_bp


def create_app():
    app = Flask(__name__)
    app.secret_key = SECRET_KEY
    app.config["SESSION_PERMANENT"] = SESSION_PERMANENT

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(course_bp)
    app.register_blueprint(quiz_bp)
    app.register_blueprint(assignment_bp)
    app.register_blueprint(dev_bp)

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
