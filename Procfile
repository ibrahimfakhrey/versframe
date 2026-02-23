web: flask db upgrade && gunicorn --worker-class gevent -w 1 --bind 0.0.0.0:$PORT run:app
