"""
wsgi.py – entry point for gunicorn on Render
"""
from app.main import app

if __name__ == "__main__":
    app.run()
